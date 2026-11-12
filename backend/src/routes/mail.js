const express = require('express');
const prisma = require('../config/prisma');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../services/permissions');
const { verifyConnection, sendMail, getFromAddress, getMailSettings, isConfigured, resetTransporter } = require('../services/mailer');
const { enqueue, retryJob } = require('../services/mailQueue');
const { renderTemplate } = require('../services/mailTemplates');
const { testImapConnection, checkInbox } = require('../services/mailInbound');

const router = express.Router();
router.use(auth, requirePermission('MAIL_MANAGE'));

function isDatabaseConnectionError(error) {
  const message = `${error?.message || ''} ${error?.code || ''}`;
  return (
    error?.code === 'P1001' ||
    message.includes("Can't reach database server") ||
    message.includes('ECONNREFUSED') ||
    message.includes('connect ECONNREFUSED')
  );
}

router.get('/logs', async (req, res, next) => {
  try {
    const { status, direction, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (direction) where.direction = direction;

    const [logs, total] = await Promise.all([
      prisma.mailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit) || 50, 200),
        skip: Number(offset) || 0
      }),
      prisma.mailLog.count({ where })
    ]);
    res.json({ logs, total });
  } catch (error) {
    next(error);
  }
});

router.get('/queue', async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;

    const [jobs, total] = await Promise.all([
      prisma.mailQueue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      prisma.mailQueue.count({ where })
    ]);
    res.json({ jobs, total });
  } catch (error) {
    next(error);
  }
});

router.post('/queue/:id/retry', async (req, res, next) => {
  try {
    const job = await retryJob(req.params.id);
    res.json({ job });
  } catch (error) {
    next(error);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!to?.trim()) {
      return res.status(400).json({ error: 'Empfänger-E-Mail ist erforderlich', code: 'MISSING_TO' });
    }

    await prisma.$queryRaw`SELECT 1`;

    const settings = await getMailSettings();
    if (!isConfigured(settings)) {
      return res.status(503).json({ error: 'SMTP ist nicht konfiguriert. Bitte prüfe die Mail-Einstellungen.', code: 'MAIL_NOT_CONFIGURED' });
    }

    const { subject, html, text } = await renderTemplate('testMail', {
      orgName: 'Inventar-Tool',
      smtpHost: settings['mail.smtp.host'] || process.env.SMTP_HOST || 'Unbekannt',
      timestamp: new Date().toLocaleString('de-DE')
    });

    await enqueue({ to: to.trim(), subject, html, text, relatedType: 'TEST', relatedId: null });
    res.json({ success: true, message: 'Test-Mail wurde in die Queue eingereiht' });
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return res.status(503).json({
        error: 'Datenbank nicht erreichbar. Die Test-Mail konnte nicht in die Versand-Queue gelegt werden.',
        code: 'DATABASE_UNAVAILABLE'
      });
    }
    res.status(400).json({
      error: error.message || 'Unbekannter Fehler beim Testversand. Bitte prüfe die Mail-Einstellungen.',
      code: 'MAIL_TEST_FAILED'
    });
  }
});

router.get('/smtp/status', async (req, res, next) => {
  try {
    const settings = await getMailSettings();
    const configured = isConfigured(settings);
    const from = await getFromAddress();
    res.json({
      configured,
      from,
      host: settings['mail.smtp.host'] || process.env.SMTP_HOST || null,
      port: settings['mail.smtp.port'] || process.env.SMTP_PORT || null,
      user: settings['mail.smtp.user'] ? '***' : null
    });
  } catch (error) {
    next(error);
  }
});

router.post('/smtp/verify', async (req, res, next) => {
  try {
    resetTransporter();
    const result = await verifyConnection();
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message || 'SMTP-Verbindung fehlgeschlagen. Bitte prüfe die Mail-Einstellungen.',
      code: 'SMTP_VERIFY_FAILED'
    });
  }
});

router.get('/imap/status', async (req, res, next) => {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: 'mail.imap.' } }
    });
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      configured: !!(settings['mail.imap.host'] && settings['mail.imap.user']),
      host: settings['mail.imap.host'] || null,
      port: settings['mail.imap.port'] || null,
      user: settings['mail.imap.user'] ? '***' : null
    });
  } catch (error) {
    next(error);
  }
});

router.post('/imap/test', async (req, res, next) => {
  try {
    const result = await testImapConnection();
    res.json(result);
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});

router.post('/imap/process', async (req, res, next) => {
  try {
    await checkInbox();
    res.json({ success: true, message: 'Postfach wurde geprüft' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
