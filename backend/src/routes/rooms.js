const express = require('express');
const prisma = require('../config/prisma');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const rooms = await prisma.room.findMany({ include: { devices: true }, orderBy: { name: 'asc' } });
    res.json({ rooms });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const room = await prisma.room.findUnique({ where: { id: req.params.id }, include: { devices: true } });
    if (!room) return res.status(404).json({ error: 'Raum nicht gefunden', code: 'ROOM_NOT_FOUND' });
    res.json({ room });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const room = await prisma.room.create({ data: req.body });
    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', auth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const room = await prisma.room.update({ where: { id: req.params.id }, data: req.body });
    res.json({ room });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.room.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
