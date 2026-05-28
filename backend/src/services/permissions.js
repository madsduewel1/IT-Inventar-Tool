const prisma = require('../config/prisma');

const ROLE_ORDER = ['VIEWER', 'STAFF', 'ADMIN'];

const ROLE_PERMISSIONS = {
  VIEWER: ['ISSUE_REPORT'],
  STAFF: ['ISSUE_REPORT', 'ISSUE_MANAGE'],
  ADMIN: ['ISSUE_REPORT', 'ISSUE_MANAGE', 'ADMIN']
};

function parseJson(value, fallback) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeGroups(value) {
  return parseJson(value, []).filter(Boolean).map(String);
}

function normalizeMappings(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function strongestRole(current, next) {
  return ROLE_ORDER.indexOf(next) > ROLE_ORDER.indexOf(current) ? next : current;
}

async function getGroupMappings() {
  const row = await prisma.setting.findUnique({ where: { key: 'sso.groupMappings' } });
  return normalizeMappings(row?.value);
}

async function enrichUserAccess(user) {
  if (!user) return user;

  const ssoGroups = normalizeGroups(user.ssoGroups);
  const mappings = await getGroupMappings();
  let effectiveRole = user.role || 'VIEWER';
  const permissions = new Set(ROLE_PERMISSIONS[effectiveRole] || []);

  for (const mapping of mappings) {
    if (!mapping?.group || !ssoGroups.includes(mapping.group)) continue;
    if (mapping.role && ROLE_PERMISSIONS[mapping.role]) {
      effectiveRole = strongestRole(effectiveRole, mapping.role);
      for (const permission of ROLE_PERMISSIONS[mapping.role]) permissions.add(permission);
    }
    for (const permission of mapping.permissions || []) permissions.add(permission);
  }

  return { ...user, ssoGroups, effectiveRole, permissions: Array.from(permissions) };
}

function hasPermission(user, permission) {
  return user?.permissions?.includes(permission) || user?.permissions?.includes('ADMIN');
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: 'Keine Berechtigung', code: 'FORBIDDEN' });
    }
    return next();
  };
}

module.exports = { enrichUserAccess, hasPermission, requirePermission, normalizeGroups, normalizeMappings };
