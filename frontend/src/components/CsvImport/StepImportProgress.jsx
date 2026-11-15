import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Circle, List, Loader2, Repeat, XCircle } from 'lucide-react';
import { streamDeviceImport } from '../../api/client';

const STATUS_META = {
  pending: { Icon: Circle, cls: 'text-outline', label: 'Wartet' },
  creating: { Icon: Loader2, cls: 'text-blue-400 animate-spin', label: 'Wird erstellt…' },
  created: { Icon: CheckCircle2, cls: 'text-emerald-500', label: 'wurde erstellt' },
  skipped: { Icon: XCircle, cls: 'text-red-400', label: 'übersprungen' },
  error: { Icon: XCircle, cls: 'text-red-400', label: 'Fehler' }
};

function buildEntries(rows) {
  return rows.map((row, index) => {
    const label = row.inventoryId || `Asset ${index + 1}`;
    const errors = row._errors || [];
    return {
      key: `${label}-${index}`,
      inventoryId: row.inventoryId,
      label,
      status: row._status === 'error' ? 'error' : 'pending',
      message: row._status === 'error' ? errors.map((error) => error.msg).join(' ') || 'Ungültige Zeile' : 'Wartet'
    };
  });
}

function ProgressRow({ entry }) {
  const meta = STATUS_META[entry.status] || STATUS_META.pending;
  const Icon = meta.Icon;
  const tone = entry.status === 'created'
    ? 'text-emerald-400'
    : entry.status === 'skipped' || entry.status === 'error'
    ? 'text-red-400'
    : 'text-on-surface';

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Icon size={18} className={`shrink-0 ${meta.cls}`} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-semibold ${tone}`}>{entry.label}</div>
        <div className="truncate text-xs text-on-surface-variant">{entry.message}</div>
      </div>
      {entry.deviceId && <span className="shrink-0 rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant">ID {entry.deviceId}</span>}
    </div>
  );
}

export default function StepImportProgress({ rows, onClose, onReset }) {
  const [entries, setEntries] = useState(() => buildEntries(rows));
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const mountedRef = useRef(true);
  const startedRef = useRef(false);
  const validRows = useMemo(() => rows.filter((row) => row._status !== 'error'), [rows]);

  useEffect(() => {
    mountedRef.current = true;
    if (!startedRef.current) {
      startedRef.current = true;

      if (validRows.length === 0) {
        setFinished(true);
        setSummary({ imported: 0, skipped: 0 });
      } else {
        streamDeviceImport(validRows, (event) => {
          if (!mountedRef.current) return;

          if (['creating', 'created', 'skipped'].includes(event.status)) {
            setEntries((current) => current.map((entry) => {
              if (entry.inventoryId !== event.inventoryId) return entry;
              return {
                ...entry,
                status: event.status,
                message: event.status === 'creating'
                  ? 'Wird erstellt…'
                  : event.status === 'created'
                  ? 'wurde erstellt'
                  : event.reason || 'übersprungen',
                deviceId: event.deviceId || entry.deviceId
              };
            }));
          }

          if (event.status === 'done') {
            setSummary(event);
            setFinished(true);
          }

          if (event.status === 'error') {
            setError(event.error || 'Import fehlgeschlagen.');
            setFinished(true);
          }
        }).catch((streamError) => {
          if (!mountedRef.current) return;
          setError(streamError.message);
          setFinished(true);
          setEntries((current) => current.map((entry) => (
            entry.status === 'pending' || entry.status === 'creating'
              ? { ...entry, status: 'error', message: streamError.message }
              : entry
          )));
        });
      }
    }

    return () => {
      mountedRef.current = false;
    };
  }, [validRows]);

  const completed = entries.filter((entry) => ['created', 'skipped', 'error'].includes(entry.status)).length;
  const created = entries.filter((entry) => entry.status === 'created').length;
  const skipped = entries.filter((entry) => entry.status === 'skipped' || entry.status === 'error').length;
  const progress = entries.length > 0 ? Math.round((completed / entries.length) * 100) : 0;

  return (
    <div className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-on-surface">{finished ? 'Import abgeschlossen' : 'Live-Import läuft'}</div>
          <p className="mt-1 text-sm text-on-surface-variant">
            {finished
              ? `${created} erstellt, ${skipped} übersprungen.`
              : 'Die Assets werden nacheinander erstellt. Der Status aktualisiert sich live.'}
          </p>
        </div>
        <div className="text-sm font-medium text-on-surface-variant">{completed} / {entries.length}</div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div className={`h-full transition-all duration-300 ${error ? 'bg-red-500' : finished ? (skipped > 0 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="max-h-[420px] divide-y divide-outline-variant/60 overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-low">
        {entries.map((entry) => <ProgressRow key={entry.key} entry={entry} />)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-4">
        <div className="text-sm text-on-surface-variant">
          {finished ? (summary?.imported ?? created) : 'Import läuft…'}
          {finished ? ' Assets übernommen.' : ''}
        </div>
        {finished && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={onReset}>
              <Repeat size={17} /> Weiterer Import
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              <List size={17} /> Zur Geräteliste
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
