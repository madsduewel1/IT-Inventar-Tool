const logger = require('../config/logger');

function notFound(req, res) {
  res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' });
}

function errorHandler(err, req, res, next) {
  logger.error({ err, path: req.path }, 'Unhandled request error');
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Interner Serverfehler' : err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
}

module.exports = { notFound, errorHandler };
