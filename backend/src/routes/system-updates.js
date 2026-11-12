const express = require('express');
const prisma = require('../config/prisma');
const config = require('../config/config');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../services/permissions');
const { invalidateSetting } = require('../services/settingsCache');
const updater = require('../services/updater');

const router = express.Router();

// Status + wirksame Konfiguration
router.use(auth, requirePermission('SETTINGS_MANAGE'));

async function readDbSettings() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['update.enabled', 'update.serverUrl', 'update.channel', 'update.publicKey', 'update.autoInstall', 'update.telemetry', 'update.checkHour'] } }
  });
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

router.get('/', async (req, res, next) => {
  try {
    const status = await updater.statusForUI();
    const dbSettings = await readDbSettings();

    res.json({
      ...status,
      dbSettings: {
        enabled: dbSettings['update.enabled'] || '',
        serverUrl: dbSettings['update.serverUrl'] || '',
        channel: dbSettings['update.channel'] || '',
        publicKey: dbSettings['update.publicKey'] || '',
        autoInstall: dbSettings['update.autoInstall'] || '',
        telemetry: dbSettings['update.telemetry'] || '',
        checkHour: dbSettings['update.checkHour'] || ''
      },
      defaults: {
        enabled: config.updater.enabled,
        serverUrl: config.updater.serverUrl,
        channel: config.updater.channel,
        autoInstall: config.updater.autoInstall,
        telemetry: config.updater.telemetry,
        checkHour: config.updater.checkHour
      },
      machine: {
        installDir: config.updater.installDir,
        serviceName: config.updater.serviceName,
        stateFile: config.updater.stateFile,
        clientBin: config.updater.clientBin,
        autoreflect: fs_exists(config.updater.updateConf)
      }
    });
  } catch (error) {
    next(error);
  }
});

function fs_exists(file) {
  try {
    const fs = require('fs');
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

// Manueller Check auslösen
router.post('/check', async (req, res, next) => {
  try {
    const result = await updater.checkNow();
    const status = await updater.statusForUI();
    res.json({ result, status });
  } catch (error) {
    next(error);
  }
});

// Manuelle Installation der verfügbaren Version
router.post('/install', async (req, res, next) => {
  try {
    const statusBefore = await updater.statusForUI();
    if (statusBefore.available) {
      try {
        const started = await updater.installNow();
        res.json({ result: { status: 'started', ...started }, status: await updater.statusForUI() });
      } catch (error) {
        res.status(400).json({ error: error.message, status: await updater.statusForUI() });
      }
    } else {
      res.status(400).json({ error: 'Kein überprüftes Update vorhanden.', status: statusBefore });
    }
  } catch (error) {
    next(error);
  }
});

// Einstellungen speichern (nur erlaubte update.*-Keys)
router.patch('/settings', async (req, res, next) => {
  try {
    const allowed = ['enabled', 'serverUrl', 'channel', 'publicKey', 'autoInstall', 'telemetry', 'checkHour'];
    const channelOk = (value) => !value || ['stable', 'beta'].includes(value);
    const publicKeyOk = (value) => !value || /^-----BEGIN PUBLIC KEY-----/.test(String(value));
    const checkHourOk = (value) => !value || (Number(value) >= 0 && Number(value) <= 23);
    const enabledOk = (value) => !value || value === 'true' || value === 'false';

    const entries = Object.entries(req.body || {})
      .filter(([key]) => allowed.includes(key))
      .map(([key, value]) => {
        const str = value === true || value === 'true' ? 'true'
          : value === false || value === 'false' ? 'false'
          : String(value ?? '');
        return ['update.' + key, str.trim()];
      });

    if (!channelOk(entries.find(([key]) => key === 'update.channel')?.[1])) {
      return res.status(400).json({ error: 'Ungültiger Kanal. Erlaubt: stable, beta.' });
    }
    const enabledEntry = entries.find(([key]) => key === 'update.enabled');
    if (enabledEntry && !enabledOk(enabledEntry[1])) {
      return res.status(400).json({ error: 'Ungültiger Wert für update.enabled.' });
    }
    const publicKeyEntry = entries.find(([key]) => key === 'update.publicKey');
    if (publicKeyEntry && publicKeyEntry[1] !== '' && !publicKeyOk(publicKeyEntry[1])) {
      return res.status(400).json({ error: 'Der öffentliche Schlüssel muss als PEM vorliegen (-----BEGIN PUBLIC KEY-----).' });
    }
    const checkHourEntry = entries.find(([key]) => key === 'update.checkHour');
    if (checkHourEntry && checkHourEntry[1] !== '' && !checkHourOk(checkHourEntry[1])) {
      return res.status(400).json({ error: 'Ungültige Stunde (0-23).' });
    }

    await prisma.$transaction(entries.map(([key, value]) => prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    })));
    for (const [key] of entries) {
      invalidateSetting(key);
    }

    const status = await updater.statusForUI();
    res.json({ status });
  } catch (error) {
    next(error);
  }
});

module.exports = router;