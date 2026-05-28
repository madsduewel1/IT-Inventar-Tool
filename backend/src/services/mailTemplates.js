const Handlebars = require('handlebars');
const { convert } = require('html-to-text');

// ── Base HTML Layout ──────────────────────────────────────────
const baseLayout = Handlebars.compile(`<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  .wrapper { max-width:600px; margin:0 auto; padding:24px 16px; }
  .card { background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  .header { background:#18181b; color:#ffffff; padding:24px 28px; }
  .header h1 { margin:0; font-size:18px; font-weight:700; }
  .header .org { font-size:12px; color:#a1a1aa; margin-top:4px; }
  .body { padding:28px; color:#27272a; font-size:14px; line-height:1.7; }
  .body h2 { font-size:16px; margin:0 0 12px; color:#18181b; }
  .body p { margin:0 0 12px; }
  .info-box { background:#f4f4f5; border-radius:10px; padding:16px; margin:16px 0; font-size:13px; }
  .info-box .label { color:#71717a; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px; }
  .info-box .value { color:#18181b; font-weight:600; }
  .btn { display:inline-block; background:#18181b; color:#ffffff; padding:10px 20px; border-radius:10px; text-decoration:none; font-weight:600; font-size:13px; margin-top:8px; }
  .footer { padding:20px 28px; text-align:center; font-size:11px; color:#a1a1aa; border-top:1px solid #f4f4f5; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <h1>{{title}}</h1>
      <div class="org">{{orgName}}</div>
    </div>
    <div class="body">{{{content}}}</div>
    <div class="footer">Diese E-Mail wurde automatisch von {{orgName}} versendet.</div>
  </div>
</div>
</body>
</html>`);

// ── Individual Templates ──────────────────────────────────────

const templates = {
  ticketCreated: {
    subject: 'Neues Ticket: {{ticketTitle}}',
    body: `<h2>Neues Ticket erstellt</h2>
<p>Hallo {{name}},</p>
<p>ein neues Ticket wurde im System erfasst.</p>
<div class="info-box">
  <div class="label">Ticket</div>
  <div class="value">{{ticketTitle}}</div>
</div>
<div class="info-box">
  <div class="label">Gerät</div>
  <div class="value">{{deviceName}}</div>
</div>
<div class="info-box">
  <div class="label">Priorität</div>
  <div class="value">{{priority}}</div>
</div>
<p>{{description}}</p>
{{#if ticketUrl}}<a class="btn" href="{{ticketUrl}}">Ticket ansehen</a>{{/if}}`
  },

  ticketUpdated: {
    subject: '[TICKET-{{ticketId}}] Status geändert: {{status}}',
    body: `<h2>Ticket aktualisiert</h2>
<p>Hallo {{name}},</p>
<p>der Status deines Tickets wurde geändert.</p>
<div class="info-box">
  <div class="label">Ticket</div>
  <div class="value">{{ticketTitle}}</div>
</div>
<div class="info-box">
  <div class="label">Neuer Status</div>
  <div class="value">{{status}}</div>
</div>
{{#if resolution}}<div class="info-box">
  <div class="label">Lösung</div>
  <div class="value">{{resolution}}</div>
</div>{{/if}}
{{#if ticketUrl}}<a class="btn" href="{{ticketUrl}}">Ticket ansehen</a>{{/if}}`
  },

  ticketComment: {
    subject: '[TICKET-{{ticketId}}] Neuer Kommentar',
    body: `<h2>Neuer Kommentar</h2>
<p>Hallo {{name}},</p>
<p><strong>{{commentAuthor}}</strong> hat einen Kommentar zu deinem Ticket geschrieben:</p>
<div class="info-box">
  <div class="label">Ticket</div>
  <div class="value">{{ticketTitle}}</div>
</div>
<div class="info-box">
  <div class="label">Kommentar</div>
  <div class="value">{{commentText}}</div>
</div>
{{#if ticketUrl}}<a class="btn" href="{{ticketUrl}}">Ticket ansehen</a>{{/if}}`
  },

  ticketClosed: {
    subject: '[TICKET-{{ticketId}}] Geschlossen: {{ticketTitle}}',
    body: `<h2>Ticket geschlossen</h2>
<p>Hallo {{name}},</p>
<p>dein Ticket wurde geschlossen.</p>
<div class="info-box">
  <div class="label">Ticket</div>
  <div class="value">{{ticketTitle}}</div>
</div>
{{#if resolution}}<div class="info-box">
  <div class="label">Lösung</div>
  <div class="value">{{resolution}}</div>
</div>{{/if}}
{{#if ticketUrl}}<a class="btn" href="{{ticketUrl}}">Ticket ansehen</a>{{/if}}`
  },

  loanApproved: {
    subject: 'Ausleihe genehmigt: {{deviceName}}',
    body: `<h2>Ausleihe genehmigt</h2>
<p>Hallo {{name}},</p>
<p>deine Ausleihe wurde genehmigt.</p>
<div class="info-box">
  <div class="label">Gerät</div>
  <div class="value">{{deviceName}}</div>
</div>
<div class="info-box">
  <div class="label">Rückgabe bis</div>
  <div class="value">{{dueDate}}</div>
</div>
{{#if message}}<div class="info-box">
  <div class="label">Nachricht</div>
  <div class="value">{{message}}</div>
</div>{{/if}}`
  },

  loanOverdue: {
    subject: 'Überfällige Ausleihe: {{deviceName}}',
    body: `<h2>Ausleihe überfällig</h2>
<p>Hallo {{name}},</p>
<p>die Rückgabe für folgendes Gerät ist überfällig. Bitte gib das Gerät so schnell wie möglich zurück.</p>
<div class="info-box">
  <div class="label">Gerät</div>
  <div class="value">{{deviceName}}</div>
</div>
<div class="info-box">
  <div class="label">Rückgabe war fällig am</div>
  <div class="value">{{dueDate}}</div>
</div>`
  },

  userCreated: {
    subject: 'Willkommen bei {{orgName}}',
    body: `<h2>Dein Account wurde erstellt</h2>
<p>Hallo {{name}},</p>
<p>für dich wurde ein Account im Inventarsystem angelegt.</p>
<div class="info-box">
  <div class="label">Benutzername</div>
  <div class="value">{{username}}</div>
</div>
{{#if password}}<div class="info-box">
  <div class="label">Temporäres Passwort</div>
  <div class="value">{{password}}</div>
</div>
<p>Bitte ändere dein Passwort nach dem ersten Login.</p>{{/if}}
{{#if loginUrl}}<a class="btn" href="{{loginUrl}}">Jetzt anmelden</a>{{/if}}`
  },

  testMail: {
    subject: 'Test-Mail von {{orgName}}',
    body: `<h2>SMTP-Test erfolgreich</h2>
<p>Diese Test-Mail bestätigt, dass die SMTP-Konfiguration korrekt funktioniert.</p>
<div class="info-box">
  <div class="label">Server</div>
  <div class="value">{{smtpHost}}</div>
</div>
<div class="info-box">
  <div class="label">Zeitpunkt</div>
  <div class="value">{{timestamp}}</div>
</div>`
  }
};

// ── Compile & Render ──────────────────────────────────────────

// Pre-compile all templates
const compiled = {};
for (const [name, tpl] of Object.entries(templates)) {
  compiled[name] = {
    subject: Handlebars.compile(tpl.subject),
    body: Handlebars.compile(tpl.body)
  };
}

/**
 * Render a mail template.
 * @param {string} templateName - Name of the template
 * @param {object} data - Template variables (name, ticketTitle, orgName, etc.)
 * @returns {{ subject: string, html: string, text: string }}
 */
function renderTemplate(templateName, data = {}) {
  const tpl = compiled[templateName];
  if (!tpl) throw new Error(`Mail-Template "${templateName}" nicht gefunden`);

  const vars = { orgName: 'MZ-Inventory', ...data };
  const subject = tpl.subject(vars);
  const content = tpl.body(vars);
  const html = baseLayout({ title: subject, orgName: vars.orgName, content });
  const text = convert(html, { wordwrap: 80 });

  return { subject, html, text };
}

function getTemplateNames() {
  return Object.keys(templates);
}

module.exports = { renderTemplate, getTemplateNames };
