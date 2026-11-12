const logger = require('../config/logger');

function notFound(req, res) {
  res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' });
}

function errorHandler(err, req, res, next) {
  logger.error({ err, path: req.path }, 'Unhandled request error');

  // Prisma-spezifische Fehler sauber übersetzen
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Ein Datensatz mit diesem Wert existiert bereits', code: 'CONFLICT' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Datensatz nicht gefunden', code: 'NOT_FOUND' });
  }

  const status = err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(status).json({
    // Interne Details (z. B. Prisma/SMTP-Fehlertexte) nur in Nicht-Produktion ausgeben
    error: status >= 500 && isProduction ? 'Interner Serverfehler' : (err.message || 'Interner Serverfehler'),
    code: err.code || 'INTERNAL_ERROR'
  });
}

module.exports = { notFound, errorHandler };
