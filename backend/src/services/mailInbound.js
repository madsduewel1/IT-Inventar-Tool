const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { enqueue } = require('./mailQueue');

const POLL_INTERVAL_MS = 60000;
let _interval = null;
let _client = null;

async function getImapSettings() {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: 'mail.imap.' } }
    });
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      host: settings['mail.imap.host'] || process.env.IMAP_HOST,
      port: Number(settings['mail.imap.port'] || process.env.IMAP_PORT || 993),
      user: settings['mail.imap.user'] || process.env.IMAP_USER,
      pass: settings['mail.imap.pass'] || process.env.IMAP_PASS
    };
  } catch {
    return {};
  }
}

function isImapConfigured(settings) {
  return !!(settings.host && settings.user && settings.pass);
}

async function createClient() {
  const settings = await getImapSettings();
  if (!isImapConfigured(settings)) return null;

  return new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 993,
    auth: { user: settings.user, pass: settings.pass },
    logger: false
  });
}

async function findUserByEmail(email) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, username: true, email: true }
  });
}

function extractTicketId(subject) {
  const match = subject.match(/\[TICKET-([A-Za-z0-9]+)\]/);
  return match ? match[1] : null;
}

async function checkInbox() {
  try {
    const settings = await getImapSettings();
    if (!isImapConfigured(settings)) return;

    const client = await createClient();
    if (!client) return;
    _client = client;

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const messages = [];
      for await (const msg of client.fetch({ seen: false }, { uid: true, source: true })) {
        messages.push(msg);
      }

      for (const msg of messages) {
        try {
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.[0]?.address;
          const subject = parsed.subject || '(Kein Betreff)';
          const text = parsed.text || parsed.html || '';
          const html = parsed.html || '';
          const attachments = parsed.attachments || [];

          if (!from) {
            logger.warn({ uid: msg.uid }, 'E-Mail ohne Absender ignoriert');
            await markSeen(client, msg.uid);
            continue;
          }

          const user = await findUserByEmail(from);
          const ticketId = extractTicketId(subject);

          if (ticketId) {
            await handleTicketReply(ticketId, from, user, subject, text, attachments);
          } else if (user) {
            await handleNewTicket(from, user, subject, text, html, attachments);
          } else {
            logger.info({ from, subject }, 'E-Mail von unbekanntem Absender ignoriert');
          }

          await markSeen(client, msg.uid);
        } catch (parseError) {
          logger.error({ error: parseError.message, uid: msg.uid }, 'Fehler beim Verarbeiten einer E-Mail');
          await markSeen(client, msg.uid);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    _client = null;
  } catch (error) {
    logger.error({ error: error.message }, 'IMAP-Inbox-Check fehlgeschlagen');
    _client = null;
  }
}

async function markSeen(client, uid) {
  try {
    await client.messageFlagsAdd({ uid }, ['\\Seen']);
  } catch {
  }
}

async function handleTicketReply(ticketId, from, user, subject, text, attachments) {
  const issue = await prisma.deviceIssue.findUnique({
    where: { id: ticketId },
    include: {
      reporter: { select: { id: true, username: true, email: true } },
      assignee: { select: { id: true, username: true, email: true } }
    }
  });

  if (!issue) {
    logger.warn({ ticketId, from }, 'Ticket nicht gefunden für Antwort');
    return;
  }

  if (!user) {
    logger.warn({ ticketId, from }, 'Absender kein registrierter Benutzer');
    return;
  }

  if (issue.reporterId !== user.id && issue.assigneeId !== user.id) {
    logger.warn({ ticketId, from }, 'Absender nicht berechtigt für Ticket-Antwort');
    return;
  }

  const commentText = stripReply(text);
  if (!commentText) return;

  const comment = await prisma.issueComment.create({
    data: { issueId: issue.id, userId: user.id, text: commentText },
    include: { user: { select: { id: true, username: true, role: true } } }
  });

  for (const attachment of attachments) {
    if (attachment.content && attachment.filename) {
      await prisma.issueComment.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          text: `[Anhang: ${attachment.filename}]`
        }
      });
    }
  }

  await prisma.mailLog.create({
    data: {
      direction: 'INBOUND',
      fromAddr: from,
      toAddr: '',
      subject,
      body: commentText,
      status: 'PROCESSED',
      relatedType: 'TICKET_REPLY',
      relatedId: issue.id
    }
  });

  logger.info({ ticketId: issue.id, from }, 'Ticket-Antwort per E-Mail verarbeitet');
}

async function handleNewTicket(from, user, subject, text, html, attachments) {
  const device = await prisma.device.findFirst({
    where: { status: { not: 'RETIRED' } },
    orderBy: { createdAt: 'desc' }
  });

  if (!device) {
    logger.warn({ from, subject }, 'Kein Gerät für Ticket-Erstellung verfügbar');
    return;
  }

  const description = stripReply(text || html || '');

  const issue = await prisma.deviceIssue.create({
    data: {
      deviceId: device.id,
      reporterId: user.id,
      title: subject,
      description: description || '(Keine Beschreibung)',
      priority: 'NORMAL'
    },
    include: {
      device: true,
      reporter: { select: { id: true, username: true, email: true } },
      assignee: { select: { id: true, username: true, email: true } }
    }
  });

  await prisma.device.update({
    where: { id: device.id },
    data: { status: 'DEFECT' }
  });

  await prisma.deviceHistory.create({
    data: { deviceId: device.id, action: 'issue_reported', details: issue.title, userId: user.id }
  });

  for (const attachment of attachments) {
    if (attachment.content && attachment.filename) {
      await prisma.issueComment.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          text: `[Anhang: ${attachment.filename}]`
        }
      });
    }
  }

  await prisma.mailLog.create({
    data: {
      direction: 'INBOUND',
      fromAddr: from,
      toAddr: '',
      subject,
      body: description,
      status: 'PROCESSED',
      relatedType: 'TICKET_CREATED',
      relatedId: issue.id
    }
  });

  logger.info({ issueId: issue.id, from, subject }, 'Ticket per E-Mail erstellt');
}

function stripReply(text) {
  if (!text) return '';
  return text
    .split(/\n\s*>+\s.*/)[0]
    .split(/^[-]+\s*Original[- ]/m)[0]
    .split(/^[-]+\s*Ursprüngliche Nachricht[- ]/m)[0]
    .split(/^On\s.*wrote:/m)[0]
    .split(/^Am\s.*schrieb:/m)[0]
    .trim();
}

function startInboxWatcher() {
  if (_interval) return;
  logger.info('IMAP-Inbox-Watcher gestartet');
  checkInbox();
  _interval = setInterval(checkInbox, POLL_INTERVAL_MS);
}

function stopInboxWatcher() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  if (_client) {
    _client.close().catch(() => {});
    _client = null;
  }
}

async function testImapConnection() {
  const settings = await getImapSettings();
  if (!isImapConfigured(settings)) {
    return { ok: false, error: 'IMAP ist nicht konfiguriert' };
  }
  try {
    const client = await createClient();
    if (!client) return { ok: false, error: 'IMAP ist nicht konfiguriert' };
    await client.connect();
    await client.logout();
    return { ok: true, host: settings.host, port: settings.port, user: settings.user };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { checkInbox, startInboxWatcher, stopInboxWatcher, testImapConnection };
