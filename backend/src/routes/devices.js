const express = require('express');
const multer = require('multer');
const path = require('path');
const prisma = require('../config/prisma');
const config = require('../config/config');
const { auth, requireRole } = require('../middleware/auth');
const { qrPng, deviceUrl, generateLabelSvg } = require('../services/qr');

const router = express.Router();
const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9_.-]/gi, '_')}`)
});
const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function encodeJsonArray(value) {
  return JSON.stringify(parseJsonArray(value));
}

function sanitizeUrl(url) {
  if (!url) return url;
  // Replace any double (or more) slashes after the protocol part (e.g. https://)
  return url.replace(/(https?:\/\/)|(\/){2,}/g, (match, protocol) => protocol || '/');
}

function normalizeDevice(device) {
  if (!device) return device;
  return {
    ...device,
    qrCode: sanitizeUrl(device.qrCode),
    labels: parseJsonArray(device.labels),
    images: parseJsonArray(device.images)
  };
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { status, room, search } = req.query;
    const devices = await prisma.device.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(room ? { roomId: room } : {}),
        ...(search
          ? {
              OR: [
                { inventoryId: { contains: search } },
                { model: { contains: search } },
                { manufacturer: { contains: search } },
                { serialNumber: { contains: search } }
              ]
            }
          : {})
      },
      include: { room: true, monitoringData: true },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ devices: devices.map(normalizeDevice) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const device = await prisma.device.findFirst({
      where: { OR: [{ id: req.params.id }, { inventoryId: req.params.id }] },
      include: { room: true, loans: { include: { user: true }, orderBy: { startDate: 'desc' } }, monitoringData: true }
    });
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    res.json({ device: normalizeDevice(device) });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const { id, inventoryId } = req.body;
    if (!id || !/^\d{3,4}$/.test(id)) {
      return res.status(400).json({ error: 'Die Geräte-ID (Device-ID) muss eine 3- oder 4-stellige Zahl sein.', code: 'INVALID_DEVICE_ID' });
    }
    if (!inventoryId || typeof inventoryId !== 'string' || !inventoryId.trim()) {
      return res.status(400).json({ error: 'Die Inventarnummer darf nicht leer sein.', code: 'INVALID_INVENTORY_ID' });
    }

    const existingId = await prisma.device.findUnique({ where: { id } });
    if (existingId) {
      return res.status(400).json({ error: 'Ein Gerät mit dieser Geräte-ID existiert bereits.', code: 'DUPLICATE_DEVICE_ID' });
    }

    const existingInventoryId = await prisma.device.findUnique({ where: { inventoryId } });
    if (existingInventoryId) {
      return res.status(400).json({ error: 'Ein Gerät mit dieser Inventarnummer existiert bereits.', code: 'DUPLICATE_INVENTORY_ID' });
    }

    const data = {
      ...req.body,
      labels: encodeJsonArray(req.body.labels),
      images: encodeJsonArray(req.body.images),
      purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : null,
      warrantyEnd: req.body.warrantyEnd ? new Date(req.body.warrantyEnd) : null
    };
    const device = await prisma.device.create({ data });
    const qrCode = await deviceUrl(device);
    const updated = await prisma.device.update({ where: { id: device.id }, data: { qrCode } });
    await prisma.deviceHistory.create({ data: { deviceId: device.id, action: 'created', userId: req.user.id } });
    res.status(201).json({ device: normalizeDevice(updated) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', auth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const { labels, images, purchaseDate, warrantyEnd, ...rest } = req.body;
    if (rest.inventoryId !== undefined) {
      if (!rest.inventoryId || typeof rest.inventoryId !== 'string' || !rest.inventoryId.trim()) {
        return res.status(400).json({ error: 'Die Inventarnummer darf nicht leer sein.', code: 'INVALID_INVENTORY_ID' });
      }
      
      const existingInventoryId = await prisma.device.findFirst({
        where: { inventoryId: rest.inventoryId, NOT: { id: req.params.id } }
      });
      if (existingInventoryId) {
        return res.status(400).json({ error: 'Ein Gerät mit dieser Inventarnummer existiert bereits.', code: 'DUPLICATE_INVENTORY_ID' });
      }
    }

    // Do not allow updating the primary key 'id'
    delete rest.id;

    const device = await prisma.device.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(labels !== undefined ? { labels: encodeJsonArray(labels) } : {}),
        ...(images !== undefined ? { images: encodeJsonArray(images) } : {}),
        ...(purchaseDate !== undefined ? { purchaseDate: purchaseDate ? new Date(purchaseDate) : null } : {}),
        ...(warrantyEnd !== undefined ? { warrantyEnd: warrantyEnd ? new Date(warrantyEnd) : null } : {})
      }
    });
    await prisma.deviceHistory.create({ data: { deviceId: device.id, action: 'updated', userId: req.user.id } });
    res.json({ device: normalizeDevice(device) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.device.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/:id/qr', auth, async (req, res, next) => {
  try {
    const device = await prisma.device.findFirst({ where: { OR: [{ id: req.params.id }, { inventoryId: req.params.id }] } });
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    res.type('png').send(await qrPng(device));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/label', auth, async (req, res, next) => {
  try {
    const device = await prisma.device.findFirst({ where: { OR: [{ id: req.params.id }, { inventoryId: req.params.id }] } });
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    const svg = await generateLabelSvg(device);
    res.type('image/svg+xml').send(svg);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/history', auth, async (req, res, next) => {
  try {
    const history = await prisma.deviceHistory.findMany({ where: { deviceId: req.params.id }, orderBy: { createdAt: 'desc' } });
    res.json({ history });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/images', auth, requireRole('STAFF', 'ADMIN'), upload.single('image'), async (req, res, next) => {
  try {
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    const imagePath = `/uploads/${path.basename(req.file.path)}`;
    const images = [...parseJsonArray(device.images), imagePath];
    const updated = await prisma.device.update({ where: { id: device.id }, data: { images: JSON.stringify(images) } });
    res.status(201).json({ device: normalizeDevice(updated), imagePath });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
