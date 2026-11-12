const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config/config');
const logger = require('./config/logger');
const { apiLimiter } = require('./middleware/rateLimit');
const { issueCsrfToken, csrfProtection } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errors');
const { startWorker, stopWorker, cleanupOldMail } = require('./services/mailQueue');
const { startInboxWatcher, stopInboxWatcher } = require('./services/mailInbound');
const { markOverdueLoans, notifyUpcomingDueLoans } = require('./services/monitoring');
const { getSettingCached } = require('./services/settingsCache');
const updater = require('./services/updater');
const prisma = require('./config/prisma');

fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });

const app = express();
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// Controls where the app may be embedded. The allowed frame ancestors are stored
// in settings so admins can change portal integrations without redeploying.
app.use(async (req, res, next) => {
  try {
    const originsRaw = await getSettingCached('embed.allowedOrigins');
    const origins = originsRaw.split(',').map((o) => o.trim()).filter(Boolean);
    if (origins.length > 0) {
      const frameAncestors = origins.join(' ');
      res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frameAncestors}`);
      // X-Frame-Options supports only one origin; CSP handles multi-origin setups.
      if (origins.length === 1) {
        res.setHeader('X-Frame-Options', `ALLOW-FROM ${origins[0]}`);
      } else {
        res.removeHeader('X-Frame-Options');
      }
    } else {
      // Default: only this app may embed itself.
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    }
  } catch {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  next();
});

app.use(helmet({ frameguard: false, contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: config.env === 'production' ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: false
}));

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'mz-inventory-lite', setupDone: process.env.SETUP_DONE === 'true' });
});

app.use('/api', apiLimiter);
app.get('/api/csrf-token', issueCsrfToken);
app.use('/api', csrfProtection);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/setup', require('./routes/setup'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/areas', require('./routes/areas'));
app.use('/api/ticket-types', require('./routes/ticketTypes'));
app.use('/api/issue-templates', require('./routes/issueTemplates'));
app.use('/api/my-devices', require('./routes/myDevices'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/users', require('./routes/users'));
app.use('/api/api-keys', require('./routes/api-keys'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/mail', require('./routes/mail'));
app.use('/api/system', require('./routes/system'));
  app.use('/api/system/updates', require('./routes/system-updates'));
app.use('/api/updates', require('./routes/updates'));
app.use('/api/inbound-mail', require('./routes/inbound-mail'));

// Legacy QR-code entry point. Labels can keep this stable URL even if frontend
// routes move again later.
app.get('/fehler/show/device', (req, res) => {
  const id = req.query.id;
  if (id) {
    res.redirect(301, `${config.basePath}/devices?id=${encodeURIComponent(id)}`);
  } else {
    res.redirect(301, config.basePath || '/');
  }
});

app.use(notFound);
app.use(errorHandler);

let overdueCheckTimer = null;
let sessionCleanupTimer = null;
let mailCleanupTimer = null;

function runOverdueCheck() {
  markOverdueLoans().catch((err) => logger.warn({ err: err.message }, 'Overdue-Check fehlgeschlagen'));
  // Erinnerung für bald endende Ausleihen (sendet intern max. 1x pro 24h)
  notifyUpcomingDueLoans().catch((err) => logger.warn({ err: err.message }, 'Upcoming-Loan-Check fehlgeschlagen'));
}

// Hintergrund-Aufgaben (Mail-Queue, IMAP-Posteingang, Überfällig-Check,
// Aufräum-Jobs) lassen sich für eine zweite lokale Instanz abschalten:
//   BACKGROUND_JOBS=false PORT=3457 node src/index.js
// Sonst würden zwei Instanzen dieselben Mails doppelt verarbeiten.
const backgroundJobs = process.env.BACKGROUND_JOBS !== 'false';

app.listen(config.port, () => {
  logger.info({ port: config.port, basePath: config.basePath }, 'MZ-Inventory Lite backend started');
  if (config.jwtSecret === 'change-me') {
    logger.warn('JWT_SECRET ist noch auf "change-me" gesetzt. Bitte in der backend.env Datei ein sicheres, zufaelliges Token setzen.');
  }
  if (backgroundJobs) {
    startWorker();
    startInboxWatcher();
    runOverdueCheck();
    overdueCheckTimer = setInterval(runOverdueCheck, 5 * 60 * 1000);
    cleanupExpiredSessions();
    sessionCleanupTimer = setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
    cleanupOldMail();
    mailCleanupTimer = setInterval(cleanupOldMail, 24 * 60 * 60 * 1000);
    updater.startTimer();
  } else {
    logger.info('Hintergrund-Aufgaben deaktiviert (BACKGROUND_JOBS=false).');
  }
});

function gracefulShutdown(signal) {
  logger.info({ signal }, 'Server wird heruntergefahren...');
  if (overdueCheckTimer) clearInterval(overdueCheckTimer);
  if (sessionCleanupTimer) clearInterval(sessionCleanupTimer);
  if (mailCleanupTimer) clearInterval(mailCleanupTimer);
  updater.stopTimer();
  stopWorker();
  stopInboxWatcher();
  prisma.$disconnect().then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

async function cleanupExpiredSessions() {
  try {
    const deleted = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    if (deleted.count > 0) logger.info({ count: deleted.count }, 'Expired sessions cleaned up');
  } catch (err) {
    logger.warn({ err }, 'Session cleanup failed');
  }
}
