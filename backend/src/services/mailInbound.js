const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { notifyInboundAutoReply } = require('./mailNotify');

const POLL_INTERVAL_MS = 60000;
let _interval = null;
let _client = null;
let _checking = false;

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

function extractTicketId(subject) {
  const match = subject.match(/\[TICKET-([A-Za-z0-9]+)\]/);
  return match ? match[1] : null;
}

/**
 * Liest den Posteingang und:
 * - Verarbeitet Ticket-Antworten ([TICKET-ID] im Betreff) sofort als Kommentar
 * - Speichert alle anderen E-Mails in der InboundMail-Queue (PENDING) zur manuellen Freigabe
 */
async function checkInbox() {
  if (_checking) return; // Race Condition verhindern
  _checking = true;
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
          const fromName = parsed.from?.value?.[0]?.name || null;
          const subject = parsed.subject || '(Kein Betreff)';
          const text = parsed.text || '';
          const html = parsed.html || '';

          if (!from) {
            logger.warn({ uid: msg.uid }, 'E-Mail ohne Absender ignoriert');
            await markSeen(client, msg.uid);
            continue;
          }

          const ticketId = extractTicketId(subject);

          if (ticketId) {
            // Ticket-Antwort: sofort als Kommentar verarbeiten
            const user = await findUserByEmail(from);
            await handleTicketReply(ticketId, from, user, subject, text, parsed.attachments || []);
          } else {
            // Neue E-Mail: in InboundMail-Queue speichern (für manuelle Freigabe)
            await queueInboundMail({
              imapUid: msg.uid,
              fromAddr: from,
              fromName,
              subject,
              body: stripReply(text) || text,
              bodyHtml: html || null
            });
            // Automatische Empfangsbestätigung an den Absender.
            // Nicht blockierend: Fehler der Auto-Antwort brechen die Mail-Verarbeitung nicht ab.
            notifyInboundAutoReply({ fromAddr: from, fromName }).catch(() => {});
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
    // IMAP-Client ordnungsgemäß schließen, um TCP-Socket-Ressourcen freizugeben
    if (_client) {
      try {
        await _client.close().catch(() => {});
      } catch {
        // Ignoriere Fehler beim Schließen
      }
      _client = null;
    }
  } finally {
    _checking = false;
  }
}

/**
 * Speichert eine eingehende E-Mail in der Queue (verhindert Duplikate via imapUid).
 */
async function queueInboundMail({ imapUid, fromAddr, fromName, subject, body, bodyHtml }) {
  try {
    // Duplikat-Prüfung über imapUid
    if (imapUid) {
      const exists = await prisma.inboundMail.findFirst({ where: { imapUid } });
      if (exists) return;
    }

    await prisma.inboundMail.create({
      data: { imapUid: imapUid || null, fromAddr, fromName, subject, body, bodyHtml }
    });
    logger.info({ fromAddr, subject }, 'E-Mail in Posteingangs-Queue gespeichert');
  } catch (error) {
    logger.error({ error: error.message, fromAddr, subject }, 'Fehler beim Speichern in Posteingangs-Queue');
  }
}

async function markSeen(client, uid) {
  try {
    await client.messageFlagsAdd({ uid }, ['\\Seen']);
  } catch {
  }
}

async function findUserByEmail(email) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, username: true, displayName: true, email: true }
  });
}

async function handleTicketReply(ticketId, from, user, subject, text, attachments) {
  const issue = await prisma.deviceIssue.findUnique({
    where: { id: ticketId },
    include: {
      reporter: { select: { id: true, username: true, displayName: true, email: true } },
      assignee: { select: { id: true, username: true, displayName: true, email: true } }
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

  await prisma.issueComment.create({
    data: { issueId: issue.id, userId: user.id, text: commentText },
    include: { user: { select: { id: true, username: true, displayName: true, role: true } } }
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

module.exports = { checkInbox, startInboxWatcher, stopInboxWatcher, testImapConnection, queueInboundMail };
