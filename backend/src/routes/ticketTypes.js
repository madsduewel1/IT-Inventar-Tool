const express = require('express');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { requirePermission, enrichUserAccess } = require('../services/permissions');
const { ISSUE_TYPE_LABELS } = require('../services/issueMeta');

const router = express.Router();

// Konfigurierbare Ticketarten: Netzwerk (WLAN), Dienstgerät (PERSONAL) und
// Software (SOFTWARE). Schulgerät-Tickets (DEVICE) laufen über die Bereiche –
// die Zuständigkeiten werden dort gepflegt, nicht hier.
const MANAGED_TYPES = ['WLAN', 'PERSONAL', 'SOFTWARE'];

const MEMBER_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  role: true
};

function serializeType(type, entry) {
  const members = (entry?.members || []).map((member) => ({
    assignedAt: member.assignedAt,
    user: member.user
  }));
  const editors = (entry?.editors || []).map((editor) => ({
    assignedAt: editor.assignedAt,
    user: editor.user
  }));
  return {
    type,
    label: ISSUE_TYPE_LABELS[type] || type,
    members,
    memberCount: members.length,
    editors,
    editorCount: editors.length
  };
}

/** Validiert eine Personenliste (nur IT/Administratoren) – analog Bereiche. */
async function validateTypeUsers(rawIds) {
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

/** Ersetzt die Mitglieder- oder Bearbeiterliste einer Ticketart. */
async function replaceTypeUsers(table, type, userIds) {
  return prisma.$transaction(async (tx) => {
    await tx[table].deleteMany({ where: { type } });
    if (userIds.length === 0) return [];
    await tx[table].createMany({
      data: userIds.map((userId) => ({ type, userId })),
      skipDuplicates: true
    });
    return tx[table].findMany({
      where: { type },
      include: { user: { select: MEMBER_USER_SELECT } },
      orderBy: { assignedAt: 'asc' }
    });
  });
}

function isValidType(type) {
  return typeof type === 'string' && MANAGED_TYPES.includes(type);
}

/**
 * GET /api/ticket-types
 * Zuständigkeiten je Ticketart (E-Mail-Empfänger und Bearbeiter).
 */
router.get('/', auth, requirePermission('AREA_VIEW'), async (req, res, next) => {
  try {
    const [members, editors] = await Promise.all([
      prisma.issueTypeMember.findMany({
        where: { type: { in: MANAGED_TYPES } },
        include: { user: { select: MEMBER_USER_SELECT } },
        orderBy: { assignedAt: 'asc' }
      }),
      prisma.issueTypeEditor.findMany({
        where: { type: { in: MANAGED_TYPES } },
        include: { user: { select: MEMBER_USER_SELECT } },
        orderBy: { assignedAt: 'asc' }
      })
    ]);

    const byType = (rows, key) => {
      const map = new Map();
      for (const row of rows) {
        if (!map.has(row.type)) map.set(row.type, []);
        map.get(row.type).push(row);
      }
      return { key, map };
    };

    const membersByType = byType(members, 'members').map;
    const editorsByType = byType(editors, 'editors').map;

    const types = MANAGED_TYPES.map((type) => serializeType(type, {
      members: membersByType.get(type) || [],
      editors: editorsByType.get(type) || []
    }));

    res.json({ types });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/ticket-types/:type/members
 * Ersetzt die E-Mail-Empfängerliste einer Ticketart.
 */
router.put('/:type/members', auth, requirePermission('AREA_MANAGE'), async (req, res, next) => {
  try {
    if (!isValidType(req.params.type)) {
      return res.status(404).json({ error: 'Unbekannte Ticketart', code: 'INVALID_TYPE' });
    }

    const { userIds, invalid } = await validateTypeUsers(req.body?.userIds);
    if (!userIds) return res.status(400).json({ error: 'Empfängerliste fehlt.', code: 'INVALID_MEMBERS' });
    if (invalid.length > 0) {
      return res.status(400).json({
        error: `Empfänger müssen der Rolle IT oder Administrator angehören: ${invalid.join(', ')}`,
        code: 'INVALID_TICKET_TYPE_MEMBER'
      });
    }

    await replaceTypeUsers('issueTypeMember', req.params.type, userIds);
    const entry = {
      members: await prisma.issueTypeMember.findMany({
        where: { type: req.params.type },
        include: { user: { select: MEMBER_USER_SELECT } },
        orderBy: { assignedAt: 'asc' }
      }),
      editors: await prisma.issueTypeEditor.findMany({
        where: { type: req.params.type },
        include: { user: { select: MEMBER_USER_SELECT } },
        orderBy: { assignedAt: 'asc' }
      })
    };
    res.json({ type: serializeType(req.params.type, entry) });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/ticket-types/:type/editors
 * Ersetzt die Bearbeiterliste einer Ticketart.
 */
router.put('/:type/editors', auth, requirePermission('AREA_MANAGE'), async (req, res, next) => {
  try {
    if (!isValidType(req.params.type)) {
      return res.status(404).json({ error: 'Unbekannte Ticketart', code: 'INVALID_TYPE' });
    }

    const { userIds, invalid } = await validateTypeUsers(req.body?.userIds);
    if (!userIds) return res.status(400).json({ error: 'Bearbeiterliste fehlt.', code: 'INVALID_EDITORS' });
    if (invalid.length > 0) {
      return res.status(400).json({
        error: `Bearbeiter müssen der Rolle IT oder Administrator angehören: ${invalid.join(', ')}`,
        code: 'INVALID_TICKET_TYPE_EDITOR'
      });
    }

    await replaceTypeUsers('issueTypeEditor', req.params.type, userIds);
    const entry = {
      members: await prisma.issueTypeMember.findMany({
        where: { type: req.params.type },
        include: { user: { select: MEMBER_USER_SELECT } },
        orderBy: { assignedAt: 'asc' }
      }),
      editors: await prisma.issueTypeEditor.findMany({
        where: { type: req.params.type },
        include: { user: { select: MEMBER_USER_SELECT } },
        orderBy: { assignedAt: 'asc' }
      })
    };
    res.json({ type: serializeType(req.params.type, entry) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;