const express = require('express');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { hasPermission, requirePermission } = require('../services/permissions');
const { notifyTicketCreated, notifyTicketUpdated, notifyTicketComment } = require('../services/mailNotify');

const router = express.Router();

const include = {
  device: { include: { room: true } },
  reporter: { select: { id: true, username: true, email: true } },
  assignee: { select: { id: true, username: true, email: true } },
  comments: { include: { user: { select: { id: true, username: true, role: true } } }, orderBy: { createdAt: 'asc' } }
};

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'ISSUE_REPORT')) {
      return res.status(403).json({ error: 'Keine Berechtigung', code: 'FORBIDDEN' });
    }

    const canManage = hasPermission(req.user, 'ISSUE_MANAGE');
    const fetchAll = canManage && req.query.all === 'true';
    
    const issues = await prisma.deviceIssue.findMany({
      where: fetchAll ? {} : { reporterId: req.user.id },
      include,
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ issues, canManage });
  } catch (error) {
    next(error);
  }
});

router.get('/assignees', requirePermission('ISSUE_MANAGE'), async (req, res, next) => {
  try {
    const assignees = await prisma.user.findMany({
      where: { role: { in: ['STAFF', 'ADMIN'] } },
      select: { id: true, username: true, role: true },
      orderBy: { username: 'asc' }
    });
    res.json({ assignees });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const issue = await prisma.deviceIssue.findUnique({
      where: { id: req.params.id },
      include
    });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });

    if (!hasPermission(req.user, 'ISSUE_MANAGE') && issue.reporterId !== req.user.id) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Ticket', code: 'FORBIDDEN' });
    }

    res.json({ issue, canManage: hasPermission(req.user, 'ISSUE_MANAGE') });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('ISSUE_REPORT'), async (req, res, next) => {
  try {
    const { deviceId, title, description, priority } = req.body;
    if (!deviceId || !title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Gerät, Titel und Beschreibung sind Pflichtfelder', code: 'INVALID_ISSUE_INPUT' });
    }

    const device = await prisma.device.findFirst({ where: { OR: [{ id: deviceId }, { inventoryId: deviceId }] } });
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden', code: 'DEVICE_NOT_FOUND' });

    const issue = await prisma.deviceIssue.create({
      data: {
        deviceId: device.id,
        reporterId: req.user.id,
        title: title.trim(),
        description: description.trim(),
        priority: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(priority) ? priority : 'NORMAL'
      },
      include
    });

    await prisma.device.update({
      where: { id: device.id },
      data: { status: 'DEFECT' }
    });

    await prisma.deviceHistory.create({
      data: { deviceId: device.id, action: 'issue_reported', details: issue.title, userId: req.user.id }
    });

    res.status(201).json({ issue });

    process.nextTick(() => notifyTicketCreated(issue).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requirePermission('ISSUE_MANAGE'), async (req, res, next) => {
  try {
    const data = {};
    if (['OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED'].includes(req.body.status)) data.status = req.body.status;
    if (['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(req.body.priority)) data.priority = req.body.priority;
    if (req.body.resolution !== undefined) data.resolution = String(req.body.resolution || '');
    if (req.body.assigneeId !== undefined) data.assigneeId = req.body.assigneeId || null;

    const issue = await prisma.deviceIssue.update({ where: { id: req.params.id }, data, include });
    await prisma.deviceHistory.create({
      data: { deviceId: issue.deviceId, action: 'issue_updated', details: `${issue.title} (${issue.status})`, userId: req.user.id }
    });

    res.json({ issue });

    process.nextTick(() => notifyTicketUpdated(issue).catch(() => {}));
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
        reporter: { select: { id: true, username: true, email: true } },
        assignee: { select: { id: true, username: true, email: true } }
      }
    });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });

    if (!hasPermission(req.user, 'ISSUE_MANAGE') && issue.reporterId !== req.user.id) {
      return res.status(403).json({ error: 'Keine Berechtigung für dieses Ticket', code: 'FORBIDDEN' });
    }

    const comment = await prisma.issueComment.create({
      data: {
        issueId: issue.id,
        userId: req.user.id,
        text: text.trim()
      },
      include: { user: { select: { id: true, username: true, role: true } } }
    });

    res.status(201).json({ comment });

    process.nextTick(() => notifyTicketComment(issue, comment).catch(() => {}));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const issue = await prisma.deviceIssue.findUnique({ where: { id: req.params.id } });
    if (!issue) return res.status(404).json({ error: 'Ticket nicht gefunden', code: 'NOT_FOUND' });

    if (!hasPermission(req.user, 'ISSUE_MANAGE') && issue.reporterId !== req.user.id) {
      return res.status(403).json({ error: 'Keine Berechtigung', code: 'FORBIDDEN' });
    }

    await prisma.deviceIssue.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
