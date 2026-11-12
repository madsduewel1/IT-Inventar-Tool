const jwt = require('jsonwebtoken');
const config = require('../config/config');

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function issueCsrfToken(req, res) {
  // Generate a stateless CSRF token valid for 8 hours
  const token = jwt.sign({ csrf: true }, config.jwtSecret, { expiresIn: '8h' });
  res.json({ csrfToken: token });
}

function csrfProtection(req, res, next) {
  if (safeMethods.has(req.method) || req.path === '/auth/login' || req.path.startsWith('/auth/sso') || req.path.startsWith('/setup/')) {
    return next();
  }

  const token = req.headers['x-csrf-token'];
  if (!token) {
    return res.status(403).json({ error: 'CSRF-Token fehlt oder ist ungültig', code: 'INVALID_CSRF' });
  }

  try {
    jwt.verify(token, config.jwtSecret);
    return next();
  } catch (err) {
    return res.status(403).json({ error: 'CSRF-Token fehlt oder ist ungültig', code: 'INVALID_CSRF' });
  }
}

module.exports = { issueCsrfToken, csrfProtection };
