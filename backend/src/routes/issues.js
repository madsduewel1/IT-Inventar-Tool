const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const prisma = require('../config/prisma');
const config = require('../config/config');
const { auth } = require('../middleware/auth');
const { hasPermission, requirePermission } = require('../services/permissions');
const { nextId } = require('../services/ids');
const {
  notifyTicketCreated,
  notifyAreaIssueCreated,
  notifyIssueTypeCreated,
  notifyTicketUpdated,
  notifyIssueAssigneesCreated,
  notifyTemplateRecipients,
  notifyTicketComment
} = require('../services/mailNotify');
const { canSeeTemplate } = require('./issueTemplates');
const { enqueue } = require('../services/mailQueue');
const { isConfigured, getMailSettings } = require('../services/mailer');
const { getSettingCached } = require('../services/settingsCache');
const { findByOrCreateRoom } = require('../services/rooms');
const {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_TYPE_LABELS
} = require('../services/issueMeta');
const {
  ISSUE_INCLUDE,
  LEGACY_STATUSES,
  canEditIssue,
  contextLabel,
  filterAssignableUsers,
  issueDevices,
  normalizeIssue,
  normalizeStatus,
  syncDevicesForIssue,
  resolveAssigneeUsers,
  resolveDevices,
  setIssueAssignees
} = require('../services/issues');

const router = express.Router();

// Gemeinsame Include-Definition (inkl. Gerät + weiterer Geräte) aus dem Service
const include = ISSUE_INCLUDE;

const TYPES = ['DEVICE', 'PERSONAL', 'WLAN', 'SOFTWARE'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'CLOSED'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
const MAX_ATTACHMENTS = 10;
const MAX_DEVICES_PER_ISSUE = 50;

const STATUS_LABELS = ISSUE_STATUS_LABELS;

const PRIORITY_LABELS = ISSUE_PRIORITY_LABELS;

const TYPE_LABELS = ISSUE_TYPE_LABELS;

// ── Anhänge (Dateien/Bilder) ────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9_.-]/gi, '_')}`)
});
const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 }
});

router.use(auth);

/**
 * POST /api/issues/attachments
 * Lädt Dateien hoch und liefert Metadaten, die beim Erstellen des Tickets
 * im attachments-Feld übergeben werden.
 */
router.post('/attachments', requirePermission('ISSUE_CREATE'), upload.array('files', MAX_ATTACHMENTS), (req, res) => {
  const files = (req.files || []).map((file) => ({
    name: file.originalname,
    filename: file.filename,
    url: `/api/issues/attachments/${encodeURIComponent(file.filename)}`,
    size: file.size,
    type: file.mimetype
  }));
  if (files.length === 0) {
    return res.status(400).json({ error: 'Keine Dateien erhalten', code: 'NO_FILES' });
  }
  res.status(201).json({ files });
});

/**
 * GET /api/issues/attachments/:filename
 * Liefert eine hochgeladene Datei (authentifiziert, Pfad-Traversal geschützt).
 */
router.get('/attachments/:filename', (req, res, next) => {
  try {
    const fileName = path.basename(req.params.filename);
    const filePath = path.join(config.uploadDir, fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Datei nicht gefunden', code: 'NOT_FOUND' });
    }
    // Schutz vor Stored XSS: Nur harmlose Typen dürfen inline gerendert werden.
    // Alles andere (z. B. .html/.svg/.js) wird als Download ausgeliefert.
    const inlineSafe = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.txt', '.log'].includes(path.extname(fileName).toLowerCase());
    const options = inlineSafe ? {} : {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`
      }
    };
    res.sendFile(filePath, options);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/issues
 * „Meine Tickets": Nur Tickets, die der aktuelle Benutzer selbst erstellt
 * hat (als Ersteller/Reporter). Optional nach Status filterbar (Alle /
 * Offen / In Bearbeitung / Warten / Geschlossen).
 */
router.get('/', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'ISSUE_VIEW')) {
      return res.status(403).json({ error: 'Keine Berechtigung', code: 'FORBIDDEN' });
    }

    const { status } = req.query;
    const where = {
      reporterId: req.user.id,
      deletedAt: null
    };
    if (status) {
      if (LEGACY_STATUSES.includes(status)) {
        where.status = { in: [...LEGACY_STATUSES, 'CLOSED'] };
      } else if (STATUSES.includes(status)) {
        // Alt-Tickets mit DONE/REJECTED zählen als „Geschlossen"
        where.status = status === 'CLOSED' ? { in: ['CLOSED', ...LEGACY_STATUSES] } : status;
      }
    }

    const issues = await prisma.deviceIssue.findMany({
      where,
      include,
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ issues: issues.map(normalizeIssue), canManage: hasPermission(req.user, 'ISSUE_MANAGE') });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/issues/all
 * Alle Tickets für das IT-Board. Filter per Query-Parameter.
 */
router.get('/all', requirePermission('ISSUE_MANAGE'), async (req, res, next) => {
  try {
    const { status, type, roomId, assigneeId, primaryAssigneeId, reporterId, templateId, search, sort } = req.query;
    const where = { deletedAt: null };

    if (status) {
      if (LEGACY_STATUSES.includes(status)) {
        where.status = { in: [...LEGACY_STATUSES, 'CLOSED'] };
      } else if (STATUSES.includes(status)) {
        // Alt-Tickets mit DONE/REJECTED zählen als „Geschlossen"
        where.status = status === 'CLOSED' ? { in: ['CLOSED', ...LEGACY_STATUSES] } : status;
      }
    }
    if (type && TYPES.includes(type)) where.type = type;
    if (roomId) where.roomId = roomId;
    // Filter nach Bearbeiter: trifft auf alle Bearbeiter zu (auch Mehrfachzuweisung).
    if (assigneeId) where.assignments = { some: { userId: assigneeId } };
    if (primaryAssigneeId) where.primaryAssigneeId = primaryAssigneeId;
    if (templateId) where.templateId = templateId;
    if (reporterId) where.reporterId = reporterId;
    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { title: { contains: term } },
        { description: { contains: term } },
        { softwareName: { contains: term } },
        { reporterEmail: { contains: term } },
        { device: { inventoryId: { contains: term } } },
        { device: { model: { contains: term } } },
        { extraDevices: { some: { device: { OR: [{ inventoryId: { contains: term } }, { model: { contains: term } }] } } } },
        { room: { name: { contains: term } } },
        { reporter: { username: { contains: term } } },
        { assignee: { username: { contains: term } } },
        { assignments: { some: { user: { username: { contains: term } } } } }
      ];
    }

    const orderBy = {
      updated: { updatedAt: 'desc' },
      created: { createdAt: 'desc' },
      priority: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      oldest: { createdAt: 'asc' }
    }[sort] || { updatedAt: 'desc' };

    const issues = await prisma.deviceIssue.findMany({ where, include, orderBy });

    // Zähler für das IT-Board (über alle Tickets, nicht von Filtern abhängig)
    const statusCounts = await prisma.deviceIssue.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true });
    const counts = { OPEN: 0, IN_PROGRESS: 0, WAITING: 0, CLOSED: 0 };
    for (const row of statusCounts) {
      const key = normalizeStatus(row.status);
      if (key in counts) counts[key] += row._count;
    }

    res.json({ issues: issues.map(normalizeIssue), counts });
  } catch (error) {
    next(error);
  }
});

router.get('/assignees', requirePermission('ISSUE_MANAGE'), async (req, res, next) => {
  try {
    // Nur IT (STAFF) und Administratoren sind als Zuständige wählbar – normale
    // Benutzer (VIEWER) bearbeiten keine Tickets. Die effektive Rolle wird über
    // SSO-Gruppen ermittelt, damit die Liste zur tatsächlichen Berechtigung passt.
    // Die Rolle wird bewusst nicht mitgeliefert: die Auswahl zeigt nur Namen.
    const users = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true, role: true, ssoGroups: true, permissions: true, revokedPermissions: true },
      orderBy: { username: 'asc' }
    });
    const assignable = await filterAssignableUsers(users);
    res.json({
      assignees: assignable.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/trash', requirePermission('ISSUE_DELETE'), async (req, res, next) => {
  try {
    const issues = await prisma.deviceIssue.findMany({
      where: { deletedAt: { not: null } },
      include,
      orderBy: { deletedAt: 'desc' }
    });
    res.json({ issues: issues.map((issue) => normalizeIssue(issue, { includeInternal: true })) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const issue = await prisma.deviceIssue.findUnique({ where: { id: req.params.id }, include });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });

    // Beteiligt = Ersteller oder einer der Bearbeiter (Mehrfachzuweisung).
    const isInvolved = issue.reporterId === req.user.id
      || issue.assigneeId === req.user.id
      || issue.primaryAssigneeId === req.user.id
      || (issue.assignments || []).some((entry) => entry.userId === req.user.id);
    const isAdmin = hasPermission(req.user, 'ADMIN');
    if (issue.deletedAt && !isAdmin && !hasPermission(req.user, 'ISSUE_DELETE')) {
      return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });
    }
    if (!hasPermission(req.user, 'ISSUE_MANAGE') && !isInvolved && !isAdmin) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Ticket', code: 'FORBIDDEN' });
    }

    const canManage = await canEditIssue(req.user, issue);
    res.json({
      issue: normalizeIssue(issue, { includeInternal: canManage }),
      canManage,
      canRestore: Boolean(issue.deletedAt && hasPermission(req.user, 'ISSUE_DELETE'))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/issues
 * Erstellt ein Ticket – je Ticketart gelten eigene Pflichtfelder:
 *  - DEVICE:   deviceIds (ein oder mehrere Inventargeräte) + Titel + Beschreibung
 *  - PERSONAL: Titel + Beschreibung
 *  - WLAN:     roomId + Titel + Beschreibung
 *  - SOFTWARE: softwareName + Titel + Beschreibung
 */
router.post('/', requirePermission('ISSUE_CREATE'), async (req, res, next) => {
  try {
    const { type = 'DEVICE', title, description, priority, deviceIds, deviceId, roomId, roomName, softwareName, assigneeId, primaryAssigneeId, reporterId, attachments, templateId } = req.body;

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Titel und Beschreibung sind Pflichtfelder', code: 'INVALID_ISSUE_INPUT' });
    }
    if (!TYPES.includes(type)) {
      return res.status(400).json({ error: 'Unbekannte Ticketart', code: 'INVALID_TYPE' });
    }

    let resolvedDevices = [];
    let resolvedRoom = null;

    // Ein IT-Mitarbeiter kann ein Ticket im Auftrag einer anderen Person
    // erstellen: Diese Person wird dann als Ersteller (Reporter) geführt.
    let resolvedReporterId = req.user.id;
    let reporterLabel = null;
    if (reporterId && hasPermission(req.user, 'ISSUE_MANAGE') && reporterId !== req.user.id) {
      const reporter = await prisma.user.findUnique({ where: { id: reporterId }, select: { id: true, username: true, displayName: true } });
      if (!reporter) {
        return res.status(400).json({ error: 'Person nicht gefunden', code: 'INVALID_REPORTER' });
      }
      resolvedReporterId = reporterId;
      reporterLabel = reporter.displayName || reporter.username;
    }

    if (type === 'DEVICE') {
      // deviceIds (Mehrfachauswahl) mit Rückfall auf das einfache deviceId-Feld.
      const requested = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
      if (requested.filter(Boolean).length === 0) {
        return res.status(400).json({ error: 'Bitte mindestens ein Inventargerät auswählen', code: 'INVALID_DEVICE' });
      }
      if (requested.length > MAX_DEVICES_PER_ISSUE) {
        return res.status(400).json({ error: `Es können höchstens ${MAX_DEVICES_PER_ISSUE} Geräte ausgewählt werden`, code: 'TOO_MANY_DEVICES' });
      }
      resolvedDevices = await resolveDevices(requested);
      if (resolvedDevices.length === 0) {
        return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });
      }
      if (resolvedDevices.length < new Set(requested.filter(Boolean)).size) {
        return res.status(404).json({ error: 'Mindestens eines der ausgewählten Geräte wurde nicht gefunden', code: 'DEVICE_NOT_FOUND' });
      }
      const notReportable = resolvedDevices.find((device) => !device.isReportable);
      if (notReportable) {
        return res.status(409).json({
          error: `Für ${notReportable.inventoryId} können keine Fehler gemeldet werden`,
          code: 'DEVICE_NOT_REPORTABLE'
        });
      }
    } else if (type === 'WLAN') {
      const givenRoomName = typeof roomName === 'string' ? roomName.trim() : '';
      if (roomId) {
        resolvedRoom = await prisma.room.findUnique({ where: { id: roomId } });
        if (!resolvedRoom) return res.status(404).json({ error: 'Raum nicht gefunden', code: 'ROOM_NOT_FOUND' });
      } else if (givenRoomName) {
        // Freie Raumeingabe: Raum wird bei Bedarf automatisch angelegt.
        resolvedRoom = await findByOrCreateRoom(givenRoomName);
      } else {
        return res.status(400).json({ error: 'Bitte einen Raum angeben', code: 'INVALID_ROOM' });
      }
    } else if (type === 'SOFTWARE') {
      if (!softwareName?.trim()) {
        return res.status(400).json({ error: 'Bitte die Software angeben', code: 'INVALID_SOFTWARE' });
      }
    }

    // Optionale Ticket-Vorlage: liefert Standardpriorität, -bearbeiter,
    // zusätzliche Mail-Empfänger und Anhangsregeln. Bestehende Tickets werden
    // nicht verändert, weil die Vorlage nur beim Erstellen angewendet wird.
    let appliedTemplate = null;
    if (templateId) {
      appliedTemplate = await prisma.issueTemplate.findUnique({
        where: { id: String(templateId) },
        include: { assignees: true, recipients: true }
      });
      if (!appliedTemplate || !appliedTemplate.active) {
        return res.status(404).json({ error: 'Ticket-Vorlage nicht gefunden', code: 'TEMPLATE_NOT_FOUND' });
      }
      if (!canSeeTemplate(req.user, appliedTemplate)) {
        return res.status(403).json({ error: 'Keine Berechtigung für diese Ticket-Vorlage', code: 'TEMPLATE_FORBIDDEN' });
      }
      if (appliedTemplate.type && appliedTemplate.type !== type) {
        return res.status(400).json({ error: 'Die Vorlage passt nicht zur gewählten Ticketart', code: 'TEMPLATE_TYPE_MISMATCH' });
      }
      if (appliedTemplate.areaId) {
        const primaryDeviceForTemplate = resolvedDevices[0];
        if (type !== 'DEVICE' || primaryDeviceForTemplate?.areaId !== appliedTemplate.areaId) {
          return res.status(400).json({ error: 'Die Vorlage passt nicht zum Gerätebereich des ausgewählten Geräts', code: 'TEMPLATE_AREA_MISMATCH' });
        }
      }
    }

    // Mehrfachzuweisung: `assigneeIds` (neu) oder `assigneeId` (alt, einzeln).
    // Ohne ISSUE_MANAGE darf bei der Erstellung nur man selbst eingetragen werden.
    // Zuständig sind ausschließlich IT und Administratoren: IDs von Benutzern
    // ohne entsprechende Rolle werden stillschweigend verworfen.
    const explicitAssigneeIds = Array.isArray(req.body.assigneeIds)
      ? req.body.assigneeIds.filter(Boolean)
      : (assigneeId ? [assigneeId] : []);
    let requestedAssigneeIds = explicitAssigneeIds;
    if (requestedAssigneeIds.length === 0 && appliedTemplate?.assignees?.length) {
      requestedAssigneeIds = appliedTemplate.assignees.map((entry) => entry.userId);
    }
    let resolvedAssigneeIds = [];
    if (requestedAssigneeIds.length) {
      const foreign = explicitAssigneeIds.filter((id) => id !== req.user.id);
      if (foreign.length && !hasPermission(req.user, 'ISSUE_MANAGE')) {
        return res.status(403).json({ error: 'Tickets können bei der Erstellung nur sich selbst zugewiesen werden', code: 'FORBIDDEN_ASSIGNEE' });
      }
      resolvedAssigneeIds = await resolveAssigneeUsers(requestedAssigneeIds);
    }

    let resolvedPrimaryAssigneeId = null;
    if (primaryAssigneeId) {
      if (!resolvedAssigneeIds.some((user) => user.id === primaryAssigneeId)) {
        return res.status(400).json({ error: 'Der Hauptverantwortliche muss zu den Bearbeitern gehören', code: 'INVALID_PRIMARY_ASSIGNEE' });
      }
      resolvedPrimaryAssigneeId = primaryAssigneeId;
    }

    let maxAttachments = MAX_ATTACHMENTS;
    if (appliedTemplate) {
      if (!appliedTemplate.attachmentsAllowed && Array.isArray(attachments) && attachments.length > 0) {
        return res.status(400).json({ error: 'Diese Vorlage erlaubt keine Anhänge', code: 'ATTACHMENTS_NOT_ALLOWED' });
      }
      if (Number.isFinite(appliedTemplate.maxAttachments)) {
        maxAttachments = Math.min(MAX_ATTACHMENTS, appliedTemplate.maxAttachments);
      }
    }
    if (Array.isArray(attachments) && attachments.length > maxAttachments) {
      return res.status(400).json({ error: `Es sind höchstens ${maxAttachments} Anhänge erlaubt`, code: 'TOO_MANY_ATTACHMENTS' });
    }
    const safeAttachments = Array.isArray(attachments)
      ? attachments.filter((a) => a && a.filename).slice(0, maxAttachments)
      : [];

    // Das erste ausgewählte Gerät wird als führendes Gerät am Ticket geführt,
    // alle weiteren über die Verknüpfungstabelle.
    const [primaryDevice, ...secondaryDevices] = resolvedDevices;

    const issue = await prisma.deviceIssue.create({
      data: {
        id: await nextId('issue'),
        type,
        deviceId: primaryDevice?.id,
        // Das Problem wird direkt mit dem Asset verknüpft und zusätzlich dem
        // Bereich des Geräts zugeordnet (Konzept Abschnitt 10) – Grundlage der
        // Bereichs-Benachrichtigung.
        areaId: primaryDevice?.areaId || null,
        roomId: resolvedRoom?.id,
        softwareName: type === 'SOFTWARE' ? softwareName.trim() : null,
        reporterId: resolvedReporterId,
        reporterEmail: null,
        // Führender Bearbeiter; die vollständige Liste steht in `assignments`.
        assigneeId: resolvedAssigneeIds[0]?.id || null,
        primaryAssigneeId: resolvedPrimaryAssigneeId,
        templateId: appliedTemplate?.id || null,
        templateName: appliedTemplate?.name || null,
        title: title.trim(),
        description: description.trim(),
        priority: PRIORITIES.includes(priority) ? priority : (appliedTemplate?.priority || 'NORMAL'),
        attachments: JSON.stringify(safeAttachments),
        extraDevices: {
          create: secondaryDevices.map((device) => ({ deviceId: device.id }))
        },
        assignments: {
          create: resolvedAssigneeIds.map((user) => ({ userId: user.id }))
        },
        activities: {
          create: {
            userId: req.user.id,
            action: 'CREATED',
            details: [
              reporterLabel ? `Ticket im Auftrag für ${reporterLabel} erstellt` : 'Ticket erstellt',
              appliedTemplate ? `Vorlage „${appliedTemplate.name}“ verwendet` : null
            ].filter(Boolean).join(' · ')
          }
        }
      },
      include
    });

    // Der Gerätezustand folgt der Dringlichkeit: niedrig/normal schränkt das
    // Gerät nur ein („Eingeschränkt"), hoch/kritisch macht es defekt. Welche
    // Prioritäten zu welchem Zustand führen, steht in den Ticket-Einstellungen.
    await syncDevicesForIssue(resolvedDevices.map((device) => device.id));
    if (resolvedDevices.length > 0) {
      await prisma.deviceHistory.createMany({
        data: resolvedDevices.map((device) => ({
          deviceId: device.id,
          action: 'issue_reported',
          details: issue.title,
          userId: req.user.id
        }))
      });
    }

    const normalizedIssue = normalizeIssue(issue);
    res.status(201).json({
      issue: normalizedIssue,
      confirmation: appliedTemplate?.confirmationMessage || null,
      template: appliedTemplate ? { id: appliedTemplate.id, name: appliedTemplate.name } : null
    });

    process.nextTick(() => notifyTicketCreated(normalizedIssue).catch(() => {}));
    process.nextTick(() => notifyIssueAssigneesCreated(normalizedIssue).catch(() => {}));
    if (appliedTemplate?.recipients?.length) {
      process.nextTick(() => notifyTemplateRecipients(normalizedIssue, appliedTemplate).catch(() => {}));
    }
    // Zuständige Empfänger der Ticketart informieren (Netzwerk/Dienstgerät/
    // Software). Schulgerät-Tickets laufen über die Bereiche weiter unten.
    if (issue.type && issue.type !== 'DEVICE') {
      process.nextTick(() => notifyIssueTypeCreated(normalizedIssue).catch(() => {}));
    }
    // Bereichsmitglieder informieren, wenn der Bereich die Benachrichtigung
    // aktiviert hat (Abschnitt 10 des Konzepts).
    if (primaryDevice?.areaId) {
      process.nextTick(() => prisma.area
        .findUnique({ where: { id: primaryDevice.areaId } })
        .then((area) => (area ? notifyAreaIssueCreated(normalizedIssue, area, issue.device) : null))
        .catch(() => {}));
    }
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.deviceIssue.findUnique({ where: { id: req.params.id }, include });
    if (!existing) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });
    if (existing.deletedAt) {
      return res.status(409).json({ error: 'Das Ticket liegt im Papierkorb', code: 'ISSUE_DELETED' });
    }
    if (!(await canEditIssue(req.user, existing))) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Ticket', code: 'FORBIDDEN' });
    }

    const data = {};
    const activities = [];

    if (req.body.status !== undefined) {
      const status = LEGACY_STATUSES.includes(req.body.status) ? 'CLOSED' : req.body.status;
      if (STATUSES.includes(status) && status !== existing.status && status !== normalizeStatus(existing.status)) {
        data.status = status;
        activities.push(`Status von „${STATUS_LABELS[normalizeStatus(existing.status)] || existing.status}“ auf „${STATUS_LABELS[status]}“ geändert`);
      }
    }
    if (req.body.priority !== undefined && PRIORITIES.includes(req.body.priority) && req.body.priority !== existing.priority) {
      data.priority = req.body.priority;
      activities.push(`Priorität von „${PRIORITY_LABELS[existing.priority] || existing.priority}“ auf „${PRIORITY_LABELS[req.body.priority]}“ geändert`);
    }
    if (req.body.resolution !== undefined) {
      const resolution = String(req.body.resolution || '');
      if (resolution !== (existing.resolution || '')) {
        data.resolution = resolution;
        if (resolution) activities.push('Lösungsnotiz hinterlegt');
      }
    }
    // Mehrfachzuweisung: `assigneeIds` (neu) oder `assigneeId` (alt, einzeln).
    const assigneesProvided = req.body.assigneeIds !== undefined || req.body.assigneeId !== undefined;
    let resolvedNextAssignees = null;
    if (assigneesProvided) {
      const requestedIds = Array.isArray(req.body.assigneeIds)
        ? req.body.assigneeIds.filter(Boolean)
        : (req.body.assigneeId ? [req.body.assigneeId] : []);
      // Nur IT/Administratoren sind gültige Zuständige; alle anderen IDs
      // (z. B. aus einer Alt-Zuweisung an einen normalen Benutzer) werden
      // verworfen, statt das Speichern zu blockieren.
      const nextAssignees = await resolveAssigneeUsers(requestedIds);
      resolvedNextAssignees = nextAssignees;
      const prevIds = existing.assignments.map((entry) => entry.userId);
      const nextIds = nextAssignees.map((user) => user.id);
      const changed = prevIds.length !== nextIds.length || nextIds.some((id) => !prevIds.includes(id));
      if (changed) {
        data.assigneeId = nextIds[0] || null;
        const nameOf = (user) => user?.displayName || user?.username || 'niemanden';
        const prevNames = existing.assignments.length
          ? existing.assignments.map((entry) => nameOf(entry.user)).join(', ')
          : 'niemanden';
        const nextNames = nextIds.length
          ? nextAssignees.map((user) => nameOf(user)).join(', ')
          : 'niemanden';
        activities.push(`Zuweisung geändert von ${prevNames} zu ${nextNames}`);
      }
    }

    const effectiveAssigneeIds = resolvedNextAssignees
      ? resolvedNextAssignees.map((user) => user.id)
      : existing.assignments.map((entry) => entry.userId);

    if (req.body.primaryAssigneeId !== undefined) {
      const nextPrimaryId = req.body.primaryAssigneeId ? String(req.body.primaryAssigneeId) : null;
      if (nextPrimaryId && !effectiveAssigneeIds.includes(nextPrimaryId)) {
        return res.status(400).json({ error: 'Der Hauptverantwortliche muss zu den Bearbeitern gehören', code: 'INVALID_PRIMARY_ASSIGNEE' });
      }
      if (nextPrimaryId !== existing.primaryAssigneeId) {
        const nameForId = (id) => {
          if (!id) return 'niemanden';
          const fromExisting = existing.assignments.find((entry) => entry.userId === id)?.user;
          const fromNext = resolvedNextAssignees?.find((user) => user.id === id);
          return fromExisting?.displayName || fromExisting?.username || fromNext?.displayName || fromNext?.username || 'Unbekannt';
        };
        data.primaryAssigneeId = nextPrimaryId;
        activities.push(`Hauptverantwortlichen von ${nameForId(existing.primaryAssigneeId)} zu ${nameForId(nextPrimaryId)} geändert`);
      }
    } else if (existing.primaryAssigneeId && !effectiveAssigneeIds.includes(existing.primaryAssigneeId)) {
      // Wird der bisherige Hauptverantwortliche aus den Bearbeitern entfernt,
      // ohne dass ein neuer Hauptverantwortlicher gesetzt wurde, automatisch
      // zurücksetzen.
      data.primaryAssigneeId = null;
      activities.push('Hauptverantwortlichen entfernt, da die Zuweisung aufgehoben wurde');
    }

    const issue = await prisma.deviceIssue.update({ where: { id: req.params.id }, data, include });

    // Verknüpfungstabelle separat schreiben: Prisma kann createMany nicht in
    // derselben Operation wie ein bedingtes update nutzen.
    if (assigneesProvided) {
      await setIssueAssignees(req.params.id, (resolvedNextAssignees || []).map((user) => user.id));
    }

    if (activities.length > 0) {
      await prisma.issueActivity.createMany({
        data: activities.map((details) => ({ issueId: issue.id, userId: req.user.id, action: 'UPDATED', details }))
      });
    }

    // Geräte-Historie nur bei Geräte-Tickets (für jedes betroffene Gerät)
    const affectedDevices = issueDevices(issue);
    if (affectedDevices.length > 0) {
      await prisma.deviceHistory.createMany({
        data: affectedDevices.map((device) => ({
          deviceId: device.id,
          action: 'issue_updated',
          details: `${issue.title} (${issue.status})`,
          userId: req.user.id
        }))
      });
    }

    // Gerätezustand nachführen: beim Schlossen wieder freigeben, bei geänderter
    // Dringlichkeit den Zustand neu bestimmen (hoch/kritisch → defekt,
    // niedrig/normal → eingeschränkt).
    if (affectedDevices.length > 0 && (data.status === 'CLOSED' || data.priority !== undefined)) {
      await syncDevicesForIssue(affectedDevices.map((d) => d.id), issue.status === 'CLOSED' ? issue.id : null);
    }

    const reloaded = await prisma.deviceIssue.findUnique({ where: { id: issue.id }, include });
    res.json({ issue: normalizeIssue(reloaded) });

    const normalized = normalizeIssue(reloaded);
    process.nextTick(() => notifyTicketUpdated(normalized, req.user.id).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text fehlt', code: 'INVALID_INPUT' });

    const issue = await prisma.deviceIssue.findUnique({
      where: { id: req.params.id },
      include: {
        device: { select: { id: true, areaId: true } },
        extraDevices: { include: { device: { select: { id: true, areaId: true } } } },
        reporter: { select: { id: true, username: true, displayName: true, email: true } },
        assignee: { select: { id: true, username: true, displayName: true, email: true } },
        primaryAssignee: { select: { id: true, username: true, displayName: true, email: true } },
        assignments: {
          include: { user: { select: { id: true, username: true, displayName: true, email: true } } }
        }
      }
    });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });
    if (issue.deletedAt) return res.status(409).json({ error: 'Das Ticket liegt im Papierkorb', code: 'ISSUE_DELETED' });

    const isInvolved = issue.reporterId === req.user.id
      || issue.assigneeId === req.user.id
      || issue.primaryAssigneeId === req.user.id
      || (issue.assignments || []).some((entry) => entry.userId === req.user.id);
    if (!isInvolved && !(await canEditIssue(req.user, issue))) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Ticket', code: 'FORBIDDEN' });
    }

    const comment = await prisma.issueComment.create({
      data: {
        issueId: issue.id,
        userId: req.user.id,
        text: text.trim()
      },
      include: { user: { select: { id: true, username: true, displayName: true, role: true } } }
    });

    res.status(201).json({ comment });

    process.nextTick(() => notifyTicketComment(issue, comment).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

/**
 * Interne Notiz anlegen — nur für IT/Administration sichtbar, wird niemals an
 * den Reporter gemailt und erscheint nicht im öffentlichen Verlauf.
 */
router.post('/:id/notes', async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text fehlt', code: 'INVALID_INPUT' });

    const issue = await prisma.deviceIssue.findUnique({ where: { id: req.params.id }, include });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });
    if (issue.deletedAt) return res.status(409).json({ error: 'Das Ticket liegt im Papierkorb', code: 'ISSUE_DELETED' });
    if (!(await canEditIssue(req.user, issue))) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Ticket', code: 'FORBIDDEN' });
    }

    const note = await prisma.issueInternalNote.create({
      data: { issueId: issue.id, userId: req.user.id, text: text.trim() },
      include: { user: { select: { id: true, username: true, displayName: true, role: true } } }
    });

    res.status(201).json({ note });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/notes/:noteId', async (req, res, next) => {
  try {
    const issue = await prisma.deviceIssue.findUnique({ where: { id: req.params.id }, include });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });
    if (!(await canEditIssue(req.user, issue))) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Ticket', code: 'FORBIDDEN' });
    }
    const note = await prisma.issueInternalNote.findFirst({ where: { id: req.params.noteId, issueId: issue.id } });
    if (!note) return res.status(404).json({ error: 'Notiz nicht gefunden', code: 'NOTE_NOT_FOUND' });
    if (note.userId !== req.user.id && !hasPermission(req.user, 'ADMIN')) {
      return res.status(403).json({ error: 'Nur eigene Notizen dürfen gelöscht werden', code: 'FORBIDDEN' });
    }
    await prisma.issueInternalNote.delete({ where: { id: note.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const issue = await prisma.deviceIssue.findUnique({ where: { id: req.params.id }, include });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });
    if (issue.deletedAt) return res.status(204).end();

    const mayDelete = hasPermission(req.user, 'ISSUE_DELETE') || issue.reporterId === req.user.id;
    if (!mayDelete) {
      return res.status(403).json({ error: 'Keine Berechtigung zum Löschen dieses Tickets', code: 'FORBIDDEN' });
    }

    await prisma.deviceIssue.update({
      where: { id: issue.id },
      data: {
        deletedAt: new Date(),
        deletedById: req.user.id,
        activities: {
          create: {
            userId: req.user.id,
            action: 'DELETED',
            details: 'Ticket in den Papierkorb verschoben'
          }
        }
      }
    });

    // Gerätezustand neu bestimmen: das Ticket ist nicht mehr aktiv, ein Gerät
    // wird wieder freigegeben, wenn nur dieses Ticket es blockiert hat.
    const affectedDevices = issueDevices(issue);
    if (affectedDevices.length > 0) {
      await syncDevicesForIssue(affectedDevices.map((d) => d.id), issue.id);
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/:id/restore', requirePermission('ISSUE_DELETE'), async (req, res, next) => {
  try {
    const issue = await prisma.deviceIssue.findUnique({ where: { id: req.params.id }, include });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });
    if (!issue.deletedAt) return res.status(409).json({ error: 'Das Ticket liegt nicht im Papierkorb', code: 'ISSUE_NOT_DELETED' });

    const restored = await prisma.deviceIssue.update({
      where: { id: issue.id },
      data: {
        deletedAt: null,
        deletedById: null,
        activities: {
          create: {
            userId: req.user.id,
            action: 'RESTORED',
            details: 'Ticket aus dem Papierkorb wiederhergestellt'
          }
        }
      },
      include
    });

    const affectedDevices = issueDevices(restored);
    if (affectedDevices.length > 0) {
      await syncDevicesForIssue(affectedDevices.map((d) => d.id));
    }

    res.json({ issue: normalizeIssue(restored, { includeInternal: true }) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/permanent', requirePermission('ADMIN'), async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'ADMIN')) {
      return res.status(403).json({ error: 'Nur Administratoren können Tickets endgültig löschen', code: 'FORBIDDEN' });
    }
    const issue = await prisma.deviceIssue.findUnique({ where: { id: req.params.id }, include });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });
    if (!issue.deletedAt) {
      return res.status(409).json({ error: 'Das Ticket muss zuerst in den Papierkorb', code: 'ISSUE_NOT_DELETED' });
    }

    const affectedDevices = issueDevices(issue);
    await prisma.deviceIssue.delete({ where: { id: issue.id } });

    if (affectedDevices.length > 0) {
      await syncDevicesForIssue(affectedDevices.map((d) => d.id), issue.id);
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/issues/:id/reply
 * Sendet eine E-Mail-Antwort an den Reporter (und optional den Assignee)
 * und speichert die Nachricht als Kommentar im Ticket.
 */
router.post('/:id/reply', async (req, res, next) => {
  try {
    const { text, saveAsComment = true } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ error: 'Antworttext fehlt', code: 'INVALID_INPUT' });
    }

    const issue = await prisma.deviceIssue.findUnique({
      where: { id: req.params.id },
      include: {
        device: { include: { room: true } },
        extraDevices: { include: { device: { include: { room: true } } } },
        room: true,
        reporter: { select: { id: true, username: true, displayName: true, email: true } },
        assignee: { select: { id: true, username: true, displayName: true, email: true } }
      }
    });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });
    if (issue.deletedAt) return res.status(409).json({ error: 'Das Ticket liegt im Papierkorb', code: 'ISSUE_DELETED' });
    if (!(await canEditIssue(req.user, issue))) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Ticket', code: 'FORBIDDEN' });
    }

    const mailSettings = await getMailSettings();
    if (!isConfigured(mailSettings)) {
      return res.status(503).json({ error: 'Mail ist nicht konfiguriert', code: 'MAIL_NOT_CONFIGURED' });
    }

    const reporterEmail = issue.reporter?.email || issue.reporterEmail;
    if (!reporterEmail) {
      return res.status(400).json({ error: 'Reporter hat keine E-Mail-Adresse', code: 'NO_REPORTER_EMAIL' });
    }

    const reporterLabel = issue.reporter?.username || (issue.reporterEmail ? 'Externer Benutzer' : 'Nutzer');
    const context = contextLabel(issue);
    const subject = `Re: [TICKET-${issue.id}] ${issue.title}`.replace(/[\r\n]+/g, ' ');
    const signature = (await getSettingCached('mail.signature')).trim();
    const textBody = `Hallo ${reporterLabel},\n\n${text.trim()}\n\n---\nBezug: ${issue.title}\n${context ? `Ticketart: ${TYPE_LABELS[issue.type]} · ${context}\n` : ''}Ticket-ID: ${issue.id}\n\nDiese E-Mail wurde automatisch verschickt.${signature ? `\n${signature}` : ''}`;

    await enqueue({
      to: reporterEmail,
      subject,
      html: '',
      text: textBody,
      relatedType: 'TICKET_REPLY',
      relatedId: issue.id
    });

    let comment = null;
    if (saveAsComment) {
      comment = await prisma.issueComment.create({
        data: {
          issueId: issue.id,
          userId: req.user.id,
          text: `[E-Mail-Antwort an ${reporterEmail}]\n\n${text.trim()}`
        },
        include: { user: { select: { id: true, username: true, displayName: true, role: true } } }
      });
    }

    res.json({ success: true, comment });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
