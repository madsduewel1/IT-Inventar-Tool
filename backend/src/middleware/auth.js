const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const config = require('../config/config');
const { enrichUserAccess } = require('../services/permissions');

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [, token] = header.match(/^Bearer\s+(.+)$/i) || [];

  if (!token) {
    return res.status(401).json({ error: 'Nicht angemeldet', code: 'UNAUTHENTICATED' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, email: true, role: true, ssoGroups: true, preferences: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Ungültige Sitzung', code: 'INVALID_SESSION' });
    }

    req.user = await enrichUserAccess(user);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Ungültiges Token', code: 'INVALID_TOKEN' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.effectiveRole || req.user?.role)) {
      return res.status(403).json({ error: 'Keine Berechtigung', code: 'FORBIDDEN' });
    }
    return next();
  };
}

module.exports = { auth, requireRole };
