const express = require('express');
const prisma = require('../config/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { markOverdueLoans } = require('../services/monitoring');
const { notifyLoanApproved } = require('../services/mailNotify');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    await markOverdueLoans();
    const { active, overdue, userId } = req.query;
    const role = req.user?.effectiveRole || req.user?.role;
    const canSeeAllLoans = ['STAFF', 'ADMIN'].includes(role);
    const loans = await prisma.loan.findMany({
      where: {
        ...(!canSeeAllLoans ? { userId: req.user.id } : {}),
        ...(active === 'true' ? { status: 'ACTIVE' } : {}),
        ...(overdue === 'true' ? { status: 'OVERDUE' } : {}),
        ...(canSeeAllLoans && userId ? { userId } : {})
      },
      include: { device: true, user: true },
      orderBy: { startDate: 'desc' }
    });
    res.json({ loans });
  } catch (error) {
    next(error);
  }
});

router.post('/request', auth, async (req, res, next) => {
  try {
    const { deviceId, startDate, dueDate, requestReason, notes } = req.body;
    if (!deviceId || !startDate || !dueDate || !requestReason?.trim()) {
      return res.status(400).json({ error: 'Asset, Zeitraum und Grund sind erforderlich', code: 'INVALID_LOAN_REQUEST' });
    }

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.status !== 'AVAILABLE') {
      return res.status(409).json({ error: 'Geraet ist nicht verfuegbar', code: 'DEVICE_UNAVAILABLE' });
    }

    const loan = await prisma.loan.create({
      data: {
        deviceId,
        userId: req.user.id,
        borrowerName: req.user.username,
        borrowerContact: req.user.email || null,
        startDate: new Date(startDate),
        dueDate: new Date(dueDate),
        requestReason: requestReason.trim(),
        notes: notes?.trim() || null,
        status: 'REQUESTED'
      },
      include: { device: true, user: true }
    });

    await prisma.deviceHistory.create({
      data: { deviceId, action: 'loan_requested', userId: req.user.id, details: loan.id }
    });

    res.status(201).json({ loan });
  } catch (error) {
    next(error);
  }
});

router.get('/my', auth, async (req, res, next) => {
  try {
    await markOverdueLoans();
    const loans = await prisma.loan.findMany({
      where: { userId: req.user.id },
      include: { device: true },
      orderBy: { startDate: 'desc' }
    });
    res.json({ loans });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/approve', auth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id }, include: { device: true } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });
    if (!['REQUESTED', 'DISCUSSION_REQUESTED'].includes(existing.status)) {
      return res.status(409).json({ error: 'Nur offene Anfragen koennen akzeptiert werden', code: 'INVALID_LOAN_STATUS' });
    }
    if (existing.device.status !== 'AVAILABLE') {
      return res.status(409).json({ error: 'Geraet ist nicht verfuegbar', code: 'DEVICE_UNAVAILABLE' });
    }

    const loan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id: req.params.id },
        data: {
          status: 'ACTIVE',
          decisionMessage: req.body.message?.trim() || 'Ausleihe wurde akzeptiert.',
          decidedAt: new Date(),
          decidedById: req.user.id
        },
        include: { device: true, user: true }
      });
      await tx.device.update({ where: { id: existing.deviceId }, data: { status: 'LOANED' } });
      await tx.deviceHistory.create({ data: { deviceId: existing.deviceId, action: 'loan_request_approved', userId: req.user.id, details: updated.id } });
      return updated;
    });

    res.json({ loan });

    process.nextTick(() => notifyLoanApproved(loan).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/discussion', auth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
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

    await prisma.deviceHistory.create({ data: { deviceId: existing.deviceId, action: 'loan_request_discussion', userId: req.user.id, details: loan.id } });
    res.json({ loan });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const loan = await prisma.loan.findUnique({ where: { id: req.params.id }, include: { device: true, user: true } });
    if (!loan) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });
    res.json({ loan });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    let { deviceId, borrowerName, borrowerContact, borrowerGroup, dueDate, notes, customAssetName } = req.body;
    if (!deviceId || !borrowerName?.trim() || !dueDate) {
      return res.status(400).json({ error: 'Asset, Ausleiher und Rückgabedatum sind erforderlich', code: 'INVALID_LOAN_INPUT' });
    }

    if (deviceId === 'other') {
      if (!customAssetName?.trim()) {
        return res.status(400).json({ error: 'Bezeichnung des anderen Assets ist erforderlich', code: 'INVALID_LOAN_INPUT' });
      }
      const tempInventoryId = `SONST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const tempDevice = await prisma.device.create({
        data: {
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
      return res.status(409).json({ error: 'Geraet ist nicht verfuegbar', code: 'DEVICE_UNAVAILABLE' });
    }

    const loan = await prisma.$transaction(async (tx) => {
      const created = await tx.loan.create({
        data: {
          deviceId,
          borrowerName: borrowerName.trim(),
          borrowerContact: borrowerContact?.trim() || null,
          borrowerGroup: borrowerGroup?.trim() || null,
          dueDate: new Date(dueDate),
          notes
        }
      });
      await tx.device.update({ where: { id: deviceId }, data: { status: 'LOANED' } });
      await tx.deviceHistory.create({ data: { deviceId, action: 'loaned', userId: req.user.id, details: created.id } });
      return created;
    });

    res.status(201).json({ loan });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/return', auth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });

    const loan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id: req.params.id },
        data: { returnDate: new Date(), status: 'RETURNED' }
      });
      await tx.device.update({ where: { id: existing.deviceId }, data: { status: 'AVAILABLE' } });
      await tx.deviceHistory.create({ data: { deviceId: existing.deviceId, action: 'returned', userId: req.user.id } });
      return updated;
    });

    res.json({ loan });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ausleihe nicht gefunden', code: 'LOAN_NOT_FOUND' });

    await prisma.$transaction(async (tx) => {
      await tx.loan.delete({ where: { id: req.params.id } });
      if (existing.status !== 'RETURNED') {
        await tx.device.update({ where: { id: existing.deviceId }, data: { status: 'AVAILABLE' } });
      }
      await tx.deviceHistory.create({ data: { deviceId: existing.deviceId, action: 'loan_deleted', userId: req.user.id } });
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
