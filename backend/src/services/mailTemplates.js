const Handlebars = require('handlebars');
const { getSettingCached } = require('./settingsCache');

// ── Individual Templates (Klartext) ────────────────────────────
// E-Mails werden bewusst als reiner Text versendet (mit Links als normalem
// Text). HTML-Templates sind nicht mehr vorgesehen.
const templates = {
  ticketCreated: {
    subject: 'Neues Ticket: {{ticketTitle}}',
    body: `Hallo {{name}},

ein neues Ticket wurde im System erfasst.

Ticket:        {{ticketTitle}}
Bezug:         {{deviceName}}
Priorität:     {{priority}}

{{description}}
{{#if ticketUrl}}
Ticket ansehen: {{ticketUrl}}
{{/if}}`
  },

  // Bereichs-Benachrichtigung (Konzept Abschnitt 10): Mitglieder eines Bereichs
  // erfahren von neuen Meldungen zu Geräten ihres Bereichs.
  areaIssueCreated: {
    subject: '[{{areaName}}] Neue Meldung: {{ticketTitle}}',
    body: `Hallo {{name}},

für den Bereich {{areaName}} wurde eine neue Meldung erstellt.

Bereich:       {{areaName}}
Gerät:         {{deviceName}}{{#if inventoryId}} · {{inventoryId}}{{/if}}
Melder:        {{reporterName}}
Priorität:     {{priority}}
Gemeldet am:   {{reportedAt}}

{{ticketTitle}}
{{description}}
{{#if ticketUrl}}
Ticket ansehen: {{ticketUrl}}
{{/if}}`
  },

  // Benachrichtigung zu einer Ticketart (Netzwerk/Dienstgerät/Software):
  // hinterlegte Empfänger erfahren von neuen Meldungen der Ticketart.
  issueTypeCreated: {
    subject: '[{{typeLabel}}] Neue Meldung: {{ticketTitle}}',
    body: `Hallo {{name}},

für die Ticketart {{typeLabel}} wurde eine neue Meldung erstellt.

Ticketart:     {{typeLabel}}
Melder:        {{reporterName}}
Priorität:     {{priority}}
Gemeldet am:   {{reportedAt}}

{{ticketTitle}}
{{description}}
{{#if ticketUrl}}
Ticket ansehen: {{ticketUrl}}
{{/if}}`
  },

  ticketUpdated: {
    subject: '[TICKET-{{ticketId}}] Status geändert: {{status}}',
    body: `Hallo {{name}},

der Status deines Tickets wurde geändert.

Ticket:        {{ticketTitle}}
Neuer Status:  {{status}}
{{#if resolution}}
Lösung:        {{resolution}}
{{/if}}
{{#if ticketUrl}}
Ticket ansehen: {{ticketUrl}}
{{/if}}`
  },

  ticketComment: {
    subject: '[TICKET-{{ticketId}}] Neuer Kommentar',
    body: `Hallo {{name}},

{{commentAuthor}} hat einen Kommentar zu deinem Ticket geschrieben:

Ticket:        {{ticketTitle}}
Kommentar:     {{commentText}}
{{#if ticketUrl}}
Ticket ansehen: {{ticketUrl}}
{{/if}}`
  },

  ticketClosed: {
    subject: '[TICKET-{{ticketId}}] Geschlossen: {{ticketTitle}}',
    body: `Hallo {{name}},

dein Ticket wurde geschlossen.

Ticket:        {{ticketTitle}}
{{#if resolution}}
Lösung:        {{resolution}}
{{/if}}
{{#if ticketUrl}}
Ticket ansehen: {{ticketUrl}}
{{/if}}`
  },

  loanRequested: {
    subject: 'Neue Ausleihanfrage: {{deviceName}}',
    body: `Hallo {{name}},

es wurde eine neue Ausleihanfrage für folgendes Gerät eingereicht.

Gerät:         {{deviceName}}
Angefragt von: {{borrower}}
{{#if requestReason}}
Grund:         {{requestReason}}
{{/if}}
{{#if loansUrl}}
Ausleihen verwalten: {{loansUrl}}
{{/if}}`
  },

  loanApproved: {
    subject: 'Ausleihe gestartet: {{deviceName}}',
    body: `Hallo {{name}},

deine Ausleihe wurde genehmigt und ist nun aktiv.

Gerät:         {{deviceName}}
Rückgabe bis:  {{dueDate}}
{{#if message}}
Nachricht:     {{message}}
{{/if}}`
  },

  loanStarted: {
    subject: 'Ausleihe gestartet: {{deviceName}}',
    body: `Hallo {{name}},

folgendes Gerät wurde für dich in Ausleihe gegeben.

Gerät:         {{deviceName}}
Rückgabe bis:  {{dueDate}}
{{#if message}}
Hinweis:       {{message}}
{{/if}}`
  },

  loanDueSoon: {
    subject: 'Rückgabe erinnern: {{deviceName}}',
    body: `Hallo {{name}},

die Rückgabefrist für folgendes Gerät endet morgen. Bitte gib das Gerät rechtzeitig zurück.

Gerät:                  {{deviceName}}
Rückgabe fällig am:     {{dueDate}}`
  },

  loanReturned: {
    subject: 'Ausleihe abgeschlossen: {{deviceName}}',
    body: `Hallo {{name}},

du hast folgendes Gerät erfolgreich zurückgegeben. Vielen Dank!

Gerät:         {{deviceName}}`
  },

  loanOverdue: {
    subject: 'Überfällige Ausleihe: {{deviceName}}',
    body: `Hallo {{name}},

die Rückgabe für folgendes Gerät ist überfällig. Bitte gib das Gerät so schnell wie möglich zurück.

Gerät:                  {{deviceName}}
Rückgabe war fällig am: {{dueDate}}`
  },

  userCreated: {
    subject: 'Willkommen bei {{orgName}}',
    body: `Hallo {{name}},

für dich wurde ein Account im Inventarsystem angelegt.

Benutzername:  {{username}}
{{#if password}}
Temporäres Passwort: {{password}}

Bitte ändere dein Passwort nach dem ersten Login.
{{/if}}
{{#if loginUrl}}
Jetzt anmelden: {{loginUrl}}
{{/if}}`
  },

  testMail: {
    subject: 'Test-Mail von {{orgName}}',
    body: `Diese Test-Mail bestätigt, dass die SMTP-Konfiguration korrekt funktioniert.

Server:        {{smtpHost}}
Zeitpunkt:     {{timestamp}}`
  },

  // Automatische Antwort auf eingehende E-Mails im Support-Postfach (IMAP).
  // Wird für jede neue Anfrage versendet, bevor die Mail manuell freigegeben wird.
  inboundAutoReply: {
    subject: 'Ihre Anfrage ist bei uns eingegangen',
    body: `Guten Tag{{#if name}} {{name}}{{/if}},

vielen Dank für Ihre Anfrage an den Support der {{orgName}}.

Wir haben Ihre E-Mail erhalten und kümmern uns darum. Um zu gewährleisten, dass
alles reibungslos klappt, melden Sie sich bitte einmal im Inventar-System unter
folgender Adresse an:

{{loginUrl}}

Falls Sie mit dieser E-Mail kein Ticket erzeugen wollten, können Sie diese
Nachricht einfach ignorieren.`
  }
};

// ── Compile & Render ──────────────────────────────────────────

// Pre-compile all templates. `noEscape` ist hier wichtig: Wir versenden reine
// Klartext-Mails, daher dürfen URLs und Inhalte nicht HTML-escaped werden
// (sonst würden z. B. `&` zu `&amp;` oder `=` zu `&#x3D;`).
const compiled = {};
for (const [name, tpl] of Object.entries(templates)) {
  compiled[name] = {
    subject: Handlebars.compile(tpl.subject, { noEscape: true }),
    body: Handlebars.compile(tpl.body, { noEscape: true })
  };
}

/**
 * Render a mail template as plain text.
 * @param {string} templateName - Name of the template
 * @param {object} data - Template variables (name, ticketTitle, orgName, etc.)
 * @returns {{ subject: string, html: string, text: string }}
 * `html` bleibt bewusst leer – versendet wird nur der Klartext.
 */
async function renderTemplate(templateName, data = {}) {
  const tpl = compiled[templateName];
  if (!tpl) throw new Error(`Mail-Template "${templateName}" nicht gefunden`);

  const vars = { orgName: 'Inventar-Tool', ...data };
  const subject = tpl.subject(vars).replace(/[\r\n]+/g, ' ').trim();
  const body = tpl.body(vars).replace(/[ \t]+$/gm, '').trim();
  const signature = ((await getSettingCached('mail.signature')) || '').replace(/[ \t]+$/gm, '').trim();

  const footer = [
    '--',
    'Diese E-Mail wurde automatisch verschickt.',
    signature
  ].filter(Boolean).join('\n');
  const text = `${body}\n\n${footer}\n`;

  return { subject, html: '', text };
}

function getTemplateNames() {
  return Object.keys(templates);
}

module.exports = { renderTemplate, getTemplateNames };