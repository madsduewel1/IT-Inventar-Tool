const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { enqueue } = require('./mailQueue');
const { renderTemplate } = require('./mailTemplates');
const { isConfigured, getMailSettings } = require('./mailer');

/**
 * Internal helper: get org name from settings for template context.
 */
async function getOrgName() {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'org.name' } });
    return row?.value || 'MZ-Inventory';
  } catch {
    return 'MZ-Inventory';
  }
}

async function getAppUrl() {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'app.url' } });
    return row?.value || '';
  } catch {
    return '';
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
 * Ticket was created — notify Staff/Admin users.
 */
async function notifyTicketCreated(issue) {
  if (!(await canSendMail())) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();
  const staffUsers = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN'] } },
    select: { email: true, username: true }
  });

  const deviceName = issue.device?.model || issue.device?.inventoryId || 'Unbekannt';

  for (const staff of staffUsers) {
    if (!staff.email) continue;
    try {
      const { subject, html, text } = renderTemplate('ticketCreated', {
        name: staff.username,
        ticketTitle: issue.title,
        ticketId: issue.id,
        deviceName,
        description: issue.description,
        priority: issue.priority || 'NORMAL',
        orgName,
        ticketUrl: appUrl ? `${appUrl}/issues/${issue.id}` : ''
      });
      await enqueue({ to: staff.email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
    } catch (error) {
      logger.error({ error: error.message, to: staff.email }, 'notifyTicketCreated fehlgeschlagen');
    }
  }
}

/**
 * Ticket was updated — notify the reporter.
 */
async function notifyTicketUpdated(issue) {
  if (!(await canSendMail())) return;
  if (!issue.reporter?.email) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();

  const isClosed = ['DONE', 'REJECTED'].includes(issue.status);
  const templateName = isClosed ? 'ticketClosed' : 'ticketUpdated';

  try {
    const { subject, html, text } = renderTemplate(templateName, {
      name: issue.reporter.username,
      ticketTitle: issue.title,
      ticketId: issue.id,
      status: issue.status,
      resolution: issue.resolution || '',
      orgName,
      ticketUrl: appUrl ? `${appUrl}/issues/${issue.id}` : ''
    });
    await enqueue({ to: issue.reporter.email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
  } catch (error) {
    logger.error({ error: error.message }, 'notifyTicketUpdated fehlgeschlagen');
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
  if (issue.reporter?.email && issue.reporter.id !== comment.userId) {
    recipients.set(issue.reporter.id, issue.reporter);
  }
  // Notify assignee
  if (issue.assignee?.email && issue.assignee.id !== comment.userId) {
    recipients.set(issue.assignee.id, issue.assignee);
  }

  const commentAuthor = comment.user?.username || 'Unbekannt';

  for (const [, recipient] of recipients) {
    try {
      const { subject, html, text } = renderTemplate('ticketComment', {
        name: recipient.username,
        ticketTitle: issue.title,
        ticketId: issue.id,
        commentAuthor,
        commentText: comment.text,
        orgName,
        ticketUrl: appUrl ? `${appUrl}/issues/${issue.id}` : ''
      });
      await enqueue({ to: recipient.email, subject, html, text, relatedType: 'TICKET', relatedId: issue.id });
    } catch (error) {
      logger.error({ error: error.message, to: recipient.email }, 'notifyTicketComment fehlgeschlagen');
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
  const deviceName = loan.device?.model || loan.device?.inventoryId || 'Unbekannt';

  try {
    const { subject, html, text } = renderTemplate('loanApproved', {
      name: loan.user.username || loan.borrowerName,
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
  const deviceName = loan.device?.model || loan.device?.inventoryId || 'Unbekannt';

  try {
    const { subject, html, text } = renderTemplate('loanOverdue', {
      name: loan.user.username || loan.borrowerName,
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
 * User was created — send welcome mail.
 */
async function notifyUserCreated(user, password) {
  if (!(await canSendMail())) return;
  if (!user.email) return;

  const orgName = await getOrgName();
  const appUrl = await getAppUrl();

  try {
    const { subject, html, text } = renderTemplate('userCreated', {
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

module.exports = {
  notifyTicketCreated,
  notifyTicketUpdated,
  notifyTicketComment,
  notifyLoanApproved,
  notifyLoanOverdue,
  notifyUserCreated
};
