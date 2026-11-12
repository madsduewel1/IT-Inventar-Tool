import { useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

const STATUS_META = {
  ok:      { label: 'OK',      cls: 'csv-badge-ok' },
  warning: { label: 'Warnung', cls: 'csv-badge-warn' },
  error:   { label: 'Fehler',  cls: 'csv-badge-err' },
};

function ReviewRow({ row }) {
  const [open, setOpen] = useState(false);
  const hasIssues = row._errors.length + row._warnings.length > 0;
  const meta = STATUS_META[row._status] || STATUS_META.ok;
  const network = [row.ipAddress, row.macAddress].filter(Boolean).join(' / ') || '-';

  return (
    <>
      <tr
        className={`csv-review-row csv-review-row--${row._status}${hasIssues ? ' csv-review-row--clickable' : ''}`}
        onClick={() => hasIssues && setOpen(o => !o)}
      >
        <td className="csv-cell csv-cell--mono">{row._row}</td>
        <td className="csv-cell csv-cell--mono">{row.id || '-'}</td>
        <td className="csv-cell csv-cell--mono">{row.inventoryId}</td>
        <td className="csv-cell">{row.manufacturer} {row.model}</td>
        <td className="csv-cell csv-cell--mono">{network}</td>
        <td className="csv-cell">
          <span className={`csv-badge ${meta.cls}`}>{meta.label}</span>
          {hasIssues && (
            open ? <ChevronUp className="csv-chevron" size={14} /> : <ChevronDown className="csv-chevron" size={14} />
          )}
        </td>
      </tr>
      {open && hasIssues && (
        <tr className="csv-review-detail">
          <td colSpan={6} className="csv-detail-cell">
            {row._errors.map((e, i)   => <div key={i} className="csv-msg csv-msg--err">Fehler: {e.msg}</div>)}
            {row._warnings.map((w, i) => <div key={i} className="csv-msg csv-msg--warn">Warnung: {w.msg}</div>)}
          </td>
        </tr>
      )}
    </>
  );
}

export default function StepReview({ rows, onConfirm, onBack, importing = false }) {
  const okCount   = rows.filter(r => r._status !== 'error').length;
  const errCount  = rows.filter(r => r._status === 'error').length;
  const warnCount = rows.filter(r => r._status === 'warning').length;

  return (
    <div className="csv-review">
      {/* Summary-Banner */}
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
        {errCount > 0 && (
          <p className="csv-review-err-note">Zeilen mit Fehlern werden übersprungen.</p>
        )}
      </div>

      {/* Tabelle */}
      <div className="csv-review-table-wrap">
        <table className="csv-review-table">
          <thead>
            <tr>
              <th className="csv-th">#</th>
              <th className="csv-th">Geräte-ID</th>
              <th className="csv-th">Inventarnr.</th>
              <th className="csv-th">Gerät</th>
              <th className="csv-th">Netzwerk</th>
              <th className="csv-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => <ReviewRow key={i} row={row} />)}
          </tbody>
        </table>
      </div>

      <div className="csv-modal-footer">
        <button type="button" className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={17} /> Zurück
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={onConfirm}
          disabled={okCount === 0 || importing}
        >
          {importing ? <Loader2 className="csv-spin" size={17} /> : <Check size={17} />}
          {importing ? 'Import läuft...' : `${okCount} ${okCount === 1 ? 'Gerät' : 'Geräte'} importieren`}
        </button>
      </div>
    </div>
  );
}
