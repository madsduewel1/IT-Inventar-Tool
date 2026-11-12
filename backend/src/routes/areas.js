const express = require('express');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { requirePermission, enrichUserAccess } = require('../services/permissions');
const { nextId } = require('../services/ids');

const router = express.Router();

// Ausgabeform: Benutzer nur mit harmlosen Feldern (kein Passwort-Hash,
// keine Rechte-Overrides) – die Liste ist für alle Rollen lesbar.
const MEMBER_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  role: true
};

function serializeArea(area, extra = {}) {
  const devices = area.devices || [];
  const freeCount = devices.filter((device) => device.isLendable && device.status === 'AVAILABLE').length;
  const lendableCount = devices.filter((device) => device.isLendable).length;
  const members = (area.members || []).map((member) => ({
    assignedAt: member.assignedAt,
    user: member.user
  }));
  const editors = (area.editors || []).map((editor) => ({
    assignedAt: editor.assignedAt,
    user: editor.user
  }));
  return {
    id: area.id,
    name: area.name,
    description: area.description,
    roomId: area.roomId,
    room: area.room || null,
    lendEnabled: area.lendEnabled,
    individualManagement: area.individualManagement,
    issueMailEnabled: area.issueMailEnabled,
    members,
    memberCount: members.length,
    editors,
    editorCount: editors.length,
    deviceCount: devices.length,
    lendableCount,
    freeCount,
    createdAt: area.createdAt,
    updatedAt: area.updatedAt,
    ...extra
  };
}

const AREA_INCLUDE = {
  room: true,
  members: { include: { user: { select: MEMBER_USER_SELECT } }, orderBy: { assignedAt: 'asc' } },
  editors: { include: { user: { select: MEMBER_USER_SELECT } }, orderBy: { assignedAt: 'asc' } },
  devices: { select: { id: true, inventoryId: true, model: true, status: true, isLendable: true } }
};

/** Validiert den Bereichsnamen. Liefert Fehlermeldung oder null. */
function validateName(name) {
  if (typeof name !== 'string' || !name.trim()) return 'Bereichsname ist erforderlich.';
  if (name.trim().length > 120) return 'Bereichsname ist zu lang (max. 120 Zeichen).';
  return null;
}

router.get('/', auth, requirePermission('AREA_VIEW'), async (req, res, next) => {
  try {
    const areas = await prisma.area.findMany({ include: AREA_INCLUDE, orderBy: { name: 'asc' } });
    let payload = areas.map((area) => serializeArea(area));
    if (req.query.lendable === 'true') {
      // Auswahlliste der Ausleihe-Anfrage: nur Bereiche, in denen tatsächlich
      // ein freies, ausleihbares Gerät liegt.
      payload = payload.filter((area) => area.lendEnabled && area.freeCount > 0);
    }
    res.json({ areas: payload });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, requirePermission('AREA_VIEW'), async (req, res, next) => {
  try {
    const area = await prisma.area.findUnique({ where: { id: req.params.id }, include: AREA_INCLUDE });
    if (!area) return res.status(404).json({ error: 'Bereich nicht gefunden', code: 'AREA_NOT_FOUND' });
    res.json({ area: serializeArea(area) });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requirePermission('AREA_MANAGE'), async (req, res, next) => {
  try {
    const { name, description, roomId, lendEnabled, individualManagement, issueMailEnabled } = req.body || {};
    const nameError = validateName(name);
    if (nameError) return res.status(400).json({ error: nameError, code: 'INVALID_AREA_NAME' });

    const duplicate = await prisma.area.findFirst({ where: { name: name.trim() } });
    if (duplicate) return res.status(409).json({ error: 'Ein Bereich mit diesem Namen existiert bereits.', code: 'DUPLICATE_AREA_NAME' });

    if (roomId) {
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return res.status(400).json({ error: 'Angegebener Raum existiert nicht.', code: 'INVALID_ROOM' });
    }

    const area = await prisma.area.create({
      data: {
        id: await nextId('area'),
        name: name.trim(),
        description: description || null,
        roomId: roomId || null,
        lendEnabled: lendEnabled ?? true,
        individualManagement: individualManagement ?? true,
        issueMailEnabled: issueMailEnabled ?? false
      },
      include: AREA_INCLUDE
    });
    res.status(201).json({ area: serializeArea(area) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', auth, requirePermission('AREA_MANAGE'), async (req, res, next) => {
  try {
    const existing = await prisma.area.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Bereich nicht gefunden', code: 'AREA_NOT_FOUND' });

    const { name, description, roomId, lendEnabled, individualManagement, issueMailEnabled } = req.body || {};
    const data = {};

    if (name !== undefined) {
      const nameError = validateName(name);
      if (nameError) return res.status(400).json({ error: nameError, code: 'INVALID_AREA_NAME' });
      const duplicate = await prisma.area.findFirst({ where: { name: name.trim(), NOT: { id: existing.id } } });
      if (duplicate) return res.status(409).json({ error: 'Ein Bereich mit diesem Namen existiert bereits.', code: 'DUPLICATE_AREA_NAME' });
      data.name = name.trim();
    }
    if (description !== undefined) data.description = description || null;
    if (roomId !== undefined) {
      if (roomId) {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) return res.status(400).json({ error: 'Angegebener Raum existiert nicht.', code: 'INVALID_ROOM' });
      }
      data.roomId = roomId || null;
    }
    if (lendEnabled !== undefined) data.lendEnabled = Boolean(lendEnabled);
    if (individualManagement !== undefined) data.individualManagement = Boolean(individualManagement);
    if (issueMailEnabled !== undefined) data.issueMailEnabled = Boolean(issueMailEnabled);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Keine gültigen Felder zum Aktualisieren', code: 'EMPTY_UPDATE' });
    }

    const area = await prisma.area.update({ where: { id: existing.id }, data, include: AREA_INCLUDE });
    res.json({ area: serializeArea(area) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requirePermission('AREA_MANAGE'), async (req, res, next) => {
  try {
    const area = await prisma.area.findUnique({ where: { id: req.params.id }, include: { devices: { select: { id: true } } } });
    if (!area) return res.status(404).json({ error: 'Bereich nicht gefunden', code: 'AREA_NOT_FOUND' });
    if (area.devices.length > 0) {
      return res.status(409).json({
        error: 'Dem Bereich sind noch Geräte zugeordnet. Bitte zuerst die Zuordnung der Geräte ändern oder löschen.',
        code: 'AREA_HAS_DEVICES'
      });
    }
    await prisma.area.delete({ where: { id: area.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * Validiert eine Personenliste (nur IT/Administratoren, Abschnitt 9.1).
 * Liefert `{ userIds, invalid }` – `invalid` beschreibt die abgelehnten Einträge.
 */
async function validateAreaUsers(rawIds) {
  const userIds = rawIds == null ? null : [...new Set(rawIds.filter(Boolean).map(String))];
  if (!userIds) return { userIds: null, invalid: [] };
  const invalid = [];
  for (const userId of userIds) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      invalid.push(userId);
      continue;
    }
    const enriched = await enrichUserAccess(user);
    if (!['STAFF', 'ADMIN'].includes(enriched.effectiveRole)) invalid.push(user.username || userId);
  }
  return { userIds, invalid };
}

/** Ersetzt die Mitglieder- oder Bearbeiterliste eines Bereichs. */
async function replaceAreaUsers(table, areaId, userIds) {
  return prisma.$transaction(async (tx) => {
    await tx[table].deleteMany({ where: { areaId } });
    if (userIds.length === 0) return [];
    await tx[table].createMany({
      data: userIds.map((userId) => ({ areaId, userId })),
      skipDuplicates: true
    });
    return tx[table].findMany({
      where: { areaId },
      include: { user: { select: MEMBER_USER_SELECT } },
      orderBy: { assignedAt: 'asc' }
    });
  });
}

/**
 * PUT /api/areas/:id/members
 * Ersetzt die E-Mail-Empfängerliste. Zugelassen sind nur Benutzer mit der
 * effektiven Rolle IT oder Administrator (Abschnitt 9.1).
 */
router.put('/:id/members', auth, requirePermission('AREA_MANAGE'), async (req, res, next) => {
  try {
    const area = await prisma.area.findUnique({ where: { id: req.params.id } });
    if (!area) return res.status(404).json({ error: 'Bereich nicht gefunden', code: 'AREA_NOT_FOUND' });

    const { userIds, invalid } = await validateAreaUsers(req.body?.userIds);
    if (!userIds) return res.status(400).json({ error: 'Mitgliederliste fehlt.', code: 'INVALID_MEMBERS' });
    if (invalid.length > 0) {
      return res.status(400).json({
        error: `Mitglieder müssen der Rolle IT oder Administrator angehören: ${invalid.join(', ')}`,
        code: 'INVALID_AREA_MEMBER'
      });
    }

    const members = await replaceAreaUsers('areaMember', area.id, userIds);
    const updated = await prisma.area.findUnique({ where: { id: area.id }, include: AREA_INCLUDE });
    res.json({ area: serializeArea(updated), memberCount: members.length });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/areas/:id/editors
 * Ersetzt die Bearbeiterliste (zuständige Personen, die Tickets der Geräte des
 * Bereichs bearbeiten dürfen). Zugelassen sind nur IT/Administratoren.
 */
router.put('/:id/editors', auth, requirePermission('AREA_MANAGE'), async (req, res, next) => {
  try {
    const area = await prisma.area.findUnique({ where: { id: req.params.id } });
    if (!area) return res.status(404).json({ error: 'Bereich nicht gefunden', code: 'AREA_NOT_FOUND' });

    const { userIds, invalid } = await validateAreaUsers(req.body?.userIds);
    if (!userIds) return res.status(400).json({ error: 'Bearbeiterliste fehlt.', code: 'INVALID_EDITORS' });
    if (invalid.length > 0) {
      return res.status(400).json({
        error: `Bearbeiter müssen der Rolle IT oder Administrator angehören: ${invalid.join(', ')}`,
        code: 'INVALID_AREA_EDITOR'
      });
    }

    const editors = await replaceAreaUsers('areaEditor', area.id, userIds);
    const updated = await prisma.area.findUnique({ where: { id: area.id }, include: AREA_INCLUDE });
    res.json({ area: serializeArea(updated), editorCount: editors.length });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
