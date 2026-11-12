const express = require('express');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../services/permissions');
const { nextId } = require('../services/ids');
const { visibilityWhere } = require('../services/deviceVisibility');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const rooms = await prisma.room.findMany({
      include: { devices: { where: visibilityWhere(req.user), orderBy: { inventoryId: 'asc' } } },
      orderBy: { name: 'asc' }
    });
    res.json({ rooms });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: { devices: { where: visibilityWhere(req.user), orderBy: { inventoryId: 'asc' } } }
    });
    if (!room) return res.status(404).json({ error: 'Raum nicht gefunden', code: 'ROOM_NOT_FOUND' });
    res.json({ room });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requirePermission('ROOM_CREATE'), async (req, res, next) => {
  try {
    const { name, building, description } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Raumname ist erforderlich.', code: 'INVALID_ROOM_NAME' });
    }
    const room = await prisma.room.create({
      data: {
        id: await nextId('room'),
        name: name.trim(),
        building: building || null,
        description: description || null
      }
    });
    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', auth, requirePermission('ROOM_EDIT'), async (req, res, next) => {
  try {
    const { name, building, description } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = typeof name === 'string' && name.trim() ? name.trim() : undefined;
    if (building !== undefined) data.building = building || null;
    if (description !== undefined) data.description = description || null;
    const room = await prisma.room.update({ where: { id: req.params.id }, data });
    res.json({ room });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requirePermission('ROOM_DELETE'), async (req, res, next) => {
  try {
    await prisma.room.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
