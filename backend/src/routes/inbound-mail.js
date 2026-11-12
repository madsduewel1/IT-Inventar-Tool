const express = require('express');
const prisma = require('../config/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { checkInbox } = require('../services/mailInbound');
const { nextId } = require('../services/ids');
const { notifyTicketCreated } = require('../services/mailNotify');
const { findByOrCreateRoom } = require('../services/rooms');
const { normalizeIssue, resolveAssigneeUsers, resolveDevices, syncDevicesForIssue } = require('../services/issues');

const router = express.Router();
router.use(auth, requireRole('STAFF', 'ADMIN'));

/**
 * GET /api/inbound-mail
 * Liste aller eingehenden E-Mails (gefiltert nach Status)
 */
router.get('/', async (req, res, next) => {
  try {
    const { status = 'PENDING', limit = 50, offset = 0 } = req.query;
    const where = status ? { status } : {};

    const [mails, total] = await Promise.all([
      prisma.inboundMail.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: Math.min(Number(limit) || 50, 200),
        skip: Number(offset) || 0
      }),
      prisma.inboundMail.count({ where })
    ]);

    res.json({ mails, total });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inbound-mail/count
 * Zählt ausstehende E-Mails für Badge-Anzeige
 */
router.get('/count', async (req, res, next) => {
  try {
    const count = await prisma.inboundMail.count({ where: { status: 'PENDING' } });
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inbound-mail/:id
 * Einzelne E-Mail abrufen
 */
router.get('/:id', async (req, res, next) => {
  try {
    const mail = await prisma.inboundMail.findUnique({ where: { id: req.params.id } });
    if (!mail) return res.status(404).json({ error: 'E-Mail nicht gefunden', code: 'NOT_FOUND' });
    res.json({ mail });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inbound-mail/fetch
 * Manuelles Abrufen des IMAP-Postfachs
 */
router.post('/fetch', async (req, res, next) => {
  try {
    await checkInbox();
    const count = await prisma.inboundMail.count({ where: { status: 'PENDING' } });
    res.json({ success: true, message: 'Postfach wurde abgerufen', pendingCount: count });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inbound-mail/:id/convert
 * E-Mail in ein Ticket umwandeln (manuelle Freigabe)
 * Body: { deviceIds, priority, assigneeId, title, description }
 */
router.post('/:id/convert', async (req, res, next) => {
  try {
    const mail = await prisma.inboundMail.findUnique({ where: { id: req.params.id } });
    if (!mail) return res.status(404).json({ error: 'E-Mail nicht gefunden', code: 'NOT_FOUND' });
    if (mail.status !== 'PENDING') {
      return res.status(409).json({ error: 'E-Mail wurde bereits verarbeitet', code: 'ALREADY_PROCESSED' });
    }

    const { type = 'DEVICE', deviceIds, deviceId, roomId, roomName, softwareName, priority = 'NORMAL', assigneeId, title, description } = req.body;
    if (!['DEVICE', 'PERSONAL', 'WLAN', 'SOFTWARE'].includes(type)) {
      return res.status(400).json({ error: 'Unbekannte Ticketart', code: 'INVALID_TYPE' });
    }
    if (!title?.trim()) {
      return res.status(400).json({ error: 'Titel ist ein Pflichtfeld', code: 'INVALID_INPUT' });
    }

    let resolvedDevices = [];
    let resolvedRoom = null;

    if (type === 'DEVICE') {
      // deviceIds (Mehrfachauswahl) mit Rückfall auf das einfache deviceId-Feld.
      const requested = [...new Set((Array.isArray(deviceIds) ? deviceIds : [deviceId]).filter(Boolean))];
      if (requested.length === 0) {
        return res.status(400).json({ error: 'Bitte mindestens ein betroffenes Gerät auswählen', code: 'INVALID_DEVICE' });
      }
      resolvedDevices = await resolveDevices(requested);
      if (resolvedDevices.length < requested.length) {
        return res.status(404).json({ error: 'Mindestens eines der ausgewählten Geräte wurde nicht gefunden', code: 'DEVICE_NOT_FOUND' });
      }
    } else if (type === 'WLAN') {
      const givenRoomName = typeof roomName === 'string' ? roomName.trim() : '';
      if (roomId) {
        resolvedRoom = await prisma.room.findUnique({ where: { id: roomId } });
        if (!resolvedRoom) return res.status(404).json({ error: 'Raum nicht gefunden', code: 'ROOM_NOT_FOUND' });
      } else if (givenRoomName) {
        resolvedRoom = await findByOrCreateRoom(givenRoomName);
      } else {
        return res.status(400).json({ error: 'Bitte einen Raum angeben', code: 'INVALID_ROOM' });
      }
    } else if (type === 'SOFTWARE') {
      if (!softwareName?.trim()) {
        return res.status(400).json({ error: 'Bitte die Software angeben', code: 'INVALID_SOFTWARE' });
      }
    }

    // Absender als Benutzer suchen (optional – kann auch unbekannter Absender sein)
    const reporter = await prisma.user.findFirst({
      where: { email: mail.fromAddr.toLowerCase().trim() },
      select: { id: true, username: true }
    });

    // Zuständig sind nur IT und Administratoren: alles andere bleibt bewusst
    // ohne Zuordnung, statt die Umwandlung abzulehnen.
    let resolvedAssigneeId = null;
    if (assigneeId) {
      const [assignee] = await resolveAssigneeUsers([assigneeId]);
      resolvedAssigneeId = assignee?.id || null;
    }

    const issueDescription = description?.trim() || mail.body || '(Keine Beschreibung)';

    // Das erste ausgewählte Gerät wird als führendes Gerät am Ticket geführt,
    // alle weiteren über die Verknüpfungstabelle.
    const [primaryDevice, ...secondaryDevices] = resolvedDevices;

    // Ticket erstellen
    // Reporter = Absender der E-Mail, sofern dieser im System existiert.
    // Für externe Absender (nicht im System) bleibt reporterId = null und die
    // Absender-E-Mail wird in reporterEmail gespeichert (nie der IT-Bearbeiter).
    const issue = await prisma.deviceIssue.create({
      data: {
        id: await nextId('issue'),
        type,
        deviceId: primaryDevice?.id,
        roomId: resolvedRoom?.id,
        softwareName: type === 'SOFTWARE' ? softwareName.trim() : null,
        reporterId: reporter?.id || null,
        reporterEmail: reporter?.id ? null : mail.fromAddr,
        assigneeId: resolvedAssigneeId,
        title: title.trim(),
        description: issueDescription,
        priority: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(priority) ? priority : 'NORMAL',
        extraDevices: {
          create: secondaryDevices.map((device) => ({ deviceId: device.id }))
        },
        activities: {
          create: { action: 'CREATED', details: 'Ticket erstellt (per E-Mail)' }
        }
      },
      include: {
        device: { include: { room: true } },
        extraDevices: { include: { device: { include: { room: true } } } },
        room: true,
        reporter: { select: { id: true, username: true, displayName: true, email: true } },
        assignee: { select: { id: true, username: true, displayName: true, email: true } },
        comments: { include: { user: { select: { id: true, username: true, displayName: true, role: true } } }, orderBy: { createdAt: 'asc' } },
        activities: { include: { user: { select: { id: true, username: true, displayName: true, role: true } } }, orderBy: { createdAt: 'asc' } }
      }
    });

    // Gerätestatus aus der Dringlichkeit ableiten: niedrig/normal schränkt nur
    // ein, hoch/kritisch macht defekt (konfigurierbar in den
    // Ticket-Einstellungen). Ausgeliehene Geräte bleiben unangetastet.
    await syncDevicesForIssue(resolvedDevices.map((device) => device.id));

    // Gerätehistorie eintragen
    if (resolvedDevices.length > 0) {
      await prisma.deviceHistory.createMany({
        data: resolvedDevices.map((device) => ({
          deviceId: device.id,
          action: 'issue_reported',
          details: `${issue.title} (per E-Mail von ${mail.fromAddr})`,
          userId: req.user.id
        }))
      });
    }

    // Mail als verarbeitet markieren
    await prisma.inboundMail.update({
      where: { id: mail.id },
      data: {
        status: 'CONVERTED',
        convertedIssueId: issue.id,
        processedAt: new Date()
      }
    });

    // Mail-Log eintragen
    await prisma.mailLog.create({
      data: {
        direction: 'INBOUND',
        fromAddr: mail.fromAddr,
        toAddr: '',
        subject: mail.subject,
        body: mail.body,
        status: 'PROCESSED',
        relatedType: 'TICKET_CREATED',
        relatedId: issue.id
      }
    });

    const normalized = normalizeIssue(issue);
    res.status(201).json({ issue: normalized });

    process.nextTick(() => notifyTicketCreated(normalized).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inbound-mail/:id/ignore
 * E-Mail ignorieren / ablehnen
 */
router.post('/:id/ignore', async (req, res, next) => {
  try {
    const mail = await prisma.inboundMail.findUnique({ where: { id: req.params.id } });
    if (!mail) return res.status(404).json({ error: 'E-Mail nicht gefunden', code: 'NOT_FOUND' });

    await prisma.inboundMail.update({
      where: { id: mail.id },
      data: { status: 'IGNORED', processedAt: new Date() }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/inbound-mail/:id
 * E-Mail aus der Queue löschen (nur ADMIN)
 */
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.inboundMail.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
