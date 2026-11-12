const express = require('express');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { auth } = require('../middleware/auth');
const { requirePermission, hasPermission } = require('../services/permissions');
const { nextId } = require('../services/ids');
const { optionalCategory } = require('../services/deviceCategories');
const { notifyLoanRequested, notifyLoanApproved, notifyLoanStarted, notifyLoanReturned } = require('../services/mailNotify');

const router = express.Router();

// Angezeigter Bereich einer Ausleihe: expliziter `area`, sonst der Bereich des
// zugewiesenen Geräts. So erscheint der Bereich auch bei Altbeständen, die ohne
// Bereichszuordnung angelegt wurden (Fix Bereichs-Anzeige in Ausleihen).
function withEffectiveArea(loan) {
  if (!loan) return loan;
  if (!loan.area && loan.device?.area) {
    return { ...loan, area: loan.device.area, areaId: loan.device.areaId ?? loan.areaId ?? null };
  }
  return loan;
}

// Verfügbarkeit + Freigabe eines konkreten Geräts prüfen. Wird bei Anfrage und
// bei der Freigabe gebraucht – eine Modellanfrage hat zunächst gar kein Gerät.
// Liegt eine Anfrage über einen Gerätebereich (loan.areaId), darf nur ein Gerät
// aus diesem Bereich zugewiesen werden (Konzept Abschnitt 12).
async function resolveAssignableDevice(deviceId, loan = null) {
  if (!deviceId) return { device: null, error: { status: 409, body: { error: 'Gerät ist nicht verfügbar', code: 'DEVICE_UNAVAILABLE' } } };
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device || device.status !== 'AVAILABLE') {
    return { device: null, error: { status: 409, body: { error: 'Gerät ist nicht verfügbar', code: 'DEVICE_UNAVAILABLE' } } };
  }
  if (!device.isLendable) {
    return { device: null, error: { status: 409, body: { error: 'Dieses Gerät ist nicht zur Ausleihe freigegeben', code: 'DEVICE_NOT_LENDABLE' } } };
  }
  if (loan?.areaId && device.areaId !== loan.areaId) {
    return { device: null, error: { status: 409, body: { error: 'Das Gerät gehört nicht zu diesem Bereich', code: 'DEVICE_NOT_IN_AREA' } } };
  }
  return { device, error: null };
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { active, overdue, userId, archived } = req.query;
    const canSeeAllLoans = hasPermission(req.user, 'LOAN_MANAGE');
    const loans = await prisma.loan.findMany({
      where: {
        ...(!canSeeAllLoans ? { userId: req.user.id } : {}),
        ...(archived === 'true'
          ? { archivedAt: { not: null } }
          : { archivedAt: null }),
        ...(active === 'true' ? { status: 'ACTIVE' } : {}),
        ...(overdue === 'true' ? { status: 'OVERDUE' } : {}),
        ...(canSeeAllLoans && userId ? { userId } : {})
      },
      include: { device: { include: { area: true } }, user: true, area: true },
      orderBy: { startDate: 'desc' }
    });
    res.json({ loans: loans.map(withEffectiveArea) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loans/request
 * Anfrage von Benutzern: Gewünscht ist ein Gerätebereich („Arbeitsplätze 5a")
 * und optional ein bestimmtes Modell („Lenovo ThinkPad"). Erst bei der Freigabe
 * weist die IT ein Gerät aus diesem Bereich zu.
 *
 * Body: { areaId?, requestedCategory?, requestedModel?, startDate, dueDate, requestReason, notes? }
 * Ohne Bereich bleibt die reine Modellanfrage (Rückfall) möglich.
 */
router.post('/request', auth, requirePermission('LOAN_CREATE'), async (req, res, next) => {
  try {
    const { areaId, requestedCategory, requestedModel, startDate, dueDate, requestReason, notes } = req.body;
    const model = String(requestedModel || '').trim();
    const areaRef = String(areaId || '').trim() || null;
    if (!areaRef && !model) {
      return res.status(400).json({ error: 'Bereich oder gewünschtes Modell ist erforderlich', code: 'INVALID_LOAN_REQUEST' });
    }
    if (!startDate || !dueDate || !requestReason?.trim()) {
      return res.status(400).json({ error: 'Zeitraum und Grund sind erforderlich', code: 'INVALID_LOAN_REQUEST' });
    }

    let area = null;
    if (areaRef) {
      area = await prisma.area.findUnique({ where: { id: areaRef } });
      if (!area) return res.status(404).json({ error: 'Bereich nicht gefunden', code: 'AREA_NOT_FOUND' });
      if (!area.lendEnabled) {
        return res.status(409).json({ error: 'In diesem Bereich ist keine Ausleihe möglich', code: 'AREA_NOT_LENDABLE' });
      }
    }

    // Ausleihen können nur für sich selbst angefragt werden
    const targetUserId = req.user.id;
    const borrowerName = req.user.displayName || req.user.username;
    const borrowerContact = req.user.email || null;

    const loan = await prisma.loan.create({
      data: {
        id: await nextId('loan'),
        areaId: area?.id || null,
        requestedCategory: optionalCategory(requestedCategory),
        requestedModel: model,
        userId: targetUserId,
        borrowerName,
        borrowerContact,
        startDate: new Date(startDate),
        dueDate: new Date(dueDate),
        requestReason: requestReason.trim(),
        notes: notes?.trim() || null,
        status: 'REQUESTED'
      },
      include: { device: true, user: true, area: true }
    });

    res.status(201).json({ loan });

    process.nextTick(() => notifyLoanRequested(loan).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

router.get('/my', auth, async (req, res, next) => {
  try {
    const { archived } = req.query;
    const loans = await prisma.loan.findMany({
      where: {
        userId: req.user.id,
        ...(archived === 'true'
          ? { archivedAt: { not: null } }
          : { archivedAt: null })
      },
      include: { device: { include: { area: true } }, area: true },
      orderBy: { startDate: 'desc' }
    });
    res.json({ loans: loans.map(withEffectiveArea) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/archive', auth, requirePermission('LOAN_MANAGE'), async (req, res, next) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });
    if (existing.archivedAt) return res.status(409).json({ error: 'Ausleihe ist bereits archiviert', code: 'ALREADY_ARCHIVED' });

    const loan = await prisma.loan.update({
      where: { id: req.params.id },
      data: { archivedAt: new Date() }
    });

    res.json({ loan });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/unarchive', auth, requirePermission('LOAN_MANAGE'), async (req, res, next) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });
    if (!existing.archivedAt) return res.status(409).json({ error: 'Ausleihe ist nicht archiviert', code: 'NOT_ARCHIVED' });

    const loan = await prisma.loan.update({
      where: { id: req.params.id },
      data: { archivedAt: null }
    });

    res.json({ loan });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/loans/:id/approve
 * Nimmt eine Modellanfrage an. Weil eine Anfrage zunächst nur ein Modell
 * nennt, wird das konkrete Gerät bei der Freigabe mitgeschickt (Body.deviceId).
 * Fehlt es, wird das passende freie Gerät automatisch gesucht – passt keins,
 * kommt eine klare Meldung zurück und es wird nichts freigegeben.
 */
router.patch('/:id/approve', auth, requirePermission('LOAN_MANAGE'), async (req, res, next) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id }, include: { device: true } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });
    if (!['REQUESTED', 'DISCUSSION_REQUESTED'].includes(existing.status)) {
      return res.status(409).json({ error: 'Nur offene Anfragen koennen akzeptiert werden', code: 'INVALID_LOAN_STATUS' });
    }

    // Gerät bestimmen: mitgeschicktes Gerät, sonst das Gerät der Anfrage, sonst
    // das erste freie Gerät, das zur gewünschten Geräteart passt.
    const deviceId = req.body.deviceId || existing.deviceId
      || (await findSuitableDevice(existing))?.id
      || null;
    if (!deviceId) {
      return res.status(409).json({
        error: existing.requestedModel
          ? `Für die Anfrage "${existing.requestedModel}" ist kein freies Gerät verfügbar – bitte ein Gerät zuweisen.`
          : 'Es ist kein freies Gerät verfügbar – bitte ein Gerät zuweisen.',
        code: 'NO_DEVICE_AVAILABLE'
      });
    }

    const { device, error } = await resolveAssignableDevice(deviceId, existing);
    if (error) return res.status(error.status).json(error.body);

    const loan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id: req.params.id },
        data: {
          deviceId: device.id,
          status: 'ACTIVE',
          decisionMessage: req.body.message?.trim() || 'Ausleihe wurde akzeptiert.',
          decidedAt: new Date(),
          decidedById: req.user.id
        },
        include: { device: true, user: true }
      });
      await tx.device.update({ where: { id: device.id }, data: { status: 'LOANED' } });
      await tx.deviceHistory.create({ data: { deviceId: device.id, action: 'loan_request_approved', userId: req.user.id, details: updated.id } });
      return updated;
    });

    res.json({ loan });

    process.nextTick(() => notifyLoanApproved(loan).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

/**
 * Sucht ein freies Gerät für eine Anfrage: bevorzugt das exakt passende
 * Modell (Freitext), sonst das erste freie Gerät der gewünschten Geräteart –
 * bei einer Bereichsanfrage ausschließlich innerhalb dieses Bereichs.
 */
async function findSuitableDevice(loan) {
  const free = {
    status: 'AVAILABLE',
    isLendable: true,
    ...(loan.areaId ? { areaId: loan.areaId } : {}),
    ...(loan.requestedCategory ? { category: loan.requestedCategory } : {})
  };
  const model = String(loan.requestedModel || '').trim();
  if (model) {
    const exact = await prisma.device.findFirst({
      where: {
        ...free,
        OR: [
          { model: { equals: model } },
          { model: { contains: model } },
          { manufacturer: { equals: model } }
        ]
      }
    });
    if (exact) return exact;
  }
  if (!loan.requestedCategory && !loan.areaId) return null;
  return prisma.device.findFirst({ where: free, orderBy: { inventoryId: 'asc' } });
}

/**
 * PATCH /api/loans/:id/device
 * Weist einer noch offenen Modellanfrage ein Gerät zu (oder wechselt es).
 */
router.patch('/:id/device', auth, requirePermission('LOAN_MANAGE'), async (req, res, next) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });
    if (!['REQUESTED', 'DISCUSSION_REQUESTED'].includes(existing.status)) {
      return res.status(409).json({ error: 'Das Gerät kann nur bei einer offenen Anfrage gewechselt werden', code: 'INVALID_LOAN_STATUS' });
    }

    const { device, error } = await resolveAssignableDevice(req.body.deviceId, existing);
    if (error) return res.status(error.status).json(error.body);

    const loan = await prisma.loan.update({
      where: { id: req.params.id },
      data: {
        deviceId: device.id,
        // War die Anfrage ohne Bereich, wird der Bereich nun vom gewählten
        // Gerät übernommen – so bleiben Ausleihe und Gerätebereich verknüpft.
        ...(existing.areaId ? { areaId: existing.areaId } : { areaId: device.areaId || null })
      },
      include: { device: true, user: true }
    });

    res.json({ loan });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/discussion', auth, requirePermission('LOAN_MANAGE'), async (req, res, next) => {
  try {
    const message = req.body.message?.trim();
    if (!message) return res.status(400).json({ error: 'Nachricht ist erforderlich', code: 'INVALID_DISCUSSION_MESSAGE' });

    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });
    if (!['REQUESTED', 'DISCUSSION_REQUESTED'].includes(existing.status)) {
      return res.status(409).json({ error: 'Nur offene Anfragen koennen markiert werden', code: 'INVALID_LOAN_STATUS' });
    }

    const loan = await prisma.loan.update({
      where: { id: req.params.id },
      data: {
        status: 'DISCUSSION_REQUESTED',
        decisionMessage: message,
        decidedAt: new Date(),
        decidedById: req.user.id
      },
      include: { device: true, user: true }
    });

    // Eine Modellanfrage hat noch kein Gerät – dann gibt es auch nichts zu protokollieren.
    if (existing.deviceId) {
      await prisma.deviceHistory.create({ data: { deviceId: existing.deviceId, action: 'loan_request_discussion', userId: req.user.id, details: loan.id } });
    }
    res.json({ loan });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const canManage = hasPermission(req.user, 'LOAN_MANAGE');
    const loan = await prisma.loan.findUnique({ where: { id: req.params.id }, include: { device: { include: { room: true, area: { include: { room: true } } } }, user: true, area: { include: { room: true } } } });
    if (!loan) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });
    if (!canManage && loan.userId !== req.user.id) {
      return res.status(403).json({ error: 'Keine Berechtigung für diese Ausleihe', code: 'FORBIDDEN' });
    }
    res.json({ loan: withEffectiveArea(loan) });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requirePermission('LOAN_MANAGE'), async (req, res, next) => {
  try {
    let { deviceId, areaId, borrowerName, borrowerContact, borrowerGroup, dueDate, notes, customAssetName, userId } = req.body;
    if (!deviceId || !borrowerName?.trim() || !dueDate) {
      return res.status(400).json({ error: 'Asset, Ausleiher und Rückgabedatum sind erforderlich', code: 'INVALID_LOAN_INPUT' });
    }

    // Wenn ein Systembenutzer gewählt wurde, validieren
    let resolvedUserId = null;
    if (userId) {
      const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!targetUser) return res.status(404).json({ error: 'Zielbenutzer nicht gefunden', code: 'USER_NOT_FOUND' });
      resolvedUserId = targetUser.id;
    }

    if (deviceId === 'other') {
      if (!customAssetName?.trim()) {
        return res.status(400).json({ error: 'Bezeichnung des anderen Assets ist erforderlich', code: 'INVALID_LOAN_INPUT' });
      }
      const tempInventoryId = `SONST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const tempId = Math.random().toString(36).substring(2, 10).toUpperCase();
      const tempDevice = await prisma.device.create({
        data: {
          id: tempId,
          inventoryId: tempInventoryId,
          manufacturer: 'Sonstiges',
          model: customAssetName.trim(),
          description: 'Anderes/Temporäres Asset für eine Ausleihe.',
          status: 'AVAILABLE',
          labels: JSON.stringify(['Sonstiges'])
        }
      });
      deviceId = tempDevice.id;
    }

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.status !== 'AVAILABLE') {
      return res.status(409).json({ error: 'Gerät ist nicht verfügbar', code: 'DEVICE_UNAVAILABLE' });
    }
    if (!device.isLendable) {
      return res.status(409).json({ error: 'Dieses Gerät ist nicht zur Ausleihe freigegeben', code: 'DEVICE_NOT_LENDABLE' });
    }

    // Bereich verknüpfen: explizit gewählter Bereich oder automatisch der
    // Bereich, dem das ausgewählte Asset angehört (Konzept Abschnitt 12).
    const requestedAreaId = String(areaId || '').trim() || null;
    if (requestedAreaId) {
      const area = await prisma.area.findUnique({ where: { id: requestedAreaId } });
      if (!area) {
        return res.status(404).json({ error: 'Bereich nicht gefunden', code: 'AREA_NOT_FOUND' });
      }
      if (device.areaId !== area.id) {
        return res.status(409).json({ error: 'Das Gerät gehört nicht zu diesem Bereich', code: 'DEVICE_NOT_IN_AREA' });
      }
    }
    const loanAreaId = requestedAreaId || device.areaId || null;

    const loan = await prisma.$transaction(async (tx) => {
      const created = await tx.loan.create({
        data: {
          id: await nextId('loan'),
          deviceId,
          areaId: loanAreaId,
          userId: resolvedUserId,
          borrowerName: borrowerName.trim(),
          borrowerContact: borrowerContact?.trim() || null,
          borrowerGroup: borrowerGroup?.trim() || null,
          dueDate: new Date(dueDate),
          notes: notes?.trim() || null
        }
      });
      await tx.device.update({ where: { id: deviceId }, data: { status: 'LOANED' } });
      await tx.deviceHistory.create({ data: { deviceId, action: 'loaned', userId: req.user.id, details: created.id } });
      return created;
    });

    const result = await prisma.loan.findUnique({ where: { id: loan.id }, include: { device: { include: { area: true } }, user: true, area: true } });

    res.status(201).json({ loan: withEffectiveArea(result) });

    // Ausleiher per E-Mail über den Start der Ausleihe informieren
    if (result) process.nextTick(() => notifyLoanStarted(result).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/return', auth, requirePermission('LOAN_MANAGE'), async (req, res, next) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });
    if (existing.status === 'RETURNED') {
      return res.status(409).json({ error: 'Ausleihe wurde bereits zurückgegeben', code: 'ALREADY_RETURNED' });
    }
    if (!['ACTIVE', 'OVERDUE'].includes(existing.status)) {
      return res.status(409).json({ error: 'Nur aktive Ausleihen können zurückgegeben werden', code: 'INVALID_LOAN_STATUS' });
    }

    const loan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id: req.params.id },
        data: { returnDate: new Date(), status: 'RETURNED' }
      });
      if (existing.deviceId) {
        await tx.device.update({ where: { id: existing.deviceId }, data: { status: 'AVAILABLE' } });
        await tx.deviceHistory.create({ data: { deviceId: existing.deviceId, action: 'returned', userId: req.user.id } });
      }
      return updated;
    });

    res.json({ loan });

    process.nextTick(async () => {
      try {
        const withUser = await prisma.loan.findUnique({ where: { id: req.params.id }, include: { device: true, user: true } });
        if (withUser) await notifyLoanReturned(withUser);
      } catch (error) {
        logger.warn({ error: error.message }, 'notifyLoanReturned fehlgeschlagen');
      }
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requirePermission('LOAN_DELETE'), async (req, res, next) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });

    await prisma.$transaction(async (tx) => {
      await tx.loan.delete({ where: { id: req.params.id } });
      if (existing.deviceId) {
        if (existing.status !== 'RETURNED') {
          await tx.device.update({ where: { id: existing.deviceId }, data: { status: 'AVAILABLE' } });
        }
        await tx.deviceHistory.create({ data: { deviceId: existing.deviceId, action: 'loan_deleted', userId: req.user.id } });
      }
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
