const express = require('express');
const axios = require('axios');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../services/permissions');

const { resetTransporter } = require('../services/mailer');
const { invalidateSetting } = require('../services/settingsCache');

const router = express.Router();

const allowedKeys = [
  'app.url',
  'app.locale',
  'org.name',
  'org.email',
  'org.logo',
  'org.favicon',
  'label.logo',
  'label.widthMm',
  'label.heightMm',
  'label.marginTopMm',
  'label.marginBottomMm',
  'label.marginLeftMm',
  'label.marginRightMm',
  'ui.defaultView',
  'loans.defaultDueDays',
  // Ticket-Einstellungen: welche Prioritätsgruppen ein Gerät nur einschränken
  // und welche es defekt machen (siehe services/deviceCondition.js).
  'tickets.restrictedPriorities',
  'tickets.defectPriorities',
  // Ticket-Benachrichtigungen (an/aus, Standard: an).
  'tickets.notifyReporterOnUpdate',
  'tickets.notifyReporterOnComment',
  'tickets.notifyAssignees',
  'tickets.notifyAreaRecipients',
  'tickets.notifyTypeRecipients',
  'tickets.notifyTemplateRecipients',
  'notifications.overdueEnabled',
  'sso.enabled',
  'sso.promoteSso',
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
  'mail.smtp.fromName',
  'mail.smtp.secure',
  'mail.signature',
  'mail.imap.host',
  'mail.imap.port',
  'mail.imap.user',
  'mail.imap.pass',
  'mail.inboundAutoReply',
  'mail.dkim.domain',
  'mail.dkim.selector',
  'mail.dkim.privateKey',
  'customModule.enabled',
  'customModule.label',
  'customModule.url',
  'embed.allowedOrigins',
  'embed.hideHeader',
  'support.email',
  'support.text',
  'update.enabled',
  'update.serverUrl',
  'update.channel',
  'update.publicKey',
  'update.autoInstall',
  'update.telemetry',
  'update.checkHour'
];

router.get('/public', async (req, res, next) => {
  try {
    const keys = [
      'app.url',
      'org.name', 'org.logo', 'org.favicon',
      'label.logo', 'label.widthMm', 'label.heightMm',
      'label.marginTopMm', 'label.marginBottomMm', 'label.marginLeftMm', 'label.marginRightMm',
      'sso.enabled', 'sso.promoteSso', 'sso.force', 'sso.buttonLabel', 'login.infoText',
      'customModule.enabled', 'customModule.label', 'customModule.url',
      'embed.allowedOrigins', 'embed.hideHeader',
      'support.email', 'support.text'
    ];
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    res.json({ settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) });
  } catch (error) {
    next(error);
  }
});

router.use(auth, requirePermission('SETTINGS_MANAGE'));

// Empfindliche Geheimnisse werden nie im Klartext an das Frontend zurückgegeben,
// sondern maskiert. Beim Speichern maskierte Werte unverändert übernommen werden
// (sonst würde ein leer speichern das echte Passwort löschen), werden sie ignoriert.
const SECRET_KEYS = new Set([
  'mail.smtp.pass',
  'mail.imap.pass',
  'mail.dkim.privateKey',
  'sso.clientSecret',
  'sso.adminApiToken'
]);
const SECRET_MASK = '••••••••';

function maskSettings(settings) {
  const out = {};
  for (const [key, value] of Object.entries(settings)) {
    out[key] = SECRET_KEYS.has(key) && value ? SECRET_MASK : value;
  }
  return out;
}

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
  if (payload?.results) return normalizeGroups(payload.results);
  if (payload?.groups) return normalizeGroups(payload.groups);
  if (payload?.data) return normalizeGroups(payload.data);

  if (Array.isArray(payload)) {
    return payload.map((group) => {
      if (typeof group === 'string') return group;
      return group?.path || group?.name || group?.group_name || group?.slug || group?.id;
    }).filter(Boolean).map(String);
  }

  if (payload && typeof payload === 'object') {
    // IServ-Objekt-Struktur ({"0": {name: "lehrer"}, ...}) → Werte behandeln
    return normalizeGroups(Object.values(payload));
  }

  return [];
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    res.json({ settings: maskSettings(settings) });
  } catch (error) {
    next(error);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    // Maskierte Geheimnisse (unverändert aus dem Frontend) werden ignoriert,
    // damit ein Speichern ohne Eingabe das gespeicherte Geheimnis nicht löscht.
    const entries = Object.entries(req.body || {})
      .filter(([key, value]) => allowedKeys.includes(key) && value !== SECRET_MASK);
    await prisma.$transaction(entries.map(([key, value]) => prisma.setting.upsert({
      where: { key },
      update: { value: String(value ?? '') },
      create: { key, value: String(value ?? '') }
    })));
    for (const [key] of entries) {
      invalidateSetting(key);
    }
    if (entries.some(([key]) => key.startsWith('mail.'))) {
      resetTransporter();
    }
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    res.json({ settings: maskSettings(Object.fromEntries(rows.map((row) => [row.key, row.value]))) });
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
