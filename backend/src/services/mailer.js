const nodemailer = require('nodemailer');
const prisma = require('../config/prisma');
const logger = require('../config/logger');

let _transporter = null;
let _settings = null;

async function getMailSettings() {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: 'mail.' } }
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

function getDkimOptions(settings) {
  const dkimDomain = settings['mail.dkim.domain'] || process.env.DKIM_DOMAIN;
  const dkimKey = settings['mail.dkim.privateKey'] || process.env.DKIM_PRIVATE_KEY;
  const dkimSelector = settings['mail.dkim.selector'] || process.env.DKIM_SELECTOR || 'default';
  if (!dkimDomain || !dkimKey) return undefined;
  return {
    domain: dkimDomain,
    privateKey: dkimKey.replace(/\\n/g, '\n'),
    selector: dkimSelector
  };
}

function isConfigured(settings) {
  const host = settings['mail.smtp.host'] || process.env.SMTP_HOST;
  const port = settings['mail.smtp.port'] || process.env.SMTP_PORT;
  return !!(host && port);
}

async function getTransporter(forceRefresh = false) {
  if (_transporter && !forceRefresh) return _transporter;

  const settings = await getMailSettings();
  _settings = settings;

  const host = settings['mail.smtp.host'] || process.env.SMTP_HOST;
  const port = Number(settings['mail.smtp.port'] || process.env.SMTP_PORT || 587);
  const user = settings['mail.smtp.user'] || process.env.SMTP_USER;
  const pass = settings['mail.smtp.pass'] || process.env.SMTP_PASS;
  const secure = (settings['mail.smtp.secure'] || '').toLowerCase() === 'true' || port === 465;

  if (!host) return null;

  const dkim = getDkimOptions(settings);

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    tls: { rejectUnauthorized: false },
    dkim
  });

  return _transporter;
}

async function getFromAddress() {
  const settings = _settings || await getMailSettings();
  return settings['mail.smtp.from'] || process.env.SMTP_FROM || 'noreply@mz-inventory.local';
}

async function sendMail({ to, subject, html, text }) {
  const transporter = await getTransporter();
  if (!transporter) {
    throw new Error('SMTP ist nicht konfiguriert');
  }

  const from = await getFromAddress();

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text
  });

  logger.info({ messageId: info.messageId, to, subject }, 'E-Mail gesendet');
  return info;
}

async function verifyConnection() {
  try {
    const transporter = await getTransporter(true);
    if (!transporter) return { ok: false, error: 'SMTP ist nicht konfiguriert' };
    await transporter.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function resetTransporter() {
  _transporter = null;
  _settings = null;
}

module.exports = { sendMail, verifyConnection, isConfigured, getMailSettings, getFromAddress, resetTransporter };
