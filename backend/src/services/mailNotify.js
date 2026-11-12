const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { enqueue } = require('./mailQueue');
const { renderTemplate } = require('./mailTemplates');
const { isConfigured, getMailSettings } = require('./mailer');
const { getSettingCached } = require('./settingsCache');
const { devicesLabel } = require('./issues');
const { priorityLabel } = require('./issueMeta');

/**
 * Internal helper: get org name from settings for template context.
 */
async function getOrgName() {
  try {
    return (await getSettingCached('org.name')) || 'Inventar-Tool';
  } catch {
    return 'Inventar-Tool';
  }
}

async function getAppUrl() {
  try {
    return ((await getSettingCached('app.url')) || '').trim().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * Schalter aus den Ticket-Benachrichtigungseinstellungen. Standard ist aktiv,
 * solange die Einstellung nicht ausdrücklich auf "false" gesetzt wurde.
 */
async function settingEnabled(key) {
  try {
    const value = await getSettingCached(key);
    return value === null || value === undefined || value === '' || value === 'true';
  } catch {
    return true;
  }
}

/**
 * Check if mail sending is available.
 */
async function canSendMail() {
  const settings = await getMailSettings();
  return isConfigured(settings);
}

/**
 * Ticket was created — notify admin users (Bereichs-E-Mail-Empfänger kommen
 * separat über `notifyAreaIssueCreated`; normale ITler erhalten keine
 * generelle Ticket-Mail mehr, Konzept „Mein Gerät").
 */
async function notifyTicketCreated(issue) {
  if (!(await canSendMail())) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();
  const adminUsers = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { email: true, username: true, displayName: true }
  });

  const context = devicesLabel(issue.devices?.length ? issue.devices : issue.device ? [issue.device] : [])
    || issue.room?.name
    || issue.softwareName
    || '';
  const typeLabel = { DEVICE: 'Schulgerät', PERSONAL: 'Privat-/Dienstgerät', WLAN: 'WLAN / Netzwerk', SOFTWARE: 'Software' }[issue.type] || 'Ticket';
  const deviceName = context ? `${typeLabel} · ${context}` : typeLabel;

  for (const admin of adminUsers) {
    if (!admin.email) continue;
    try {
      const { subject, html, text } = await renderTemplate('ticketCreated', {
        name: admin.displayName || admin.username,
        ticketTitle: issue.title,
        ticketId: issue.id,
        deviceName,
        description: issue.description,
        priority: issue.priority || 'NORMAL',
        orgName,
        ticketUrl: appUrl ? `${appUrl}/issues?id=${issue.id}` : ''
      });
      await enqueue({ to: admin.email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
    } catch (error) {
      logger.error({ error: error.message, to: admin.email }, 'notifyTicketCreated fehlgeschlagen');
    }
  }
}

/**
 * Ticket was created — notify the Area members of the affected device
 * (Konzept „Mein Gerät", Abschnitt 10). Nur Bereiche mit aktivierter
 * Fehlerbenachrichtigung (`Area.issueMailEnabled`) lösen Mails aus; der
 * Melder selbst bekommt die Nachricht nicht doppelt.
 */
async function notifyAreaIssueCreated(issue, area, device) {
  if (!area?.issueMailEnabled) return;
  if (!(await canSendMail())) return;
  if (!(await settingEnabled('tickets.notifyAreaRecipients'))) return;

  const members = await prisma.areaMember.findMany({
    where: { areaId: area.id },
    select: { user: { select: { id: true, email: true, username: true, displayName: true } } }
  });

  const recipients = new Map();
  for (const member of members) {
    const user = member.user;
    if (!user?.email) continue;
    if (issue.reporterId && user.id === issue.reporterId) continue;
    recipients.set(user.email, user);
  }
  if (recipients.size === 0) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();
  const reporterName = issue.reporter?.displayName
    || issue.reporter?.username
    || issue.reporterEmail
    || 'Unbekannt';
  const reportedAt = new Date(issue.createdAt).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  for (const [email, user] of recipients) {
    try {
      const { subject, html, text } = await renderTemplate('areaIssueCreated', {
        name: user.displayName || user.username,
        areaName: area.name,
        deviceName: device ? (device.model || device.inventoryId || '') : '',
        inventoryId: device?.inventoryId || '',
        reporterName,
        ticketTitle: issue.title,
        description: issue.description,
        priority: priorityLabel(issue.priority),
        reportedAt,
        orgName,
        ticketUrl: appUrl ? `${appUrl}/issues?id=${issue.id}` : ''
      });
      await enqueue({ to: email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
    } catch (error) {
      logger.error({ error: error.message, to: email }, 'notifyAreaIssueCreated fehlgeschlagen');
    }
  }
}

/**
 * Ticket was created — notify the assigned recipients of the ticket type
 * (Netzwerk/Dienstgerät/Software). Schulgerät-Tickets (DEVICE) laufen über die
 * Bereichs-Benachrichtigung `notifyAreaIssueCreated`.
 */
async function notifyIssueTypeCreated(issue) {
  if (!issue?.type || issue.type === 'DEVICE') return;
  if (!(await canSendMail())) return;
  if (!(await settingEnabled('tickets.notifyTypeRecipients'))) return;

  const members = await prisma.issueTypeMember.findMany({
    where: { type: issue.type },
    select: { user: { select: { id: true, email: true, username: true, displayName: true } } }
  });

  const recipients = new Map();
  for (const member of members) {
    const user = member.user;
    if (!user?.email) continue;
    if (issue.reporterId && user.id === issue.reporterId) continue;
    recipients.set(user.email, user);
  }
  if (recipients.size === 0) return;

  const typeLabel = {
    DEVICE: 'Schulgerät',
    PERSONAL: 'Privat-/Dienstgerät',
    WLAN: 'WLAN / Netzwerk',
    SOFTWARE: 'Software'
  }[issue.type] || 'Ticket';

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();
  const reporterName = issue.reporter?.displayName
    || issue.reporter?.username
    || issue.reporterEmail
    || 'Unbekannt';
  const reportedAt = new Date(issue.createdAt).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  for (const [email, user] of recipients) {
    try {
      const { subject, html, text } = await renderTemplate('issueTypeCreated', {
        name: user.displayName || user.username,
        typeLabel,
        reporterName,
        ticketTitle: issue.title,
        description: issue.description,
        priority: priorityLabel(issue.priority),
        reportedAt,
        orgName,
        ticketUrl: appUrl ? `${appUrl}/issues?id=${issue.id}` : ''
      });
      await enqueue({ to: email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
    } catch (error) {
      logger.error({ error: error.message, to: email }, 'notifyIssueTypeCreated fehlgeschlagen');
    }
  }
}

/**
 * Ticket was updated — notify the reporter and all relevant assignees.
 */
async function notifyTicketUpdated(issue, actorId = null) {
  if (!(await canSendMail())) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();

  const isClosed = ['CLOSED', 'DONE', 'REJECTED'].includes(issue.status);
  const templateName = isClosed ? 'ticketClosed' : 'ticketUpdated';

  const statusLabels = {
    OPEN: 'Offen',
    IN_PROGRESS: 'In Bearbeitung',
    WAITING: 'Warten auf Rückmeldung',
    CLOSED: 'Geschlossen',
    DONE: 'Geschlossen',
    REJECTED: 'Geschlossen'
  };

  const recipients = new Map();
  if (issue.reporter?.email && issue.reporter.id !== actorId && await settingEnabled('tickets.notifyReporterOnUpdate')) {
    recipients.set(issue.reporter.id, issue.reporter);
  }
  if (await settingEnabled('tickets.notifyAssignees')) {
    for (const user of ticketAssigneeUsers(issue)) {
      if (user?.email && user.id !== actorId) recipients.set(user.id, user);
    }
  }

  for (const [, recipient] of recipients) {
    try {
      const { subject, html, text } = await renderTemplate(templateName, {
        name: recipient.displayName || recipient.username || recipient.email,
        ticketTitle: issue.title,
        ticketId: issue.id,
        status: statusLabels[issue.status] || issue.status,
        resolution: issue.resolution || '',
        orgName,
        ticketUrl: appUrl ? `${appUrl}/issues?id=${issue.id}` : ''
      });
      await enqueue({ to: recipient.email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
    } catch (error) {
      logger.error({ error: error.message, to: recipient.email }, 'notifyTicketUpdated fehlgeschlagen');
    }
  }
}

/**
 * Alle Bearbeiter eines Tickets als flache Liste (Mehrfachzuweisung inklusive
 * Hauptverantwortlichem). Funktioniert mit normalisierten und rohen Tickets.
 */
function ticketAssigneeUsers(issue) {
  const users = new Map();
  const push = (user) => {
    if (user?.id) users.set(user.id, user);
  };
  for (const user of issue?.assignees || []) push(user);
  for (const entry of issue?.assignments || []) push(entry?.user);
  push(issue?.assignee);
  push(issue?.primaryAssignee);
  return [...users.values()];
}

/**
 * Neue Tickets zusätzlich an die zugewiesenen Bearbeiter melden.
 */
async function notifyIssueAssigneesCreated(issue) {
  if (!(await canSendMail())) return;
  if (!(await settingEnabled('tickets.notifyAssignees'))) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();
  const context = devicesLabel(issue.devices?.length ? issue.devices : issue.device ? [issue.device] : [])
    || issue.room?.name
    || issue.softwareName
    || '';
  const typeLabel = { DEVICE: 'Schulgerät', PERSONAL: 'Privat-/Dienstgerät', WLAN: 'WLAN / Netzwerk', SOFTWARE: 'Software' }[issue.type] || 'Ticket';
  const deviceName = context ? `${typeLabel} · ${context}` : typeLabel;

  for (const user of ticketAssigneeUsers(issue)) {
    if (!user?.email || user.id === issue.reporterId) continue;
    try {
      const { subject, html, text } = await renderTemplate('ticketCreated', {
        name: user.displayName || user.username,
        ticketTitle: issue.title,
        ticketId: issue.id,
        deviceName,
        description: issue.description,
        priority: issue.priority || 'NORMAL',
        orgName,
        ticketUrl: appUrl ? `${appUrl}/issues?id=${issue.id}` : ''
      });
      await enqueue({ to: user.email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
    } catch (error) {
      logger.error({ error: error.message, to: user.email }, 'notifyIssueAssigneesCreated fehlgeschlagen');
    }
  }
}

/**
 * Zusätzliche E-Mail-Empfänger aus einer Ticket-Vorlage über ein neues Ticket
 * informieren. Die Empfänger sind reine Mailadressen (keine Systembenutzer).
 */
async function notifyTemplateRecipients(issue, template) {
  if (!(await canSendMail())) return;
  if (!(await settingEnabled('tickets.notifyTemplateRecipients'))) return;
  const recipients = template?.recipients || [];
  if (!recipients.length) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();
  const context = devicesLabel(issue.devices?.length ? issue.devices : issue.device ? [issue.device] : [])
    || issue.room?.name
    || issue.softwareName
    || '';
  const typeLabel = { DEVICE: 'Schulgerät', PERSONAL: 'Privat-/Dienstgerät', WLAN: 'WLAN / Netzwerk', SOFTWARE: 'Software' }[issue.type] || 'Ticket';
  const deviceName = context ? `${typeLabel} · ${context}` : typeLabel;

  for (const entry of recipients) {
    if (!entry?.email) continue;
    try {
      const { subject, html, text } = await renderTemplate('ticketCreated', {
        name: entry.name || entry.email,
        ticketTitle: issue.title,
        ticketId: issue.id,
        deviceName,
        description: issue.description,
        priority: issue.priority || 'NORMAL',
        orgName,
        ticketUrl: appUrl ? `${appUrl}/issues?id=${issue.id}` : ''
      });
      await enqueue({ to: entry.email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
    } catch (error) {
      logger.error({ error: error.message, to: entry.email }, 'notifyTemplateRecipients fehlgeschlagen');
    }
  }
}

/**
 * New comment on ticket — notify reporter and assignee (excluding comment author).
 */
async function notifyTicketComment(issue, comment) {
  if (!(await canSendMail())) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();
  const recipients = new Map();

  // Notify reporter
  if (issue.reporter?.email && issue.reporter.id !== comment.userId && await settingEnabled('tickets.notifyReporterOnComment')) {
    recipients.set(issue.reporter.id, issue.reporter);
  }
  // Alle relevanten Bearbeiter (Mehrfachzuweisung + Hauptverantwortlicher)
  if (await settingEnabled('tickets.notifyAssignees')) {
    for (const user of ticketAssigneeUsers(issue)) {
      if (user?.email && user.id !== comment.userId) recipients.set(user.id, user);
    }
  }

  const commentAuthor = comment.user?.username || 'Unbekannt';

  for (const [, recipient] of recipients) {
    try {
      const { subject, html, text } = await renderTemplate('ticketComment', {
        name: recipient.displayName || recipient.username,
        ticketTitle: issue.title,
        ticketId: issue.id,
        commentAuthor,
        commentText: comment.text,
        orgName,
        ticketUrl: appUrl ? `${appUrl}/issues?id=${issue.id}` : ''
      });
      await enqueue({ to: recipient.email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
    } catch (error) {
      logger.error({ error: error.message, to: recipient.email }, 'notifyTicketComment fehlgeschlagen');
    }
  }
}

/**
 * Loan was just requested — notify Staff/Admin users.
 */
async function notifyLoanRequested(loan) {
  if (!(await canSendMail())) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();
  const staffUsers = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN'] } },
    select: { email: true, username: true, displayName: true }
  });
  if (!staffUsers.length) return;

  // Eine Modellanfrage hat noch kein Gerät – dann steht der Wunsch in der Mail.
  const deviceName = loan.device?.inventoryId || loan.device?.model || loan.requestedModel || 'Unbekannt';
  const borrower = loan.user?.displayName || loan.user?.username || loan.borrowerName || 'Unbekannt';

  for (const staff of staffUsers) {
    if (!staff.email) continue;
    try {
      const { subject, html, text } = await renderTemplate('loanRequested', {
        name: staff.displayName || staff.username,
        deviceName,
        borrower,
        requestReason: loan.requestReason || '',
        orgName,
        loansUrl: appUrl ? `${appUrl}/loans` : ''
      });
      await enqueue({ to: staff.email, subject, html, text, relatedType: 'LOAN', relatedId: loan.id });
    } catch (error) {
      logger.error({ error: error.message, to: staff.email }, 'notifyLoanRequested fehlgeschlagen');
    }
  }
}

/**
 * Loan was approved — notify the borrower.
 */
async function notifyLoanApproved(loan) {
  if (!(await canSendMail())) return;
  if (!loan.user?.email) return;

  const orgName = await getOrgName();
  const deviceName = loan.device?.inventoryId || loan.device?.model || loan.requestedModel || 'Unbekannt';

  try {
    const { subject, html, text } = await renderTemplate('loanApproved', {
      name: loan.user.displayName || loan.user.username || loan.borrowerName,
      deviceName,
      dueDate: loan.dueDate ? new Date(loan.dueDate).toLocaleDateString('de-DE') : 'Unbekannt',
      message: loan.decisionMessage || '',
      orgName
    });
    await enqueue({ to: loan.user.email, subject, html, text, relatedType: 'LOAN', relatedId: loan.id });
  } catch (error) {
    logger.error({ error: error.message }, 'notifyLoanApproved fehlgeschlagen');
  }
}

/**
 * Loan is overdue — notify borrower.
 */
async function notifyLoanOverdue(loan) {
  if (!(await canSendMail())) return;
  if (!loan.user?.email) return;

  const orgName = await getOrgName();
  const deviceName = loan.device?.inventoryId || loan.device?.model || loan.requestedModel || 'Unbekannt';

  try {
    const { subject, html, text } = await renderTemplate('loanOverdue', {
      name: loan.user.displayName || loan.user.username || loan.borrowerName,
      deviceName,
      dueDate: loan.dueDate ? new Date(loan.dueDate).toLocaleDateString('de-DE') : 'Unbekannt',
      orgName
    });
    await enqueue({ to: loan.user.email, subject, html, text, relatedType: 'LOAN', relatedId: loan.id });
  } catch (error) {
    logger.error({ error: error.message }, 'notifyLoanOverdue fehlgeschlagen');
  }
}

/**
 * Loan was created directly (staff) — notify the borrower that the loan has started.
 * Falls der Ausleiher kein Systembenutzer ist, wird dessen E-Mail-Adresse benutzt.
 */
async function notifyLoanStarted(loan) {
  if (!(await canSendMail())) return;
  const email = loan.user?.email || loan.borrowerContact;
  if (!email) return;

  const orgName = await getOrgName();
  const deviceName = loan.device?.inventoryId || loan.device?.model || loan.requestedModel || 'Unbekannt';

  try {
    const { subject, html, text } = await renderTemplate('loanStarted', {
      name: loan.user?.displayName || loan.user?.username || loan.borrowerName || 'Unbekannt',
      deviceName,
      dueDate: loan.dueDate ? new Date(loan.dueDate).toLocaleDateString('de-DE') : 'Unbekannt',
      message: loan.notes || loan.decisionMessage || '',
      orgName
    });
    await enqueue({ to: email, subject, html, text, relatedType: 'LOAN', relatedId: loan.id });
  } catch (error) {
    logger.error({ error: error.message }, 'notifyLoanStarted fehlgeschlagen');
  }
}

/**
 * Loan was returned — notify the borrower as confirmation.
 */
async function notifyLoanReturned(loan) {
  if (!(await canSendMail())) return;
  const email = loan.user?.email || loan.borrowerContact;
  if (!email) return;

  const orgName = await getOrgName();
  const deviceName = loan.device?.inventoryId || loan.device?.model || loan.requestedModel || 'Unbekannt';

  try {
    const { subject, html, text } = await renderTemplate('loanReturned', {
      name: loan.user?.displayName || loan.user?.username || loan.borrowerName || 'Unbekannt',
      deviceName,
      orgName
    });
    await enqueue({ to: email, subject, html, text, relatedType: 'LOAN', relatedId: loan.id });
  } catch (error) {
    logger.error({ error: error.message }, 'notifyLoanReturned fehlgeschlagen');
  }
}

/**
 * Loan due soon — notify borrower, once per day per active loan.
 */
async function notifyLoanDueSoon() {
  if (!(await canSendMail())) return;

  const orgName = await getOrgName();

  // Mindestens 24 Stunden zwischen zwei Erinnerungsläufen, damit nicht bei jedem
  // 5-Minuten-Check erneut gemahnt wird.
  try {
    const lastRunSetting = await prisma.setting.findUnique({ where: { key: 'loan.upcomingReminder.lastRun' } });
    const lastRun = lastRunSetting?.value ? new Date(lastRunSetting.value) : null;
    if (lastRun && (Date.now() - lastRun.getTime()) < 24 * 60 * 60 * 1000) return;
  } catch {
    // Falls das Setting nicht lesbar ist, trotzdem versuchen.
  }
  const now = new Date();

  // Alle aktiven, nicht überfälligen Ausleihen, deren Frist morgen erreicht wird.
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);

  const dueLoans = await prisma.loan.findMany({
    where: {
      status: 'ACTIVE',
      returnDate: null,
      archivedAt: null,
      dueDate: { gte: tomorrowStart, lte: tomorrowEnd }
    },
    include: { device: true, user: true }
  });

  let sent = 0;
  for (const loan of dueLoans) {
    const email = loan.user?.email || loan.borrowerContact;
    if (!email) continue;
  const deviceName = loan.device?.inventoryId || loan.device?.model || loan.requestedModel || 'Unbekannt';
    try {
      const { subject, html, text } = await renderTemplate('loanDueSoon', {
        name: loan.user?.displayName || loan.user?.username || loan.borrowerName || 'Unbekannt',
        deviceName,
        dueDate: loan.dueDate ? new Date(loan.dueDate).toLocaleDateString('de-DE') : 'Unbekannt',
        orgName
      });
      await enqueue({ to: email, subject, html, text, relatedType: 'LOAN_REMINDER', relatedId: loan.id });
      sent++;
    } catch (error) {
      logger.error({ error: error.message, loanId: loan.id }, 'notifyLoanDueSoon fehlgeschlagen');
    }
  }

  await prisma.setting.upsert({
    where: { key: 'loan.upcomingReminder.lastRun' },
    update: { value: new Date().toISOString() },
    create: { key: 'loan.upcomingReminder.lastRun', value: new Date().toISOString() }
  }).catch((error) => logger.warn({ error: error.message }, 'Reminder-Zeitpunkt konnte nicht gespeichert werden'));

  logger.info({ count: sent }, 'Upcoming-Loan-Erinnerungen versendet');
  return { count: sent };
}

/**
 * User was created — send welcome mail.
 */
async function notifyUserCreated(user, password) {
  if (!(await canSendMail())) return;
  if (!user.email) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();

  try {
    const { subject, html, text } = await renderTemplate('userCreated', {
      name: user.username,
      username: user.username,
      password: password || null,
      orgName,
      loginUrl: appUrl ? `${appUrl}/login` : ''
    });
    await enqueue({ to: user.email, subject, html, text, relatedType: 'USER', relatedId: user.id });
  } catch (error) {
    logger.error({ error: error.message }, 'notifyUserCreated fehlgeschlagen');
  }
}

/**
 * Automatische Antwort auf eine neue eingehende E-Mail (Support-Postfach/IMAP).
 * Bedankt sich für die Anfrage und verweist auf das Inventar-System.
 * Guard gegen Mail-Schleifen: eigene Adressen und typische System-Absender
 * (no-reply, Mailer-Daemon …) lösen keine Antwort aus.
 */
async function notifyInboundAutoReply({ fromAddr, fromName }) {
  const from = (fromAddr || '').trim().toLowerCase();
  if (!from) return;

  const settings = await getMailSettings();
  if (!isConfigured(settings)) return;
  if ((await getSettingCached('mail.inboundAutoReply')) === 'false') return;

  // Eigene Adressen und System-Absender ausschließen, um Endlosschleifen zu vermeiden.
  const ownAddresses = [
    settings['mail.smtp.from'],
    settings['mail.imap.user'],
    process.env.SMTP_FROM,
    process.env.IMAP_USER
  ].filter(Boolean).map((value) => value.toLowerCase());
  if (ownAddresses.includes(from)) return;
  if (/(noreply|no-?reply|postmaster|mailer-daemon|bounce|automaton)/i.test(from)) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();
  const name = (fromName || '').trim();

  try {
    const { subject, html, text } = await renderTemplate('inboundAutoReply', {
      name,
      orgName,
      loginUrl: appUrl ? `${appUrl}/login` : ''
    });
    await enqueue({ to: fromAddr.trim(), subject, html, text, relatedType: 'AUTO_REPLY', relatedId: null });
    logger.info({ to: fromAddr }, 'Automatische Antwort versendet');
  } catch (error) {
    logger.error({ error: error.message, to: fromAddr }, 'Automatische Antwort fehlgeschlagen');
  }
}

module.exports = {
  notifyTicketCreated,
  notifyAreaIssueCreated,
  notifyIssueTypeCreated,
  notifyTicketUpdated,
  notifyIssueAssigneesCreated,
  notifyTemplateRecipients,
  notifyTicketComment,
  notifyLoanRequested,
  notifyLoanApproved,
  notifyLoanOverdue,
  notifyLoanStarted,
  notifyLoanReturned,
  notifyLoanDueSoon,
  notifyUserCreated,
  notifyInboundAutoReply
};
