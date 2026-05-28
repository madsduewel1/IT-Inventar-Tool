const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { sendMail, getFromAddress } = require('./mailer');

const POLL_INTERVAL_MS = 5000;
const MAX_BATCH = 10;

let _interval = null;

async function enqueue({ to, subject, html, text, relatedType, relatedId }) {
  const job = await prisma.mailQueue.create({
    data: { to, subject, html, text: text || '' }
  });

  // Also create a pending log entry
  const from = await getFromAddress().catch(() => 'noreply@mz-inventory.local');
  await prisma.mailLog.create({
    data: {
      direction: 'OUTBOUND',
      fromAddr: from,
      toAddr: to,
      subject,
      body: html,
      status: 'PENDING',
      relatedType: relatedType || null,
      relatedId: relatedId || null
    }
  }).catch(() => {});

  logger.info({ jobId: job.id, to, subject }, 'Mail in Queue eingereiht');
  return job;
}

async function processQueue() {
  try {
    const jobs = await prisma.mailQueue.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: 3 }
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_BATCH
    });

    for (const job of jobs) {
      await prisma.mailQueue.update({
        where: { id: job.id },
        data: { status: 'PROCESSING', attempts: job.attempts + 1 }
      });

      try {
        const info = await sendMail({
          to: job.to,
          subject: job.subject,
          html: job.html,
          text: job.text || undefined
        });

        await prisma.mailQueue.update({
          where: { id: job.id },
          data: { status: 'SENT', processedAt: new Date() }
        });

        // Update log entry
        await prisma.mailLog.updateMany({
          where: {
            toAddr: job.to,
            subject: job.subject,
            status: 'PENDING',
            direction: 'OUTBOUND'
          },
          data: {
            status: 'SENT',
            messageId: info.messageId || null
          }
        }).catch(() => {});

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

        if (failed) {
          await prisma.mailLog.updateMany({
            where: {
              toAddr: job.to,
              subject: job.subject,
              status: 'PENDING',
              direction: 'OUTBOUND'
            },
            data: {
              status: 'FAILED',
              error: error.message
            }
          }).catch(() => {});
        }

        logger.error({ jobId: job.id, error: error.message, attempt: job.attempts + 1 }, 'Mail-Versand fehlgeschlagen');
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Mail-Queue-Verarbeitung fehlgeschlagen');
  }
}

async function retryJob(jobId) {
  const job = await prisma.mailQueue.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job nicht gefunden');
  if (job.status !== 'FAILED') throw new Error('Nur fehlgeschlagene Jobs können wiederholt werden');

  await prisma.mailQueue.update({
    where: { id: jobId },
    data: { status: 'PENDING', attempts: 0, lastError: null, processedAt: null }
  });

  // Reset log entry too
  await prisma.mailLog.updateMany({
    where: {
      toAddr: job.to,
      subject: job.subject,
      status: 'FAILED',
      direction: 'OUTBOUND'
    },
    data: { status: 'PENDING', error: null }
  }).catch(() => {});

  return job;
}

function startWorker() {
  if (_interval) return;
  logger.info('Mail-Queue-Worker gestartet');
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

module.exports = { enqueue, processQueue, retryJob, startWorker, stopWorker };
