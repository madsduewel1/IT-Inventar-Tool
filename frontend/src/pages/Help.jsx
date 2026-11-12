import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BookOpen, CircleHelp, ClipboardCheck, Cpu, DoorOpen, LifeBuoy,
  ScanLine, ShieldCheck, Tag, Printer, MessageSquareWarning, ArrowLeftRight, Wrench
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

// Aufgaben statt Modulbeschreibungen: Die Hilfe beantwortet zuerst die Frage
// „Wie kann ich was machen?“ und verlinkt direkt auf die passende Stelle.
const tasks = [
  {
    id: 'find-device',
    icon: Cpu,
    title: 'Ein bestimmtes Gerät finden',
    goal: 'Du suchst ein Gerät nach Inventarnummer, Modell, Hersteller oder Seriennummer.',
    to: '/devices',
    steps: [
      'Im Feld „Inventarnummer, Modell oder Seriennummer“ einen Suchbegriff eingeben.',
      'Mit „Status“ und „Raum“ weiter eingrenzen, z. B. nur verliehene Geräte.',
      'Auf „Öffnen“ klicken, um alle Daten, Etikett und Historie zu sehen.'
    ]
  },
  {
    id: 'print-label',
    icon: Printer,
    title: 'Ein Etikett drucken',
    goal: 'Du brauchst ein neues Etikett mit Logo, Strichcode und QR-Code.',
    to: '/devices',
    steps: [
      'Das gewünschte Gerät öffnen oder in der Liste die Kästchen der Geräte anhaken.',
      'Über „Etikett drucken“ (Einzelgerät) bzw. „Druckansicht“ (Auswahl) öffnen.',
      'Im Druckdialog „Hintergrundgrafiken“ aktivieren, damit Logo und Code wirklich erscheinen.'
    ]
  },
  {
    id: 'scan-label',
    icon: ScanLine,
    title: 'Ein Etikett scannen',
    goal: 'Du willst ein Gerät direkt öffnen, ohne es in der Liste zu suchen.',
    to: '/devices',
    steps: [
      'Auf der Geräteseite „Label scannen“ klicken.',
      'Barcode: Gerät mit dem angeschlossenen Scanner einlesen – das Gerät öffnet sich von allein.',
      'QR-Code: Kamera nutzen oder „Foto vom Etikett“ wählen. Der Foto-Weg funktioniert immer, auch ohne Kamera.'
    ]
  },
  {
    id: 'request-loan',
    icon: ArrowLeftRight,
    title: 'Etwas ausleihen',
    goal: 'Du brauchst ein Gerät für einen bestimmten Zeitraum.',
    to: '/loans/request',
    steps: [
      'Ausleihe beantragen und das Gerät auswählen.',
      'Rückgabedatum festlegen und Kontakt- bzw. Gruppennummer ergänzen.',
      'Die IT entscheidet über die Anfrage; du siehst den Status jederzeit unter „Meine Ausleihen“.'
    ]
  },
  {
    id: 'loan-back',
    icon: DoorOpen,
    title: 'Ausleihe zurückgeben oder verlängern',
    goal: 'Du hast ein Gerät zurück oder brauchst länger.',
    to: '/loans/my',
    steps: [
      'Unter „Meine Ausleihen“ die aktive Ausleihe öffnen.',
      'Rückgabe bestätigen oder ein neues Rückgabedatum anfordern.',
      'Die Ausleihbescheinigung im Detail über „Bescheinigung drucken“ ausgeben.'
    ]
  },
  {
    id: 'report-issue',
    icon: MessageSquareWarning,
    title: 'Einen Fehler melden',
    goal: 'Ein Gerät funktioniert nicht oder etwas stört.',
    to: '/issues/new',
    steps: [
      'Fehler melden öffnen und das betroffene Gerät auswählen.',
      'Kurz beschreiben, was passiert – je konkreter, desto schneller die Hilfe.',
      'Fotos anhängen, falls vorhanden; das Ticket öffnet sich danach automatisch.'
    ]
  },
  {
    id: 'follow-ticket',
    icon: Wrench,
    title: 'Mein Ticket verfolgen',
    goal: 'Du willst wissen, was die IT gerade macht.',
    to: '/issues',
    steps: [
      'Unter „Tickets“ deine Meldung öffnen – der Status steht oben.',
      'Rückfragen und Antworten stehen im Chat direkt unter „Verlauf & Chat“.',
      'Die Seite aktualisiert sich selbst; ein Neuladen ist nicht nötig.'
    ]
  },
  {
    id: 'updates',
    icon: ClipboardCheck,
    title: 'Geräte-Updates dokumentieren',
    goal: 'Ein Update-Lauf soll festgehalten werden.',
    to: '/updates',
    steps: [
      'Neuen Update-Lauf anlegen und Raum sowie betroffene Geräte wählen.',
      'Nach dem Lauf jedes Gerät auf „Erfolgreich“ oder „Fehlgeschlagen“ setzen.',
      'Bei „Fehlgeschlagen“ die Problembeschreibung im Dialog hinterlegen.'
    ]
  }
];

// Der kurze Kontext-Hinweis erscheint oben, wenn die Hilfe aus einem Modul
// heraus geöffnet wurde.
const moduleHints = [
  { match: (path) => path.startsWith('/devices'), title: 'Geräte', text: 'Inventar, Status, Räume, Etiketten und Gerätedetails.' },
  { match: (path) => path.startsWith('/loans'), title: 'Ausleihe', text: 'Anträge, laufende Ausleihen, Rückgaben und Bescheinigungen.' },
  { match: (path) => path.startsWith('/issues'), title: 'Tickets', text: 'Fehlermeldungen, Status und Chat mit der IT.' },
  { match: (path) => path.startsWith('/updates'), title: 'Geräte-Updates', text: 'Update-Läufe und deren Ergebnisse.' },
  { match: (path) => path.startsWith('/rooms'), title: 'Räume', text: 'Standorte der Geräte.' },
  { match: (path) => path === '/login', title: 'Anmeldung', text: 'Mit Benutzerkonto oder Single-Sign-on anmelden.' },
  { match: () => true, title: 'Startseite', text: 'Kennzahlen, deine Ausleihen und deine offenen Tickets.' }
];

const adminTasks = [
  { to: '/admin/users', title: 'Benutzer anlegen und Rollen setzen', text: 'Konten anlegen, Rolle zuweisen, sperren oder löschen.' },
  { to: '/admin/roles', title: 'Rechte und Rollen', text: 'Festlegen, wer welche Aktionen in welchem Modul ausführen darf.' },
  { to: '/admin/settings', title: 'Organisation und Branding', text: 'Name, Logo, Favicon und Grundeinstellungen pflegen.' },
  { to: '/admin/settings/system', title: 'Systemübersicht', text: 'Version, Datenbank-, Arbeitsspeicher- und Festplattenstatus.' },
  { to: '/admin/settings/sso', title: 'Single-Sign-on', text: 'SSO-Anbieter einrichten und testen.' },
  { to: '/admin/logs', title: 'Logs und Diagnose', text: 'Fehler in Backend- und Mail-Protokollen suchen.' },
  { to: '/email-support', title: 'E-Mail-Support', text: 'Eingehende Mails beantworten oder in Tickets umwandeln.' }
];

export default function Help() {
  const location = useLocation();
  const { user } = useAuth();
  const from = location.state?.from || '/dashboard';
  const hint = useMemo(() => moduleHints.find((item) => item.match(from)) || moduleHints[moduleHints.length - 1], [from]);
  const isStaff = ['STAFF', 'ADMIN'].includes(user?.effectiveRole || user?.role)
    || (user?.effectivePermissions || []).includes('ADMIN');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to={from} className="btn-secondary" title="Zurück zum Modul">
          <ArrowLeft size={16} />
          Zurück
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-main">Wie kann ich was machen?</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
            <CircleHelp size={14} />
            Wähle dein Vorhaben – du landest direkt im passenden Bereich
            (<span className="font-semibold text-main">{hint.title}</span>).
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>

      <section className="card p-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-main">
          <BookOpen size={17} />
          Allgemeine Tipps
        </div>
        <ul className="space-y-3 text-sm leading-6 text-on-surface-variant">
          <Tip>Suche auf jeder Liste funktioniert sofort – du musst nicht erst filtern.</Tip>
          <Tip>Das Ticket-Board zeigt dir oben im Menü, wie viele Tickets offen sind und wie viele davon dir zugewiesen sind.</Tip>
          <Tip>Eine Ausleihbescheinigung enthält Logo, Organisationsname und QR-Code – einfach auf der Ausleihe „Bescheinigung drucken“ wählen.</Tip>
          <Tip>Wenn beim Etikettendruck die Logos fehlen, im Druckdialog „Hintergrundgrafiken“ bzw. „Grafiken“ aktivieren.</Tip>
        </ul>
      </section>

      {isStaff && (
        <details className="card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-5 text-sm font-semibold text-main hover:bg-sidebar-item-hover transition">
            <ShieldCheck size={17} className="text-outline" />
            Für Administratoren und IT
            <ArrowRight size={15} className="ml-auto text-outline" />
          </summary>
          <div className="grid gap-3 border-t border-outline-variant p-5 sm:grid-cols-2">
            {adminTasks.map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                className="flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3 transition hover:border-primary hover:bg-surface-container-high"
              >
                <LifeBuoy size={16} className="mt-0.5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-main">{entry.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">{entry.text}</span>
                </span>
              </Link>
            ))}
          </div>
        </details>
      )}

      <p className="pb-2 text-center text-xs text-outline">
        Passt keine der Aufgaben? Frag direkt über ein Ticket – die IT antwortet im Chat.
      </p>
    </div>
  );
}

function TaskCard({ task }) {
  const Icon = task.icon;
  return (
    <section className="card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Icon size={19} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-main">{task.title}</h2>
          <p className="mt-0.5 text-sm leading-6 text-muted">{task.goal}</p>
        </div>
      </div>

      <ol className="mt-4 flex-1 space-y-2.5">
        {task.steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-6 text-on-surface-variant">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-[11px] font-bold text-on-surface-variant">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="btn-secondary min-h-11 sm:min-h-9 text-xs" to={task.to}>
          <Tag size={14} />Direkt öffnen
        </Link>
      </div>
    </section>
  );
}

function Tip({ children }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </li>
  );
}