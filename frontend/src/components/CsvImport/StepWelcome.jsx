import { generateTemplateCSV } from './csvTemplate';
import { Download, FileUp, Info, Table2, Upload } from 'lucide-react';

function downloadTemplate() {
  const csv  = generateTemplateCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'geräte-vorlage.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function StepWelcome({ onUpload }) {
  return (
    <div className="csv-welcome">
      <div className="csv-welcome-head">
        <div className="csv-welcome-icon">
          <Table2 size={24} />
        </div>
        <div>
          <h2 className="csv-welcome-title">CSV Import / Export</h2>
          <p className="csv-welcome-sub">
            Geräte schnell & strukturiert hinzufügen oder eine Vorlage herunterladen.
          </p>
        </div>
      </div>

      <div className="csv-action-grid">
        {/* Karte: Vorlage herunterladen */}
        <div className="csv-action-card">
          <div className="csv-action-icon csv-action-icon--blue">
            <Download size={20} />
          </div>
          <h3>Vorlage herunterladen</h3>
          <p>
            Leere CSV mit allen Spalten und Beispieldaten herunterladen, ausfüllen und zurückimportieren.
          </p>
          <button type="button" className="btn-secondary csv-action-btn" onClick={downloadTemplate}>
            <Download size={17} /> Vorlage laden
          </button>
        </div>

        {/* Karte: CSV importieren */}
        <div className="csv-action-card csv-action-card--primary">
          <div className="csv-action-icon csv-action-icon--green">
            <Upload size={20} />
          </div>
          <h3>CSV importieren</h3>
          <p>
            Ausgefüllte CSV hochladen, Vorschau prüfen und Geräte mit einem Klick importieren.
          </p>
          <button type="button" className="btn-primary csv-action-btn" onClick={onUpload}>
            <FileUp size={17} /> Datei auswählen
          </button>
        </div>
      </div>

      <div className="csv-info">
        <Info size={16} />
        <span>Unterstützte Formate: <strong>.csv</strong> · Trennzeichen: <strong>; oder ,</strong> · Max. <strong>500 Zeilen</strong> pro Import</span>
      </div>
    </div>
  );
}
