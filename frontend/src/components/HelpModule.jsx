import { BookOpen, CircleHelp, Cpu, DoorOpen, LifeBuoy, QrCode, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const helpByPath = [
  {
    match: (path) => path === '/login',
    title: 'Anmeldung',
    summary: 'Melde dich mit deinem Benutzerkonto an. Falls SSO aktiv ist, kannst du den eingerichteten Single-Sign-on nutzen.',
    points: ['Benutzername oder E-Mail eingeben.', 'Passwort eintragen und anmelden.', 'Nach der Anmeldung landest du im Dashboard.']
  },
  {
    match: (path) => path === '/setup',
    title: 'Einrichtung',
    summary: 'Führe die Ersteinrichtung durch, lege Basisdaten fest und bereite das Inventarsystem für die Nutzung vor.',
    points: ['Schritte der Reihe nach ausfüllen.', 'Admin-Zugang und Organisation prüfen.', 'Einrichtung abschließen und danach anmelden.']
  },
  {
    match: (path) => path.startsWith('/devices'),
    title: 'Geräte',
    summary: 'Hier verwaltest du Inventar, Status, Raumzuordnung, QR-Codes und Gerätedetails.',
    points: ['Suche nach Inventarnummer, Modell oder Hersteller.', 'Öffne ein Gerät für Details, Bearbeitung oder QR-Druck.', 'Status wie verfügbar, verliehen oder defekt sauber pflegen.']
  },
  {
    match: (path) => path.startsWith('/rooms'),
    title: 'Räume',
    summary: 'Räume strukturieren dein Inventar und helfen beim schnellen Wiederfinden von Assets.',
    points: ['Raum anlegen oder bearbeiten.', 'Geräte einem Raum zuordnen.', 'Namen eindeutig halten, damit Listen gut scannbar bleiben.']
  },
  {
    match: (path) => path.startsWith('/loans'),
    title: 'Ausleihe',
    summary: 'Verwalte Ausgabe, Rückgabe und überfällige Ausleihen direkt im System.',
    points: ['Neue Ausleihe starten und Gerät auswählen.', 'Rückgabedatum kontrollieren.', 'Offene oder überfällige Vorgänge im Blick behalten.']
  },
  {
    match: (path) => path.startsWith('/issues'),
    title: 'Fehler & Tickets',
    summary: 'Melde Defekte oder bearbeite bestehende Hinweise, damit Probleme nachvollziehbar bleiben.',
    points: ['Fehler mit kurzer Beschreibung erfassen.', 'Betroffenes Gerät verknüpfen, wenn möglich.', 'Tickets im Servicebereich nachverfolgen.']
  },
  {
    match: (path) => path.startsWith('/scanner'),
    title: 'QR-Scanner',
    summary: 'Scanne Inventar-QR-Codes, um ein Gerät direkt aufzurufen.',
    points: ['Kamera erlauben.', 'QR-Code ruhig ins Scanfenster halten.', 'Nach dem Treffer öffnet sich der passende Datensatz.']
  },
  {
    match: (path) => path.startsWith('/admin'),
    title: 'Administration',
    summary: 'Dieser Bereich ist für Benutzer, Rollen, Monitoring, API-Schlüssel und Systemeinstellungen.',
    points: ['Änderungen an Rollen und Rechten bewusst prüfen.', 'Monitoring für Agent-Status nutzen.', 'Systemeinstellungen zentral pflegen.']
  }
];

const defaultHelp = {
  title: 'Dashboard',
  summary: 'Das Dashboard zeigt dir die wichtigsten Inventar-Kennzahlen und schnellen Einstiege.',
  points: ['Kennzahlen oben prüfen.', 'Schnellaktionen für Scanner, Geräte und Ausleihe nutzen.', 'Hinweise und neueste Geräte regelmäßig kontrollieren.']
};

export default function HelpModule({ path = '/', open: controlledOpen, onClose }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const help = useMemo(() => helpByPath.find((item) => item.match(path)) || defaultHelp, [path]);

  function handleToggle() {
    if (controlledOpen !== undefined) {
      onClose?.(!open);
    } else {
      setInternalOpen((v) => !v);
    }
  }

  return (
    <>
      <button className="help-trigger" type="button" onClick={handleToggle} title="Hilfe zu dieser Seite">
        <CircleHelp size={18} />
        <span>Hilfe</span>
      </button>

      {open && createPortal(
        <div className="help-overlay" onMouseDown={() => { if (controlledOpen !== undefined) onClose?.(false); else setInternalOpen(false); }}>
          <section className="help-panel" onMouseDown={(event) => event.stopPropagation()}>
            <header className="help-panel-header">
              <div className="flex min-w-0 items-center gap-3">
                <div className="help-panel-icon"><LifeBuoy size={20} /></div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-300/80">Seitenguide</div>
                  <h2 className="truncate text-xl font-bold text-white">{help.title}</h2>
                </div>
              </div>
              <button className="help-close" type="button" onClick={() => { if (controlledOpen !== undefined) onClose?.(false); else setInternalOpen(false); }} title="Schließen">
                <X size={20} />
              </button>
            </header>

            <div className="space-y-5 p-5">
              <p className="text-sm leading-6 text-slate-200">{help.summary}</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <HelpTile icon={Cpu} label="Inventar" text="Assets suchen, prüfen und aktualisieren." />
                <HelpTile icon={QrCode} label="QR-Codes" text="Scannen oder Etiketten für Geräte drucken." />
                <HelpTile icon={DoorOpen} label="Räume" text="Standorte sauber und nachvollziehbar halten." />
                <HelpTile icon={ShieldCheck} label="Rechte" text="Aktionen richten sich nach Rolle und Freigaben." />
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <BookOpen size={17} />
                  Was du hier tun kannst
                </div>
                <ul className="space-y-2 text-sm leading-6 text-slate-200">
                  {help.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}

function HelpTile({ icon: Icon, label, text }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <Icon size={16} className="text-gray-300" />
        {label}
      </div>
      <div className="text-xs leading-5 text-slate-300">{text}</div>
    </div>
  );
}
