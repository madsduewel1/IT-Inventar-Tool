const crypto = require('crypto');
const express = require('express');
const prisma = require('../config/prisma');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API-Key fehlt', code: 'API_KEY_REQUIRED' });
  const key = await prisma.apiKey.findFirst({ where: { keyHash: hashKey(apiKey), active: true } });
  if (!key) return res.status(401).json({ error: 'API-Key ungültig', code: 'INVALID_API_KEY' });
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsed: new Date() } });
  return next();
}

router.get('/', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = await prisma.monitoringData.findMany({ include: { device: true }, orderBy: { updatedAt: 'desc' } });
    res.json({ monitoring: data });
  } catch (error) {
    next(error);
  }
});

router.post('/report', apiKeyAuth, async (req, res, next) => {
  try {
    const { deviceId, hostname, ip, cpuPercent, ramPercent, diskPercent } = req.body;
    let device = deviceId ? await prisma.device.findUnique({ where: { id: deviceId } }) : null;
    if (!device && hostname) {
      device = await prisma.device.findFirst({ where: { OR: [{ serialNumber: hostname }, { inventoryId: hostname }] } });
    }
    if (!device) return res.status(404).json({ error: 'Gerät konnte nicht zugeordnet werden', code: 'DEVICE_NOT_FOUND' });

    const monitoring = await prisma.monitoringData.upsert({
      where: { deviceId: device.id },
      update: { hostname, ip, cpuPercent, ramPercent, diskPercent, online: true, lastSeen: new Date() },
      create: { deviceId: device.id, hostname, ip, cpuPercent, ramPercent, diskPercent, online: true, lastSeen: new Date() }
    });
    res.json({ monitoring });
  } catch (error) {
    next(error);
  }
});

router.get('/:deviceId', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const monitoring = await prisma.monitoringData.findUnique({ where: { deviceId: req.params.deviceId }, include: { device: true } });
    if (!monitoring) return res.status(404).json({ error: 'Keine Monitoring-Daten', code: 'MONITORING_NOT_FOUND' });
    res.json({ monitoring });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
