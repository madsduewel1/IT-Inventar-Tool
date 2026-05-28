const express = require('express');
const axios = require('axios');
const prisma = require('../config/prisma');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

const allowedKeys = [
  'app.url',
  'app.locale',
  'org.name',
  'org.email',
  'org.logo',
  'label.widthMm',
  'label.heightMm',
  'ui.defaultView',
  'loans.defaultDueDays',
  'notifications.overdueEnabled',
  'sso.enabled',
  'sso.provider',
  'sso.clientId',
  'sso.clientSecret',
  'sso.issuerUrl',
  'sso.redirectUri',
  'sso.buttonLabel',
  'sso.force',
  'sso.groupSource',
  'sso.adminApiUrl',
  'sso.adminApiToken',
  'sso.groupClaim',
  'sso.availableGroups',
  'sso.groupMappings',
  'login.infoText',
  'mail.smtp.host',
  'mail.smtp.port',
  'mail.smtp.user',
  'mail.smtp.pass',
  'mail.smtp.from',
  'mail.smtp.secure',
  'mail.imap.host',
  'mail.imap.port',
  'mail.imap.user',
  'mail.imap.pass',
  'mail.dkim.domain',
  'mail.dkim.selector',
  'mail.dkim.privateKey'
];

router.get('/public', async (req, res, next) => {
  try {
    const keys = ['org.name', 'org.logo', 'label.widthMm', 'label.heightMm', 'sso.enabled', 'sso.force', 'sso.buttonLabel', 'login.infoText'];
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    res.json({ settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) });
  } catch (error) {
    next(error);
  }
});

router.use(auth, requireRole('ADMIN'));

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeGroups(payload) {
  if (Array.isArray(payload)) {
    return payload.map((group) => {
      if (typeof group === 'string') return group;
      return group?.path || group?.name || group?.group_name || group?.slug || group?.id;
    }).filter(Boolean).map(String);
  }

  if (payload?.results) return normalizeGroups(payload.results);
  if (payload?.groups) return normalizeGroups(payload.groups);
  if (payload?.data) return normalizeGroups(payload.data);
  return [];
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    const entries = Object.entries(req.body || {}).filter(([key]) => allowedKeys.includes(key));
    await prisma.$transaction(entries.map(([key, value]) => prisma.setting.upsert({
      where: { key },
      update: { value: String(value ?? '') },
      create: { key, value: String(value ?? '') }
    })));
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    res.json({ settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) });
  } catch (error) {
    next(error);
  }
});

router.post('/sso/groups/sync', async (req, res, next) => {
  try {
    const rows = await prisma.setting.findMany();
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const adminApiUrl = req.body?.adminApiUrl || settings['sso.adminApiUrl'];
    const adminApiToken = req.body?.adminApiToken || settings['sso.adminApiToken'];

    if (!adminApiUrl) {
      return res.status(400).json({ error: 'Admin-API-URL fehlt', code: 'SSO_GROUP_SYNC_MISSING_URL' });
    }

    const response = await axios.get(adminApiUrl, {
      headers: {
        ...(adminApiToken ? { Authorization: `Bearer ${adminApiToken}` } : {}),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 12000
    });
    const groups = Array.from(new Set(normalizeGroups(response.data))).sort((a, b) => a.localeCompare(b));

    await prisma.setting.upsert({
      where: { key: 'sso.availableGroups' },
      update: { value: JSON.stringify(groups) },
      create: { key: 'sso.availableGroups', value: JSON.stringify(groups) }
    });

    const savedMappings = parseJson(settings['sso.groupMappings'], []);
    res.json({ groups, mappings: savedMappings });
  } catch (error) {
    if (error.response) {
      return res.status(502).json({ error: 'SSO-Gruppen konnten nicht geladen werden', code: 'SSO_GROUP_SYNC_FAILED' });
    }
    return next(error);
  }
});

module.exports = router;
