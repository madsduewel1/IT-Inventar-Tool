import { AlertCircle, ArrowLeft, Check } from 'lucide-react';

export default function StepReview({ rows, onConfirm, onBack }) {
  const okCount = rows.filter((row) => row._status !== 'error').length;
  const errCount = rows.filter((row) => row._status === 'error').length;
  const warnCount = rows.filter((row) => row._status === 'warning').length;
  const errorRows = rows.filter((row) => row._status === 'error');

  return (
    <div className="csv-review">
      <div className="csv-review-summary">
        <div className="csv-review-summary-item csv-review-summary-item--ok">
          <span className="csv-review-summary-num">{okCount}</span>
          <span className="csv-review-summary-label">bereit</span>
        </div>
        {warnCount > 0 && (
          <div className="csv-review-summary-item csv-review-summary-item--warn">
            <span className="csv-review-summary-num">{warnCount}</span>
            <span className="csv-review-summary-label">Warnungen</span>
          </div>
        )}
        {errCount > 0 && (
          <div className="csv-review-summary-item csv-review-summary-item--err">
            <span className="csv-review-summary-num">{errCount}</span>
            <span className="csv-review-summary-label">Fehler</span>
          </div>
        )}
      </div>

      <div className="space-y-3 p-5">
        <div>
          <div className="font-semibold text-on-surface">Bereit für den Live-Import</div>
          <p className="mt-1 text-sm text-on-surface-variant">
            Die Assets werden nacheinander erstellt. Währenddessen siehst du live, welches Asset gerade angelegt wurde.
          </p>
        </div>

        {errorRows.length > 0 && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-red-400">
              <AlertCircle size={16} /> {errorRows.length} {errorRows.length === 1 ? 'Zeile wird' : 'Zeilen werden'} übersprungen
            </div>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-red-300">
              {errorRows.map((row, index) => (
                <div key={index}>
                  <span className="font-mono">{row.inventoryId || `Zeile ${row._row}`}</span>
                  {': '}
                  {(row._errors || []).map((error) => error.msg).join(' · ')}
                </div>
              ))}
            </div>
          </div>
        )}

        {warnCount > 0 && (
          <p className="text-xs text-amber-400">
            {warnCount} {warnCount === 1 ? 'Zeile hat' : 'Zeilen haben'} Warnungen, wird aber trotzdem importiert.
          </p>
        )}
      </div>

      <div className="csv-modal-footer">
        <button type="button" className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={17} /> Zurück
        </button>
        <button type="button" className="btn-primary" onClick={onConfirm} disabled={okCount === 0}>
          <Check size={17} />
          {okCount} {okCount === 1 ? 'Asset' : 'Assets'} importieren
        </button>
      </div>
    </div>
  );
}
