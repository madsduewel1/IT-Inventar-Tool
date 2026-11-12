const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { sendMail, getFromAddress } = require('./mailer');

const POLL_INTERVAL_MS = 5000;
const MAX_BATCH = 10;
const MAX_CONSECUTIVE_ERRORS = 5;
const MAIL_QUEUE_RETENTION_DAYS = 30;
const MAIL_LOG_RETENTION_DAYS = 90;

let _interval = null;
let _consecutiveErrors = 0;
let _processing = false;

async function enqueue({ to, subject, html, text, relatedType, relatedId }) {
  const job = await prisma.mailQueue.create({
    data: { to, subject, html: html || '', text: text || '' }
  });

  // Also create a pending log entry — store job ID in relatedId for reliable matching
  const from = await getFromAddress().catch(() => 'noreply@inventar-tool.local');
  await prisma.mailLog.create({
    data: {
      direction: 'OUTBOUND',
      fromAddr: from,
      toAddr: to,
      subject,
      body: text || html,
      status: 'PENDING',
      relatedType: 'MAIL_QUEUE',
      relatedId: job.id
    }
  }).catch((err) => {
    logger.error({ error: err.message, to, subject }, 'MailLog-Eintrag konnte nicht erstellt werden');
  });

  logger.info({ jobId: job.id, to, subject }, 'Mail in Queue eingereiht');
  return job;
}

async function processQueue() {
  // Überlappungsschutz: Läufe dürfen sich nicht überlappen, sonst werden
  // identische PENDING-Jobs doppelt verarbeitet und Mails doppelt gesendet.
  if (_processing) return;
  _processing = true;
  try {
    const pending = await prisma.mailQueue.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: MAX_BATCH
    });
    const jobs = pending.filter((job) => job.attempts < job.maxAttempts);

    _consecutiveErrors = 0;
    for (const job of jobs) {
      await prisma.mailQueue.update({
        where: { id: job.id },
        data: { status: 'PROCESSING', attempts: job.attempts + 1 }
      });

      try {
        const info = await sendMail({
          to: job.to,
          subject: job.subject,
          html: job.html || undefined,
          text: job.text || undefined
        });

        await prisma.mailQueue.update({
          where: { id: job.id },
          data: { status: 'SENT', processedAt: new Date() }
        });

        // Update log entry — match by job ID for reliable correlation
        await prisma.mailLog.updateMany({
          where: {
            relatedType: 'MAIL_QUEUE',
            relatedId: job.id,
            status: 'PENDING'
          },
          data: {
            status: 'SENT',
            messageId: info.messageId || null
          }
        }).catch((err) => {
          logger.warn({ error: err.message, jobId: job.id }, 'MailLog-Update (SENT) fehlgeschlagen');
        });

        logger.info({ jobId: job.id, to: job.to }, 'Mail erfolgreich gesendet');
      } catch (error) {
        const failed = job.attempts + 1 >= job.maxAttempts;
        await prisma.mailQueue.update({
          where: { id: job.id },
          data: {
            status: failed ? 'FAILED' : 'PENDING',
            lastError: error.message,
            processedAt: failed ? new Date() : null
          }
        });

        await prisma.mailLog.updateMany({
          where: {
            relatedType: 'MAIL_QUEUE',
            relatedId: job.id
          },
          data: {
            status: failed ? 'FAILED' : 'PENDING',
            error: error.message
          }
        }).catch((err) => {
          logger.warn({ error: err.message, jobId: job.id }, 'MailLog-Update (Fehlerfall) fehlgeschlagen');
        });

        logger.error({ jobId: job.id, error: error.message, attempt: job.attempts + 1 }, 'Mail-Versand fehlgeschlagen');
      }
    }
  } catch (error) {
    _consecutiveErrors++;
    if (_consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
      logger.error({ error: error.message, consecutiveErrors: _consecutiveErrors }, 'Mail-Queue-Verarbeitung wiederholt fehlgeschlagen — warte auf nächsten Zyklus');
    } else {
      logger.error({ error: error.message }, 'Mail-Queue-Verarbeitung fehlgeschlagen');
    }
  } finally {
    _processing = false;
  }
}

// Jobs, die beim letzten Worker-Lauf in PROCESSING hängen geblieben sind
// (Prozess-Crash o. Ä.), wieder in den Verarbeitungszyklus aufnehmen.
async function recoverStuckJobs() {
  try {
    const result = await prisma.mailQueue.updateMany({
      where: { status: 'PROCESSING' },
      data: { status: 'PENDING', lastError: 'Worker-Neustart: Job von PROCESSING auf PENDING zurückgesetzt' }
    });
    if (result.count > 0) logger.warn({ count: result.count }, 'Hängengebliebene Mail-Jobs zurückgesetzt');
  } catch (error) {
    logger.error({ error: error.message }, 'Recovery hängengebliebener Mail-Jobs fehlgeschlagen');
  }
}

async function retryJob(jobId) {
  const job = await prisma.mailQueue.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job nicht gefunden');
  if (job.status !== 'FAILED') throw new Error('Nur fehlgeschlagene Jobs können wiederholt werden');

  const updated = await prisma.mailQueue.update({
    where: { id: jobId },
    data: { status: 'PENDING', attempts: 0, lastError: null, processedAt: null }
  });

  // Reset log entry too — match by job ID
  await prisma.mailLog.updateMany({
    where: {
      relatedType: 'MAIL_QUEUE',
      relatedId: jobId,
      status: 'FAILED'
    },
    data: { status: 'PENDING', error: null }
  }).catch(() => {});

  return updated;
}

function startWorker() {
  if (_interval) return;
  logger.info('Mail-Queue-Worker gestartet');
  recoverStuckJobs();
  _interval = setInterval(processQueue, POLL_INTERVAL_MS);
  // Run once immediately
  processQueue();
}

function stopWorker() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

// Entfernt alte, abgeschlossene Jobs und Log-Einträge, damit Queue und Log
// nicht unbegrenzt wachsen (voller Table-Scans/Speicherverbrauch).
async function cleanupOldMail() {
  try {
    const queueCutoff = new Date(Date.now() - MAIL_QUEUE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const logCutoff = new Date(Date.now() - MAIL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const queueResult = await prisma.mailQueue.deleteMany({
      where: { status: { in: ['SENT', 'FAILED'] }, createdAt: { lt: queueCutoff } }
    });
    const logResult = await prisma.mailLog.deleteMany({
      where: { createdAt: { lt: logCutoff } }
    });

    if (queueResult.count > 0 || logResult.count > 0) {
      logger.info({ queue: queueResult.count, logs: logResult.count }, 'Alte Mail-Queue-/MailLog-Daten bereinigt');
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Mail-Queue-Bereinigung fehlgeschlagen');
  }
}

module.exports = { enqueue, processQueue, retryJob, startWorker, stopWorker, cleanupOldMail };
