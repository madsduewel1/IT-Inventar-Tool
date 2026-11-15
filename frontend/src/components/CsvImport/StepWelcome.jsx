import { Download, FileUp, Info, Table2, Upload } from 'lucide-react';

export default function StepWelcome({ canImport = true, onImport, onExport }) {
  return (
    <div className="csv-welcome">
      <div className="csv-welcome-head">
        <div className="csv-welcome-icon">
          <Table2 size={24} />
        </div>
        <div>
          <h2 className="csv-welcome-title">Assets importieren oder exportieren</h2>
          <p className="csv-welcome-sub">
            Wähle zuerst, ob du Assets einlesen oder als CSV ausgeben möchtest.
          </p>
        </div>
      </div>

      <div className="csv-action-grid">
        <div className="csv-action-card csv-action-card--primary">
          <div className="csv-action-icon csv-action-icon--green">
            <Upload size={20} />
          </div>
          <h3>Assets importieren</h3>
          <p>
            CSV hochladen, Pflichtfelder prüfen und im Live-Import sehen, wie die einzelnen Assets angelegt werden.
          </p>
          {!canImport && <p className="text-xs text-amber-400">Für den Import fehlt das Recht „Assets anlegen“.</p>}
          <button type="button" className="btn-primary csv-action-btn" onClick={onImport} disabled={!canImport}>
            <FileUp size={17} /> Import starten
          </button>
        </div>

        {onExport && (
          <div className="csv-action-card">
            <div className="csv-action-icon csv-action-icon--blue">
              <Download size={20} />
            </div>
            <h3>Assets exportieren</h3>
            <p>
              Spalten auswählen, Vorschau prüfen und die CSV herunterladen. Alternativ eine leere Vorlage mit den gewünschten Spalten erzeugen.
            </p>
            <button type="button" className="btn-secondary csv-action-btn" onClick={onExport}>
              <Download size={17} /> Export starten
            </button>
          </div>
        )}
      </div>

      <div className="csv-info">
        <Info size={16} />
        <span>Unterstützte Formate: <strong>.csv</strong> · Trennzeichen: <strong>; oder ,</strong> · Max. <strong>500 Zeilen</strong> pro Import</span>
      </div>
    </div>
  );
}
