const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { notifyUserCreated } = require('../services/mailNotify');
const { nextId } = require('../services/ids');
const { enrichUserAccess, requirePermission, ALL_PERMISSIONS } = require('../services/permissions');

const router = express.Router();

// Minimale Benutzerliste für Dropdowns (z. B. Ausleihe zuweisen)
router.get('/list', auth, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true, email: true, role: true },
      orderBy: { username: 'asc' }
    });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.use(auth, requirePermission('USER_MANAGE'));

const validRoles = new Set(['ADMIN', 'STAFF', 'VIEWER']);
const selectUser = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  role: true,
  ssoId: true,
  ssoGroups: true,
  preferences: true,
  permissions: true,
  revokedPermissions: true,
  createdAt: true,
  updatedAt: true
};

function normalizeRole(role) {
  return validRoles.has(role) ? role : 'VIEWER';
}

function stringifyArray(arr) {
  if (Array.isArray(arr)) return JSON.stringify(arr);
  if (typeof arr === 'string') return arr;
  return '[]';
}

// Prüft, ob eine Rolle/Rechtemenge die privilegierte ADMIN-Ebene erreicht.
function grantsAdmin(role, permissions) {
  if (role === 'ADMIN') return true;
  const list = Array.isArray(permissions) ? permissions : parsePermissionList(permissions);
  return list.includes('ADMIN');
}

function parsePermissionList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Nur echte Administratoren dürfen ADMIN-Rolle oder die ADMIN-Berechtigung
// vergeben – sonst könnte ein per USER_MANAGE delegierter Benutzer sich selbst
// oder andere zur vollen Administration aufwerten (Privileg-Eskalation).
function forbidAdminEscalation(req, role, permissions) {
  if (req.user?.effectiveRole === 'ADMIN') return null;
  if (grantsAdmin(role, permissions)) {
    return { status: 403, error: 'Nur Administratoren dürfen die ADMIN-Rolle oder -Berechtigung vergeben.', code: 'ADMIN_ESCALATION_FORBIDDEN' };
  }
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const rawUsers = await prisma.user.findMany({ select: selectUser, orderBy: { username: 'asc' } });
    const users = await Promise.all(rawUsers.map((u) => enrichUserAccess(u)));
    res.json({ users, availablePermissions: ALL_PERMISSIONS });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { username, email, displayName, password, role = 'VIEWER', permissions = [], revokedPermissions = [] } = req.body;
    if (!username?.trim() || !email?.trim() || !password || password.length < 8) {
      return res.status(400).json({ error: 'Benutzername, E-Mail und ein Passwort mit mindestens 8 Zeichen sind erforderlich.', code: 'INVALID_USER_INPUT' });
    }
    const denied = forbidAdminEscalation(req, normalizeRole(role), permissions);
    if (denied) {
      return res.status(denied.status).json({ error: denied.error, code: denied.code });
    }
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const user = await prisma.user.create({
      data: {
        id: await nextId('user'),
        username: username.trim(),
        email: email.trim(),
        displayName: displayName?.trim() || null,
        passwordHash,
        role: normalizeRole(role),
        ssoGroups: '[]',
        permissions: stringifyArray(permissions),
        revokedPermissions: stringifyArray(revokedPermissions)
      },
      select: selectUser
    });
    const enriched = await enrichUserAccess(user);
    res.status(201).json({ user: enriched });

    process.nextTick(() => notifyUserCreated(user, password).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { password, permissions, revokedPermissions, username, email, displayName, role } = req.body;

    // Whitelist: nur erlaubte Felder dürfen übernommen werden (Schutz vor
    // Mass-Assignment, z. B. setzen von ssoId/ssoGroups/permissions über die
    // allgemeine PATCH-Route).
    const data = {};
    if (username !== undefined) data.username = String(username).trim();
    if (email !== undefined) data.email = String(email).trim();
    if (displayName !== undefined) data.displayName = displayName?.trim() || null;
    if (role !== undefined) data.role = normalizeRole(role);
    if (password) data.passwordHash = await bcrypt.hash(password, 12);
    if (permissions !== undefined) data.permissions = stringifyArray(permissions);
    if (revokedPermissions !== undefined) data.revokedPermissions = stringifyArray(revokedPermissions);

    const denied = forbidAdminEscalation(req, data.role, permissions);
    if (denied) {
      return res.status(denied.status).json({ error: denied.error, code: denied.code });
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: selectUser });
    const enriched = await enrichUserAccess(user);
    res.json({ user: enriched });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/role', async (req, res, next) => {
  try {
    if (!validRoles.has(req.body.role)) {
      return res.status(400).json({ error: 'Ungültige Rolle', code: 'INVALID_ROLE' });
    }
    const denied = forbidAdminEscalation(req, req.body.role, null);
    if (denied) {
      return res.status(denied.status).json({ error: denied.error, code: denied.code });
    }
    const existing = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, ssoId: true } });
    if (!existing) return res.status(404).json({ error: 'Benutzer nicht gefunden', code: 'USER_NOT_FOUND' });
    if (existing.ssoId) return res.status(403).json({ error: 'SSO-Benutzer-Rolle wird über Gruppen-Mappings gesteuert', code: 'SSO_ROLE_LOCKED' });
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role: req.body.role }, select: selectUser });
    const enriched = await enrichUserAccess(user);
    res.json({ user: enriched });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/permissions', async (req, res, next) => {
  try {
    const { permissions, revokedPermissions } = req.body;
    const denied = forbidAdminEscalation(req, null, permissions);
    if (denied) {
      return res.status(denied.status).json({ error: denied.error, code: denied.code });
    }
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Benutzer nicht gefunden', code: 'USER_NOT_FOUND' });

    const updateData = {};
    if (permissions !== undefined) updateData.permissions = stringifyArray(permissions);
    if (revokedPermissions !== undefined) updateData.revokedPermissions = stringifyArray(revokedPermissions);

    const user = await prisma.user.update({ where: { id: req.params.id }, data: updateData, select: selectUser });
    const enriched = await enrichUserAccess(user);
    res.json({ user: enriched });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    // Verhindert, dass ein Benutzer sich selbst löscht (Lockout-Schutz).
    if (req.params.id === req.user?.id) {
      return res.status(400).json({ error: 'Eigenes Konto kann nicht gelöscht werden.', code: 'CANNOT_DELETE_SELF' });
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
