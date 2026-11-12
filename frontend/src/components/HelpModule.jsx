import { BookOpen, CircleHelp, Cpu, DoorOpen, LifeBuoy, Tag, ShieldCheck, X } from 'lucide-react';
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
    points: ['Suche nach Inventarnummer, Modell oder Hersteller.', 'Öffne ein Gerät für Details, Bearbeitung oder QR-Druck.', 'Status wie verfügbar, verliehen oder defekt sauber pflegen.', 'Mit "Label scannen" ein Etikett per Barcode-Scanner oder Kamera erfassen – das Gerät öffnet sich automatisch.']
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
    match: () => false,
    title: 'Etiketten',
    summary: 'Drucke Inventaretiketten mit Barcode, QR-Code und Logo.',
    points: ['Labelgröße in den Einstellungen prüfen.', 'Etikett am Gerät öffnen.', 'Druckvorschau vor dem Ausdruck kontrollieren.']
  },
  {
    match: (path) => path.startsWith('/storage/inventory'),
    title: 'Inventur',
    summary: 'Führe regelmässige Bestandsaufnahmen durch, scanne QR-Codes und vergleiche Soll- mit Ist-Bestand.',
    points: ['Neue Inventur starten, um einen Snapshot aller Artikel zu erstellen.', 'QR-Codes oder Barcodes mit dem Scanner erfassen.', 'Nach Abschluss wird ein Inventurprotokoll erstellt.']
  },
  {
    match: (path) => path.startsWith('/storage/labels'),
    title: 'Labels & Druck',
    summary: 'Wähle Elemente aus und drucke sie als Etiketten mit QR-Code, Barcode und Name.',
    points: ['Filtere nach Typ (Artikel, Kiste, Lagerort).', 'Wähle Elemente per Checkbox aus.', 'Klicke auf "Labels drucken" für den Etikettendruck.']
  },
  {
    match: (path) => path.startsWith('/storage/boxes'),
    title: 'Kisten',
    summary: 'Verwalte Kisten und Behälter mit Standort, Inhalt und Benutzerzuweisung.',
    points: ['Lege neue Kisten an und weise sie einem Regalabteil zu.', 'Lade Bilder hoch für bessere Identifikation.', 'Klicke auf eine Kiste, um den Inhalt zu sehen.']
  },
  {
    match: (path) => path.startsWith('/storage/shelves'),
    title: 'Regale & Abteile',
    summary: 'Verwalte Regale und deren Unterteilungen pro Lagerort.',
    points: ['Lege neue Regale an und ordne sie Lagerorten zu.', 'Erstelle Abteile mit maximaler Kapazität.', 'Die Kapazität wird farblich dargestellt.']
  },
  {
    match: (path) => path.startsWith('/storage/locations'),
    title: 'Lagerorte',
    summary: 'Verwalte physische Standorte wie Techniklager, Serverraum, Werkstatt etc.',
    points: ['Lege Lagerorte mit Name und Beschreibung an.', 'Füge Bilder hinzu zur besseren Orientierung.', 'Jeder Ort hat QR-Code und Barcode für die Identifikation.']
  },
  {
    match: (path) => path.startsWith('/storage'),
    title: 'Lagerverwaltung',
    summary: 'Zentrale Übersicht aller Lagerbestände, Kisten und Standorte.',
    points: ['Nutze die Schnellsuche für Artikel, Barcodes oder QR-Codes.', 'Module wie Lagerorte, Regale, Kisten und Inventur sind direkt erreichbar.']
  },
  {
    match: (path) => path.startsWith('/admin'),
    title: 'Administration',
    summary: 'Dieser Bereich ist für Benutzer, Rollen, API-Schlüssel und Systemeinstellungen.',
    points: ['Änderungen an Rollen und Rechten bewusst prüfen.', 'Systemeinstellungen zentral pflegen.']
  }
];

const defaultHelp = {
  title: 'Dashboard',
  summary: 'Das Dashboard zeigt dir die wichtigsten Inventar-Kennzahlen und schnellen Einstiege.',
  points: ['Kennzahlen oben prüfen.', 'Schnellaktionen für Geräte und Ausleihe nutzen.', 'Hinweise und neueste Geräte regelmäßig kontrollieren.']
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
                <HelpTile icon={Tag} label="Etiketten" text="Barcode, QR-Code und Logo für Geräte drucken." />
                <HelpTile icon={DoorOpen} label="Räume" text="Standorte sauber und nachvollziehbar halten." />
                <HelpTile icon={ShieldCheck} label="Rechte" text="Aktionen richten sich nach Rolle und Freigaben." />
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <BookOpen size={17} />
                  So geht's auf dieser Seite
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
