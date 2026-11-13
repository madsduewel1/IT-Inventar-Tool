const updater = require('../services/githubUpdater');

// Waehrend eines Updates antworten alle API-Aufrufe mit 503, damit das
// Frontend den Wartungsmodus anzeigen kann. Health und Maintenance-Status
// bleiben erreichbar, damit die Oberflaeche den Fortschritt abfragen kann.
// Health und Wartungsstatus bleiben fuer alle erreichbar. Die Admin-Endpunkte
// bleiben ebenfalls erreichbar (Auth prueft danach), damit ein haengender
// Wartungsmodus beendet und der Fortschritt eingesehen werden kann.
const ALLOWED = new Set([
  '/health',
  '/maintenance',
  '/csrf-token',
  '/system/updates/status',
  '/system/updates/progress',
  '/system/updates/history',
  '/system/updates/logs',
  '/system/updates/maintenance'
]);

let cached = { at: 0, value: { enabled: false } };

function currentMaintenance() {
  const now = Date.now();
  if (now - cached.at < 2000) return cached.value;
  cached = { at: now, value: updater.readMaintenance() };
  return cached.value;
}

module.exports = function maintenance(req, res, next) {
  if (ALLOWED.has(req.path)) return next();
  const maintenance = currentMaintenance();
  if (!maintenance.enabled) return next();
  res.setHeader('Retry-After', '30');
  return res.status(503).json({
    error: 'Wartungsmodus',
    code: 'MAINTENANCE',
    message: maintenance.message,
    startedAt: maintenance.startedAt || null,
    reason: maintenance.reason || 'update',
    stale: !!maintenance.stale
  });
};
