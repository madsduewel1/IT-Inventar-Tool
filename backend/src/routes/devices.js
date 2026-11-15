const express = require('express');
const multer = require('multer');
const path = require('path');
const prisma = require('../config/prisma');
const config = require('../config/config');
const { auth } = require('../middleware/auth');
const { requirePermission, enrichUserAccess } = require('../services/permissions');
const { qrPng, deviceUrl, generateLabelSvg } = require('../services/qr');
const { DEVICE_CATEGORIES, normalizeCategory, optionalCategory, parseCategory, CATEGORY_LABELS } = require('../services/deviceCategories');
const { DEVICE_STATUSES, normalizeDeviceStatus } = require('../services/deviceStatus');
const { visibilityWhere, canSeeDevice, hasActiveLoan, normalizeVisibility, VISIBILITY_VALUES } = require('../services/deviceVisibility');
const { DEVICE_ICONS, ICON_LABELS, normalizeIcon } = require('../services/deviceIcons');
const { conditionSummary } = require('../services/deviceCondition');

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

/**
 * Prüft Bereich und zuständigen Administrator aus dem Request-Body.
 * Gibt bei Fehlern { error: { status, error, code } } zurück, sonst die
 * normalisierten IDs (null, wenn nicht gesetzt).
 */
async function resolveAssignments(body = {}) {
  const result = { areaId: null, adminId: null, error: null };

  if (body.areaId || body.areaName) {
    const area = body.areaId
      ? await prisma.area.findUnique({ where: { id: String(body.areaId) } })
      : await prisma.area.findFirst({ where: { name: String(body.areaName) } });
    if (!area) return { error: { status: 404, error: 'Bereich nicht gefunden.', code: 'AREA_NOT_FOUND' } };
    result.areaId = area.id;
  }

  if (body.adminId || body.adminName) {
    const admin = body.adminId
      ? await prisma.user.findUnique({ where: { id: String(body.adminId) } })
      : await prisma.user.findFirst({
          where: {
            OR: [
              { displayName: String(body.adminName) },
              { username: String(body.adminName) }
            ]
          }
        });
    if (!admin) return { error: { status: 400, error: 'Zuständiger Administrator nicht gefunden.', code: 'DEVICE_ADMIN_NOT_FOUND' } };
    const enriched = await enrichUserAccess(admin);
    if (!['STAFF', 'ADMIN'].includes(enriched.effectiveRole)) {
      return { error: { status: 400, error: 'Zuständig kann nur ein Benutzer mit der Rolle IT oder Administrator sein.', code: 'INVALID_DEVICE_ADMIN' } };
    }
    result.adminId = admin.id;
  }

  return result;
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { status, room, search, category } = req.query;
    const devices = await prisma.device.findMany({
      where: {
        // Asset-Sichtbarkeit: VIEWER sehen nur „ALL"-Geräte, IT zusätzlich
        // „STAFF"-Geräte, Administratoren alle.
        ...visibilityWhere(req.user),
        ...(status ? { status } : {}),
        ...(room ? { roomId: room } : {}),
        // Geräte ohne hinterlegte Art (Altbestand vor dem Feld) gelten als
        // „Sonstiges" – sonst würde der Filter sie aussperren.
        ...(category ? { category: optionalCategory(category) || 'OTHER' } : {}),
        ...(search
          ? {
              OR: [
                { inventoryId: { contains: search } },
                { model: { contains: search } },
                { manufacturer: { contains: search } },
                { serialNumber: { contains: search } },
                { room: { is: { name: { contains: search } } } },
                { room: { is: { building: { contains: search } } } }
              ]
            }
          : {})
      },
      include: {
        room: true,
        area: { select: { id: true, name: true } },
        admin: { select: { id: true, username: true, displayName: true } }
      },
      orderBy: { inventoryId: 'asc' }
    });
    res.json({ devices: devices.map(normalizeDevice) });
  } catch (error) {
    next(error);
  }
});

// Die Gerätearten für die Auswahlfelder in den Geräteformularen. Öffentlich
// lesbar, damit Anzeige und Formulare dieselbe Liste verwenden.
router.get('/categories', auth, (req, res) => {
  res.json({ categories: DEVICE_CATEGORIES, labels: CATEGORY_LABELS });
});

// Auswahlsymbole für die Geräteformulare (Abschnitt 24 des Konzepts).
router.get('/icons', auth, (req, res) => {
  res.json({ icons: DEVICE_ICONS, labels: ICON_LABELS, visibilities: VISIBILITY_VALUES });
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const role = req.user?.effectiveRole || req.user?.role;
    const canSeeLoans = ['STAFF', 'ADMIN'].includes(role);
    const device = await prisma.device.findFirst({
      where: { OR: [{ id: req.params.id }, { inventoryId: req.params.id }] },
      include: { 
        room: true, 
        area: {
          include: {
            room: true,
            editors: { select: { user: { select: { id: true, username: true, displayName: true, role: true } } } }
          }
        },
        admin: { select: { id: true, username: true, displayName: true, role: true } },
        // Offene Tickets: Grundlage für den konkreten Fehler-/Einschränkungs-
        // Grund in „Mein Gerät" und auf der Detailseite.
        issues: {
          where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } },
          select: { id: true, title: true, priority: true, status: true, description: true, createdAt: true },
          orderBy: { createdAt: 'desc' }
        },
        ...(canSeeLoans ? { 
          loans: { include: { user: true }, orderBy: { startDate: 'desc' } },
          updateResults: {
            include: {
              update: true
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        } : {})
      }
    });
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    // Sichtbarkeit prüfen – eigenes aktives Leihverhältnis umgeht den Filter.
    const ownLoan = await hasActiveLoan(req.user?.id, device.id);
    if (!canSeeDevice(req.user, device) && !ownLoan) {
      return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    }
    
    const normalized = normalizeDevice(device);
    normalized.openIssues = normalized.issues || [];
    delete normalized.issues;
    // Gleiche Begründung wie in „Mein Gerät": Status + konkrete offene Tickets.
    normalized.condition = conditionSummary(normalized, normalized.openIssues);
    if (!canSeeLoans) {
      normalized.loans = [];
    }
    res.json({ device: normalized });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requirePermission('DEVICE_CREATE'), async (req, res, next) => {
  try {
    const { id, inventoryId } = req.body;
    if (!id || !/^[a-zA-Z0-9_-]{3,50}$/.test(id)) {
      return res.status(400).json({ error: 'Die Geräte-ID muss 3 bis 50 alphanumerische Zeichen lang sein.', code: 'INVALID_DEVICE_ID' });
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

    const assignments = await resolveAssignments(req.body);
    if (assignments.error) return res.status(assignments.error.status).json(assignments.error);

    const data = {
      id,
      inventoryId: inventoryId.trim(),
      manufacturer: req.body.manufacturer || null,
      model: req.body.model || null,
      serialNumber: req.body.serialNumber || null,
      hostname: req.body.hostname || null,
      category: normalizeCategory(req.body.category),
      icon: normalizeIcon(req.body.icon),
      visibility: normalizeVisibility(req.body.visibility),
      areaId: assignments.areaId,
      adminId: assignments.adminId,
      description: req.body.description || null,
      status: normalizeDeviceStatus(req.body.status),
      statusLocked: Boolean(req.body.statusLocked),
      roomId: req.body.roomId || null,
      isLendable: req.body.isLendable ?? false,
      isReportable: req.body.isReportable ?? false,
      updatesEnabled: req.body.updatesEnabled ?? false,
      ipAddress: req.body.ipAddress || null,
      macAddress: req.body.macAddress || null,
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

router.patch('/bulk', auth, requirePermission('DEVICE_EDIT'), async (req, res, next) => {
  try {
    const { ids, data } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Mindestens ein Asset auswählen.', code: 'EMPTY_BULK' });
    }
    const updateData = {};
    const { status, statusLocked, roomId, areaId, isLendable, isReportable, updatesEnabled, description, labels, category } = data || {};
    if (status !== undefined) {
      updateData.status = normalizeDeviceStatus(status);
      if (statusLocked === undefined) updateData.statusLocked = true;
    }
    if (statusLocked !== undefined) updateData.statusLocked = Boolean(statusLocked);
    if (category !== undefined) updateData.category = normalizeCategory(category);
    // Bereich zuweisen bzw. leeren (Abschnitt 11: alle Assets eines Bereichs).
    if (areaId !== undefined) {
      if (areaId) {
        const area = await prisma.area.findUnique({ where: { id: String(areaId) } });
        if (!area) {
          return res.status(404).json({ error: 'Bereich nicht gefunden.', code: 'AREA_NOT_FOUND' });
        }
        updateData.areaId = area.id;
      } else {
        updateData.areaId = null;
      }
    }
    if (roomId !== undefined) updateData.roomId = roomId || null;
    if (isLendable !== undefined) updateData.isLendable = isLendable;
    if (isReportable !== undefined) updateData.isReportable = isReportable;
    if (updatesEnabled !== undefined) updateData.updatesEnabled = updatesEnabled;
    if (description !== undefined) updateData.description = description;
    if (labels !== undefined) updateData.labels = encodeJsonArray(labels);
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Keine gültigen Felder zum Aktualisieren', code: 'EMPTY_UPDATE' });
    }

    const result = await prisma.device.updateMany({ where: { id: { in: ids } }, data: updateData });
    await Promise.all(ids.map((id) => prisma.deviceHistory.create({ data: { deviceId: id, action: 'edited', userId: req.user.id } })));
    res.json({ updated: result.count, ids });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', auth, requirePermission('DEVICE_EDIT'), async (req, res, next) => {
  try {
    const { labels, images, purchaseDate, warrantyEnd, inventoryId, manufacturer, model,
            serialNumber, description, status, statusLocked, roomId, isLendable, isReportable,
            updatesEnabled, ipAddress, macAddress, category, hostname, icon, visibility,
            areaId, adminId } = req.body;
    const data = {};
    if (inventoryId !== undefined) data.inventoryId = inventoryId;
    if (manufacturer !== undefined) data.manufacturer = manufacturer;
    if (model !== undefined) data.model = model;
    if (serialNumber !== undefined) data.serialNumber = serialNumber;
    if (hostname !== undefined) data.hostname = hostname || null;
    if (category !== undefined) data.category = normalizeCategory(category);
    if (icon !== undefined) data.icon = normalizeIcon(icon);
    if (visibility !== undefined) data.visibility = normalizeVisibility(visibility);
    if (description !== undefined) data.description = description;
    if (status !== undefined) {
      data.status = normalizeDeviceStatus(status);
      if (statusLocked === undefined) data.statusLocked = true;
    }
    if (statusLocked !== undefined) data.statusLocked = Boolean(statusLocked);
    if (roomId !== undefined) data.roomId = roomId;
    if (isLendable !== undefined) data.isLendable = isLendable;
    if (isReportable !== undefined) data.isReportable = isReportable;
    if (updatesEnabled !== undefined) data.updatesEnabled = updatesEnabled;
    if (ipAddress !== undefined) data.ipAddress = ipAddress;
    if (macAddress !== undefined) data.macAddress = macAddress;
    if (labels !== undefined) data.labels = encodeJsonArray(labels);
    if (images !== undefined) data.images = encodeJsonArray(images);
    if (purchaseDate !== undefined) data.purchaseDate = purchaseDate ? new Date(purchaseDate) : null;
    if (warrantyEnd !== undefined) data.warrantyEnd = warrantyEnd ? new Date(warrantyEnd) : null;
    if (areaId !== undefined) data.areaId = areaId || null;
    if (adminId !== undefined) data.adminId = adminId || null;

    if ((areaId !== undefined && areaId) || (adminId !== undefined && adminId)) {
      const assignments = await resolveAssignments(req.body);
      if (assignments.error) return res.status(assignments.error.status).json(assignments.error);
      if (areaId !== undefined) data.areaId = assignments.areaId;
      if (adminId !== undefined) data.adminId = assignments.adminId;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Keine gültigen Felder zum Aktualisieren', code: 'EMPTY_UPDATE' });
    }

    if (data.inventoryId !== undefined) {
      if (!data.inventoryId || typeof data.inventoryId !== 'string' || !data.inventoryId.trim()) {
        return res.status(400).json({ error: 'Die Inventarnummer darf nicht leer sein.', code: 'INVALID_INVENTORY_ID' });
      }
      
      const existingInventoryId = await prisma.device.findFirst({
        where: { inventoryId: data.inventoryId, NOT: { id: req.params.id } }
      });
      if (existingInventoryId) {
        return res.status(400).json({ error: 'Ein Gerät mit dieser Inventarnummer existiert bereits.', code: 'DUPLICATE_INVENTORY_ID' });
      }
    }

    const device = await prisma.device.update({
      where: { id: req.params.id },
      data
    });
    await prisma.deviceHistory.create({ data: { deviceId: device.id, action: 'updated', userId: req.user.id } });
    res.json({ device: normalizeDevice(device) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requirePermission('DEVICE_DELETE'), async (req, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      // Verknüpfte Loans auflösen (Loan.deviceId hat onDelete: Restrict)
      await tx.loan.updateMany({
        where: { deviceId: req.params.id },
        data: { deviceId: null }
      });
      // Ticket-Verknüpfungen über Junction aufräumen
      try {
        await tx.deviceIssueDevice.deleteMany({ where: { deviceId: req.params.id } });
      } catch (e) {
        // ignore
      }
      // Update-Ergebnisse aufräumen
      try {
        await tx.deviceUpdateResult.deleteMany({ where: { deviceId: req.params.id } });
      } catch (e) {
        // ignore
      }
      // DeviceIssue.deviceId auf null setzen falls noch verknüpft
      try {
        await tx.deviceIssue.updateMany({ where: { deviceId: req.params.id }, data: { deviceId: null } });
      } catch (e) {
        // ignore
      }
      // Gerät löschen
      await tx.device.delete({ where: { id: req.params.id } });
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/:id/qr', auth, async (req, res, next) => {
  try {
    const role = req.user?.effectiveRole || req.user?.role;
    if (role === 'VIEWER') return res.status(403).json({ error: 'Keine Berechtigung für QR-Export', code: 'FORBIDDEN' });
    const device = await prisma.device.findFirst({ where: { OR: [{ id: req.params.id }, { inventoryId: req.params.id }] } });
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    res.type('png').send(await qrPng(device));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/label', auth, async (req, res, next) => {
  try {
    const role = req.user?.effectiveRole || req.user?.role;
    if (role === 'VIEWER') return res.status(403).json({ error: 'Keine Berechtigung für Label-Export', code: 'FORBIDDEN' });
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
    const device = await prisma.device.findFirst({ where: { OR: [{ id: req.params.id }, { inventoryId: req.params.id }] } });
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    if (!canSeeDevice(req.user, device) && !(await hasActiveLoan(req.user?.id, device.id))) {
      return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    }
    const history = await prisma.deviceHistory.findMany({ where: { deviceId: device.id }, orderBy: { createdAt: 'desc' } });
    res.json({ history });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/images', auth, requirePermission('DEVICE_EDIT'), upload.single('image'), async (req, res, next) => {
  try {
    const device = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen.', code: 'NO_FILE' });
    }
    const imagePath = `/uploads/${path.basename(req.file.path)}`;
    const images = [...parseJsonArray(device.images), imagePath];
    const updated = await prisma.device.update({ where: { id: device.id }, data: { images: JSON.stringify(images) } });
    res.status(201).json({ device: normalizeDevice(updated), imagePath });
  } catch (error) {
    next(error);
  }
});

async function importDevices(rows, userId, onProgress = () => {}) {
  const results = [];
  const skipped = [];
  const allowedStatuses = new Set(DEVICE_STATUSES);
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const emit = (event) => {
    try {
      onProgress(event);
    } catch {}
  };
  const parseDate = (value) => {
    const trimmed = text(value);
    if (!trimmed) return null;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const parseYesNo = (value, defaultValue) => {
    const trimmed = text(value).toLowerCase();
    if (!trimmed) return defaultValue;
    return ['ja', 'yes', 'true', '1', 'wahr', 'an'].includes(trimmed);
  };
  const parseLabels = (value) => {
    if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
    const trimmed = text(value);
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((entry) => text(entry)).filter(Boolean);
      } catch {}
    }
    return trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
  };

  const existingDevices = await prisma.device.findMany({ select: { id: true, inventoryId: true } });
  const usedIds = new Set(existingDevices.map((device) => device.id));
  const usedInventoryIds = new Set(existingDevices.map((device) => device.inventoryId));
  let nextAvailableId = 100;

  for (const row of rows) {
    const inventoryId = text(row.inventoryId);
    try {
      emit({ status: 'creating', inventoryId, row: row._row });
      const requestedDeviceId = text(row.id);
      const manufacturer = text(row.manufacturer);
      const model = text(row.model);
      const status = normalizeDeviceStatus(text(row.status));
      const category = parseCategory(text(row.category) || text(row.deviceType) || text(row.art));
      const skip = (reason) => {
        skipped.push({ inventoryId, reason });
        emit({ status: 'skipped', inventoryId, reason, row: row._row });
      };

      if (!inventoryId || !manufacturer || !model) {
        skip('Pflichtfeld fehlt');
        continue;
      }

      if (!allowedStatuses.has(status)) {
        skip('Ungültiger Status');
        continue;
      }

      if (requestedDeviceId && !/^[a-zA-Z0-9_-]{3,50}$/.test(requestedDeviceId)) {
        skip('Ungültige Geräte-ID');
        continue;
      }

      if (usedInventoryIds.has(inventoryId)) {
        skip('Bereits vorhanden');
        continue;
      }

      if (requestedDeviceId && usedIds.has(requestedDeviceId)) {
        skip(`Geräte-ID "${requestedDeviceId}" existiert bereits`);
        continue;
      }

      let roomId = text(row.roomId) || null;
      if (roomId) {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) {
          skip(`Raum-ID "${roomId}" wurde nicht gefunden`);
          continue;
        }
      } else if (text(row.roomName) || text(row.room)) {
        const roomName = text(row.roomName) || text(row.room);
        const room = await prisma.room.findFirst({ where: { name: roomName } });
        if (!room) {
          skip(`Raum "${roomName}" wurde nicht gefunden`);
          continue;
        }
        roomId = room.id;
      }

      const assignments = await resolveAssignments(row);
      if (assignments.error) {
        skip(assignments.error.error);
        continue;
      }

      const purchaseDate = parseDate(row.purchaseDate);
      const warrantyEnd = parseDate(row.warrantyEnd);
      if (text(row.purchaseDate) && !purchaseDate) {
        skip('Ungültiges Kaufdatum');
        continue;
      }
      if (text(row.warrantyEnd) && !warrantyEnd) {
        skip('Ungültiges Garantieende');
        continue;
      }

      let deviceId = requestedDeviceId;
      if (!deviceId) {
        while (usedIds.has(String(nextAvailableId))) {
          nextAvailableId += 1;
        }
        deviceId = String(nextAvailableId);
      }

      const data = {
        id:             deviceId,
        inventoryId,
        manufacturer,
        model,
        serialNumber:   text(row.serialNumber) || null,
        category,
        icon:           normalizeIcon(text(row.icon) || text(row.symbol)),
        hostname:       text(row.hostname) || null,
        visibility:     normalizeVisibility(text(row.visibility)),
        areaId:         assignments.areaId,
        adminId:        assignments.adminId,
        description:    text(row.description) || null,
        ipAddress:      text(row.ipAddress) || null,
        macAddress:     text(row.macAddress) || null,
        roomId,
        purchaseDate,
        warrantyEnd,
        labels:         JSON.stringify(parseLabels(row.labels)),
        images:         '[]',
        status,
        statusLocked:   parseYesNo(row.statusLocked, false),
        isLendable:     parseYesNo(row.isLendable, false),
        isReportable:   parseYesNo(row.isReportable, false),
        updatesEnabled: parseYesNo(row.updatesEnabled, false),
      };

      const device = await prisma.device.create({ data });
      const qrCode = await deviceUrl(device);
      const updated = await prisma.device.update({ where: { id: device.id }, data: { qrCode } });
      await prisma.deviceHistory.create({ data: { deviceId: device.id, action: 'created', userId } });
      usedIds.add(deviceId);
      usedInventoryIds.add(inventoryId);
      const normalized = normalizeDevice(updated);
      results.push(normalized);
      emit({ status: 'created', inventoryId, deviceId: updated.id, row: row._row });
    } catch (rowErr) {
      const reason = rowErr.message;
      skipped.push({ inventoryId, reason });
      emit({ status: 'skipped', inventoryId, reason, row: row._row });
    }
  }

  return {
    imported: results.length,
    skipped: skipped.length,
    devices: results,
    skippedRows: skipped,
  };
}

router.post('/bulk', auth, requirePermission('DEVICE_CREATE'), async (req, res, next) => {
  try {
    const { devices: rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Keine Geräte im Request-Body.', code: 'EMPTY_BULK' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: 'Maximal 500 Geräte pro Import.', code: 'BULK_TOO_LARGE' });
    }
    const summary = await importDevices(rows, req.user.id);
    res.status(201).json(summary);
  } catch (error) {
    next(error);
  }
});

router.post('/bulk/stream', auth, requirePermission('DEVICE_CREATE'), async (req, res) => {
  const { devices: rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Keine Geräte im Request-Body.', code: 'EMPTY_BULK' });
  }
  if (rows.length > 500) {
    return res.status(400).json({ error: 'Maximal 500 Geräte pro Import.', code: 'BULK_TOO_LARGE' });
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  res.on('close', () => {
    closed = true;
  });
  const write = (event) => {
    if (!closed) res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const summary = await importDevices(rows, req.user.id, write);
    write({ status: 'done', imported: summary.imported, skipped: summary.skipped });
  } catch (error) {
    write({ status: 'error', error: error.message });
  } finally {
    if (!closed) res.end();
  }
});

module.exports = router;
