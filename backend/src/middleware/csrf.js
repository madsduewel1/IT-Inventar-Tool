const crypto = require('crypto');

const tokens = new Map();
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const key = req.ip || 'local';
  tokens.set(key, { token, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  res.json({ csrfToken: token });
}

function csrfProtection(req, res, next) {
  if (safeMethods.has(req.method) || req.path === '/auth/login' || req.path.startsWith('/setup/')) {
    return next();
  }

  const key = req.ip || 'local';
  const entry = tokens.get(key);
  const token = req.headers['x-csrf-token'];

  if (!entry || entry.expiresAt < Date.now() || entry.token !== token) {
    return res.status(403).json({ error: 'CSRF-Token fehlt oder ist ungültig', code: 'INVALID_CSRF' });
  }

  return next();
}

module.exports = { issueCsrfToken, csrfProtection };
