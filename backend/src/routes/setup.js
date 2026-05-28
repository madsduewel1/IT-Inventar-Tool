const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

const router = express.Router();

async function setupDone() {
  if (process.env.SETUP_DONE === 'true') return true;
  const count = await prisma.user.count({ where: { passwordHash: { not: null } } });
  return count > 0;
}

async function upsertSetting(key, value) {
  return prisma.setting.upsert({
    where: { key },
    update: { value: String(value ?? '') },
    create: { key, value: String(value ?? '') }
  });
}

async function writeEnv(updates) {
  const envPath = path.join(process.cwd(), '.env');
  let current = '';
  try {
    current = await fs.readFile(envPath, 'utf8');
  } catch {
    current = '';
  }

  const lines = current.split(/\r?\n/).filter(Boolean);
  const seen = new Set();
  const next = lines.map((line) => {
    const [key] = line.split('=');
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (!seen.has(key)) next.push(`${key}=${value}`);
    process.env[key] = String(value);
  });

  await fs.writeFile(envPath, `${next.join('\n')}\n`);
}

router.get('/status', async (req, res, next) => {
  try {
    res.json({ setupDone: await setupDone(), locale: process.env.LOCALE || 'de' });
  } catch (error) {
    next(error);
  }
});

router.post('/test-db', async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/complete', async (req, res, next) => {
  if (await setupDone()) {
    return res.json({ ok: true, setupDone: true });
  }

  try {
    const { locale, organization, database, admin, auth } = req.body;
    if (!admin?.username || !admin?.email || !admin?.password || admin.password.length < 8) {
      return res.status(400).json({ error: 'Admin-Daten sind unvollständig', code: 'INVALID_ADMIN' });
    }

    await writeEnv({
      LOCALE: locale || 'de',
      DB_PROVIDER: database?.provider || process.env.DB_PROVIDER || 'mysql',
      DATABASE_URL: database?.url || process.env.DATABASE_URL || 'mysql://mzinventory:Password@localhost:3306/mzinventory',
      SSO_ENABLED: auth?.type && auth.type !== 'local' ? 'true' : 'false',
      SSO_PROVIDER: auth?.provider || '',
      SSO_CLIENT_ID: auth?.clientId || '',
      SSO_CLIENT_SECRET: auth?.clientSecret || '',
      SSO_ISSUER_URL: auth?.issuerUrl || ''
    });

    await upsertSetting('app.locale', locale || 'de');
    await upsertSetting('org.name', organization?.name || 'Medienzentrum');
    await upsertSetting('org.email', organization?.email || '');
    await upsertSetting('org.logo', organization?.logo || '');
    await upsertSetting('app.url', organization?.appUrl || '');

    const baseAppUrl = (organization?.appUrl || '').replace(/\/$/, '');
    await upsertSetting('sso.enabled', auth?.type && auth.type !== 'local' ? 'true' : 'false');
    await upsertSetting('sso.provider', auth?.provider || '');
    await upsertSetting('sso.clientId', auth?.clientId || '');
    await upsertSetting('sso.clientSecret', auth?.clientSecret || '');
    await upsertSetting('sso.issuerUrl', auth?.issuerUrl || '');
    await upsertSetting('sso.redirectUri', baseAppUrl ? `${baseAppUrl}/api/auth/sso/callback` : '');

    const passwordHash = await bcrypt.hash(admin.password, 12);
    await prisma.user.upsert({
      where: { email: admin.email },
      update: { username: admin.username, passwordHash, role: 'ADMIN' },
      create: { username: admin.username, email: admin.email, passwordHash, role: 'ADMIN' }
    });

    await writeEnv({ SETUP_DONE: 'true' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
