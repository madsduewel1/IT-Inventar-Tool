const express = require('express');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { requirePermission, hasPermission } = require('../services/permissions');
const { resolveAssigneeUsers } = require('../services/issues');
const { ISSUE_TYPE_LABELS } = require('../services/issueMeta');

const router = express.Router();

const TYPES = ['DEVICE', 'PERSONAL', 'WLAN', 'SOFTWARE'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
const VISIBILITIES = ['ALL', 'STAFF', 'ADMIN'];
const VISIBILITY_LEVEL = { ALL: 0, STAFF: 1, ADMIN: 2 };
const MAX_RECIPIENTS = 25;
const MAX_ATTACHMENTS_LIMIT = 50;

const TEMPLATE_INCLUDE = {
  area: { select: { id: true, name: true } },
  assignees: {
    include: { user: { select: { id: true, username: true, displayName: true } } },
    orderBy: { user: { username: 'asc' } }
  },
  recipients: { orderBy: { email: 'asc' } },
  _count: { select: { versions: true, issues: true } }
};

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
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

function normalizeFieldHelp(value) {
  const raw = parseJson(value, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  for (const key of ['title', 'description', 'priority', 'attachments']) {
    if (typeof raw[key] === 'string' && raw[key].trim()) result[key] = raw[key].trim().slice(0, 1000);
  }
  return result;
}

function normalizeRecipients(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const entry of list) {
    const email = String(typeof entry === 'string' ? entry : entry?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    const name = typeof entry === 'object' && entry?.name ? String(entry.name).trim().slice(0, 120) : null;
    result.push({ email, name });
    if (result.length >= MAX_RECIPIENTS) break;
  }
  return result;
}

function userVisibilityLevel(user) {
  const role = user?.effectiveRole || user?.role || 'VIEWER';
  if (role === 'ADMIN' || hasPermission(user, 'ADMIN')) return 2;
  if (role === 'STAFF') return 1;
  return 0;
}

function canSeeTemplate(user, template) {
  if (!template?.active && !hasPermission(user, 'TEMPLATE_MANAGE')) return false;
  const level = userVisibilityLevel(user);
  if (level < (VISIBILITY_LEVEL[template.visibility] ?? 0)) return false;
  const groups = normalizeGroups(template.visibilityGroups);
  if (groups.length > 0) {
    const userGroups = normalizeGroups(user?.ssoGroups);
    if (!groups.some((group) => userGroups.includes(group))) return false;
  }
  return true;
}

function serializeTemplate(template, options = {}) {
  if (!template) return template;
  const { assignees, recipients, _count, ...rest } = template;
  const serialized = {
    ...rest,
    visibilityGroups: normalizeGroups(template.visibilityGroups),
    fieldHelp: normalizeFieldHelp(template.fieldHelp),
    typeLabel: template.type ? (ISSUE_TYPE_LABELS[template.type] || template.type) : null,
    assignees: (assignees || []).map((entry) => ({
      id: entry.user.id,
      username: entry.user.username,
      displayName: entry.user.displayName
    })),
    recipientCount: (recipients || []).length,
    versionCount: _count?.versions ?? 0,
    issueCount: _count?.issues ?? 0
  };
  if (options.includeAdmin) {
    serialized.recipients = (recipients || []).map((entry) => ({ email: entry.email, name: entry.name }));
  }
  return serialized;
}

function serializeSnapshot(template) {
  const data = serializeTemplate(template, { includeAdmin: true });
  delete data.versionCount;
  delete data.issueCount;
  delete data.createdAt;
  delete data.updatedAt;
  return data;
}

async function validatePayload(body, existing = null) {
  const name = String(body.name ?? existing?.name ?? '').trim();
  if (!name) return { error: 'Der Vorlagenname ist ein Pflichtfeld.' };
  if (name.length > 120) return { error: 'Der Vorlagenname darf höchstens 120 Zeichen lang sein.' };

  const areaIdRaw = body.areaId !== undefined ? body.areaId : existing?.areaId;
  const areaId = areaIdRaw ? String(areaIdRaw) : null;
  let area = null;
  if (areaId) {
    area = await prisma.area.findUnique({ where: { id: areaId } });
    if (!area) return { error: 'Der zugeordnete Gerätebereich wurde nicht gefunden.' };
  }

  const typeRaw = body.type !== undefined ? body.type : existing?.type;
  const type = typeRaw ? String(typeRaw).toUpperCase() : null;
  if (type && !TYPES.includes(type)) return { error: 'Unbekannte Ticketart.' };
  if (!areaId && !type) return { error: 'Bitte eine Ticketart oder einen Gerätebereich zuordnen.' };
  if (areaId && type && type !== 'DEVICE') {
    return { error: 'Ein Gerätebereich kann nur der Ticketart „Schulgerät“ zugeordnet werden.' };
  }

  const visibilityRaw = body.visibility !== undefined ? String(body.visibility).toUpperCase() : existing?.visibility || 'ALL';
  const visibility = VISIBILITIES.includes(visibilityRaw) ? visibilityRaw : 'ALL';

  const priorityRaw = body.priority !== undefined ? String(body.priority).toUpperCase() : existing?.priority || 'NORMAL';
  const priority = PRIORITIES.includes(priorityRaw) ? priorityRaw : 'NORMAL';

  const attachmentsAllowed = body.attachmentsAllowed !== undefined
    ? Boolean(body.attachmentsAllowed)
    : (existing?.attachmentsAllowed ?? true);
  const maxAttachmentsRaw = body.maxAttachments !== undefined ? Number(body.maxAttachments) : (existing?.maxAttachments ?? 10);
  const maxAttachments = Number.isFinite(maxAttachmentsRaw)
    ? Math.min(MAX_ATTACHMENTS_LIMIT, Math.max(0, Math.round(maxAttachmentsRaw)))
    : 10;

  const assigneeIds = Array.isArray(body.assigneeIds)
    ? body.assigneeIds.filter(Boolean).map(String)
    : (existing?.assignees || []).map((entry) => entry.userId);
  const assignees = await resolveAssigneeUsers([...new Set(assigneeIds)]);
  if (assignees.length !== new Set(assigneeIds).size) {
    return { error: 'Mindestens ein Standardbearbeiter ist kein gültiger IT-/Admin-Benutzer.' };
  }

  const recipients = normalizeRecipients(body.recipients !== undefined
    ? body.recipients
    : (existing?.recipients || []).map((entry) => ({ email: entry.email, name: entry.name })));

  const sortOrderRaw = body.sortOrder !== undefined ? Number(body.sortOrder) : existing?.sortOrder;
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.round(sortOrderRaw) : 0;

  return {
    data: {
      name,
      description: body.description !== undefined ? String(body.description || '').trim() || null : existing?.description ?? null,
      icon: body.icon !== undefined ? String(body.icon || '').trim() || null : existing?.icon ?? null,
      color: body.color !== undefined ? String(body.color || '').trim() || null : existing?.color ?? null,
      active: body.active !== undefined ? Boolean(body.active) : (existing?.active ?? true),
      sortOrder,
      type,
      areaId,
      visibility,
      visibilityGroups: JSON.stringify(Array.isArray(body.visibilityGroups)
        ? body.visibilityGroups.filter(Boolean).map(String)
        : (existing ? normalizeGroups(existing.visibilityGroups) : [])),
      priority,
      descriptionHint: body.descriptionHint !== undefined ? String(body.descriptionHint || '').trim() || null : existing?.descriptionHint ?? null,
      fieldHelp: JSON.stringify(body.fieldHelp !== undefined ? normalizeFieldHelp(body.fieldHelp) : normalizeFieldHelp(existing?.fieldHelp)),
      confirmationMessage: body.confirmationMessage !== undefined ? String(body.confirmationMessage || '').trim() || null : existing?.confirmationMessage ?? null,
      attachmentsAllowed,
      maxAttachments
    },
    assignees,
    recipients,
    area
  };
}

async function replaceRelations(tx, templateId, assignees, recipients) {
  await tx.issueTemplateAssignee.deleteMany({ where: { templateId } });
  if (assignees.length) {
    await tx.issueTemplateAssignee.createMany({
      data: assignees.map((user) => ({ templateId, userId: user.id })),
      skipDuplicates: true
    });
  }
  await tx.issueTemplateRecipient.deleteMany({ where: { templateId } });
  if (recipients.length) {
    await tx.issueTemplateRecipient.createMany({
      data: recipients.map((entry) => ({ templateId, email: entry.email, name: entry.name || null })),
      skipDuplicates: true
    });
  }
}

async function createVersion(tx, templateId, createdById) {
  const template = await tx.issueTemplate.findUnique({ where: { id: templateId }, include: TEMPLATE_INCLUDE });
  const count = await tx.issueTemplateVersion.count({ where: { templateId } });
  await tx.issueTemplateVersion.create({
    data: {
      templateId,
      version: count + 1,
      snapshot: JSON.stringify(serializeSnapshot(template)),
      createdById: createdById || null
    }
  });
}

// Aktive, für den Benutzer sichtbare Vorlagen für das Ticketformular.
router.get('/', auth, async (req, res, next) => {
  try {
    const { type, areaId } = req.query;
    const where = { active: true };
    if (type && TYPES.includes(String(type).toUpperCase())) where.type = String(type).toUpperCase();
    if (areaId) where.areaId = String(areaId);
    const templates = await prisma.issueTemplate.findMany({
      where,
      include: TEMPLATE_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });
    res.json({ templates: templates.filter((template) => canSeeTemplate(req.user, template)).map((template) => serializeTemplate(template)) });
  } catch (error) {
    next(error);
  }
});

// Alle Vorlagen für die Administration (auch deaktivierte).
router.get('/all', auth, requirePermission('TEMPLATE_MANAGE'), async (req, res, next) => {
  try {
    const templates = await prisma.issueTemplate.findMany({
      include: TEMPLATE_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });
    res.json({ templates: templates.map((template) => serializeTemplate(template, { includeAdmin: true })) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/versions', auth, requirePermission('TEMPLATE_MANAGE'), async (req, res, next) => {
  try {
    const versions = await prisma.issueTemplateVersion.findMany({
      where: { templateId: req.params.id },
      orderBy: { version: 'desc' }
    });
    res.json({
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        createdAt: version.createdAt,
        createdById: version.createdById,
        snapshot: parseJson(version.snapshot, {})
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, requirePermission('TEMPLATE_MANAGE'), async (req, res, next) => {
  try {
    const template = await prisma.issueTemplate.findUnique({ where: { id: req.params.id }, include: TEMPLATE_INCLUDE });
    if (!template) return res.status(404).json({ error: 'Vorlage nicht gefunden', code: 'TEMPLATE_NOT_FOUND' });
    res.json({ template: serializeTemplate(template, { includeAdmin: true }) });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requirePermission('TEMPLATE_MANAGE'), async (req, res, next) => {
  try {
    const validation = await validatePayload(req.body || {});
    if (validation.error) return res.status(400).json({ error: validation.error, code: 'INVALID_TEMPLATE' });

    const template = await prisma.$transaction(async (tx) => {
      let sortOrder = validation.data.sortOrder;
      if (req.body.sortOrder === undefined) {
        const last = await tx.issueTemplate.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
        sortOrder = (last?.sortOrder ?? 0) + 10;
      }
      const created = await tx.issueTemplate.create({
        data: { ...validation.data, sortOrder, createdById: req.user.id }
      });
      await replaceRelations(tx, created.id, validation.assignees, validation.recipients);
      await createVersion(tx, created.id, req.user.id);
      return tx.issueTemplate.findUnique({ where: { id: created.id }, include: TEMPLATE_INCLUDE });
    });

    res.status(201).json({ template: serializeTemplate(template, { includeAdmin: true }) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', auth, requirePermission('TEMPLATE_MANAGE'), async (req, res, next) => {
  try {
    const existing = await prisma.issueTemplate.findUnique({
      where: { id: req.params.id },
      include: { assignees: true, recipients: true }
    });
    if (!existing) return res.status(404).json({ error: 'Vorlage nicht gefunden', code: 'TEMPLATE_NOT_FOUND' });

    const validation = await validatePayload(req.body || {}, existing);
    if (validation.error) return res.status(400).json({ error: validation.error, code: 'INVALID_TEMPLATE' });

    const template = await prisma.$transaction(async (tx) => {
      await tx.issueTemplate.update({ where: { id: existing.id }, data: validation.data });
      await replaceRelations(tx, existing.id, validation.assignees, validation.recipients);
      await createVersion(tx, existing.id, req.user.id);
      return tx.issueTemplate.findUnique({ where: { id: existing.id }, include: TEMPLATE_INCLUDE });
    });

    res.json({ template: serializeTemplate(template, { includeAdmin: true }) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requirePermission('TEMPLATE_MANAGE'), async (req, res, next) => {
  try {
    const existing = await prisma.issueTemplate.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Vorlage nicht gefunden', code: 'TEMPLATE_NOT_FOUND' });
    await prisma.issueTemplate.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.canSeeTemplate = canSeeTemplate;
module.exports.serializeTemplate = serializeTemplate;
module.exports.normalizeFieldHelp = normalizeFieldHelp;
module.exports.normalizeRecipients = normalizeRecipients;
