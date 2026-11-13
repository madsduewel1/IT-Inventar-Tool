const express = require('express');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../services/permissions');
const updater = require('../services/githubUpdater');

const router = express.Router();

// Alle Update-Endpunkte sind ausschliesslich fuer Administratoren mit
// SETTINGS_MANAGE. Der GitHub-Token wird nie ausgeliefert.
router.use(auth, requirePermission('SETTINGS_MANAGE'));

router.get('/status', async (req, res, next) => {
  try {
    res.json(await updater.statusForUI());
  } catch (error) {
    next(error);
  }
});

router.post('/check', async (req, res, next) => {
  try {
    const result = await updater.checkNow({ manual: true });
    res.json({ result, status: await updater.statusForUI() });
  } catch (error) {
    next(error);
  }
});

router.get('/available', async (req, res, next) => {
  try {
    const status = await updater.statusForUI();
    res.json({
      available: status.available,
      latest: status.latest,
      currentVersion: status.currentVersion,
      lastCheckAt: status.lastCheckAt,
      lastCheckStatus: status.lastCheckStatus
    });
  } catch (error) {
    next(error);
  }
});

router.post('/install', async (req, res, next) => {
  try {
    const version = req.body?.version;
    const actor = req.user?.username || req.user?.displayName || 'Administrator';
    const result = await updater.triggerInstall(version, actor);
    res.json({ result, status: await updater.statusForUI() });
  } catch (error) {
    res.status(400).json({ error: error.message, status: await updater.statusForUI() });
  }
});

router.get('/progress', async (req, res, next) => {
  try {
    const status = await updater.statusForUI();
    res.json({
      installStatus: status.installStatus,
      installStep: status.installStep,
      installStartedAt: status.installStartedAt,
      installFinishedAt: status.installFinishedAt,
      installError: status.installError,
      installTargetVersion: status.installTargetVersion,
      installLog: status.installLog,
      currentVersion: status.currentVersion,
      maintenance: status.maintenance
    });
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const status = await updater.statusForUI();
    res.json({ history: status.history, lastUpdate: status.lastUpdate });
  } catch (error) {
    next(error);
  }
});

router.get('/logs', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
    res.json(await updater.readLogs(limit));
  } catch (error) {
    next(error);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    res.json({ settings: await updater.settingsForUI() });
  } catch (error) {
    next(error);
  }
});

async function saveSettings(req, res, next) {
  try {
    const settings = await updater.saveSettings(req.body || {});
    res.json({ settings, status: await updater.statusForUI() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

router.put('/settings', saveSettings);
router.patch('/settings', saveSettings);

// Notfall-Schalter, damit ein haengengebliebener Wartungsmodus manuell beendet
// werden kann, ohne den Server neu zu starten.
router.post('/maintenance', async (req, res, next) => {
  try {
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
    updater.setMaintenance(enabled, req.body?.message);
    res.json({ maintenance: updater.readMaintenance() });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
