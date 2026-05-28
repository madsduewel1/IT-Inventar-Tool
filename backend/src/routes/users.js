const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { notifyUserCreated } = require('../services/mailNotify');

const router = express.Router();
router.use(auth, requireRole('ADMIN'));

const validRoles = new Set(['ADMIN', 'STAFF', 'VIEWER']);
const selectUser = { id: true, username: true, email: true, role: true, ssoId: true, preferences: true, createdAt: true, updatedAt: true };

function normalizeRole(role) {
  return validRoles.has(role) ? role : 'VIEWER';
}

router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ select: selectUser, orderBy: { username: 'asc' } });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { username, email, password, role = 'VIEWER' } = req.body;
    if (!username?.trim() || !email?.trim() || !password || password.length < 8) {
      return res.status(400).json({ error: 'Benutzername, E-Mail und ein Passwort mit mindestens 8 Zeichen sind erforderlich.', code: 'INVALID_USER_INPUT' });
    }
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const user = await prisma.user.create({ data: { username: username.trim(), email: email.trim(), passwordHash, role: normalizeRole(role) }, select: selectUser });
    res.status(201).json({ user });

    process.nextTick(() => notifyUserCreated(user, password).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { password, ...data } = req.body;
    if (data.role) data.role = normalizeRole(data.role);
    if (data.username) data.username = data.username.trim();
    if (data.email) data.email = data.email.trim();
    if (password) data.passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: selectUser });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/role', async (req, res, next) => {
  try {
    if (!validRoles.has(req.body.role)) {
      return res.status(400).json({ error: 'Ungültige Rolle', code: 'INVALID_ROLE' });
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role: req.body.role }, select: selectUser });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
