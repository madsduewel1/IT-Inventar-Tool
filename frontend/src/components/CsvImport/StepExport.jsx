import { useMemo, useState } from 'react';
import { ArrowLeft, Columns3, Download, FileSpreadsheet, Info, Search } from 'lucide-react';
import { exportCsv } from '../../utils/csv';
import { CSV_COLUMNS, columnsByGroup, deviceCsvValue } from './csvTemplate';

const REQUIRED_KEYS = new Set(CSV_COLUMNS.filter((column) => column.required).map((column) => column.key));
const ALL_KEYS = CSV_COLUMNS.map((column) => column.key);

export default function StepExport({ devices = [], onBack }) {
  const [mode, setMode] = useState('data');
  const [selected, setSelected] = useState(ALL_KEYS);
  const [search, setSearch] = useState('');

  const selectedColumns = useMemo(
    () => CSV_COLUMNS.filter((column) => selected.includes(column.key)),
    [selected]
  );
  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return columnsByGroup(CSV_COLUMNS)
      .map((entry) => ({
        ...entry,
        columns: entry.columns.filter((column) => !query || column.label.toLowerCase().includes(query) || column.key.toLowerCase().includes(query))
      }))
      .filter((entry) => entry.columns.length > 0);
  }, [search]);

  const previewRows = useMemo(() => {
    if (mode === 'template') {
      return [{ ...Object.fromEntries(selectedColumns.map((column) => [column.key, column.example || ''])), _example: true }];
    }
    return devices.slice(0, 5);
  }, [devices, mode, selectedColumns]);

  function toggleColumn(key) {
    if (REQUIRED_KEYS.has(key)) return;
    setSelected((current) => current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]);
  }

  function selectAll() {
    setSelected(ALL_KEYS);
  }

  function selectNone() {
    setSelected(ALL_KEYS.filter((key) => REQUIRED_KEYS.has(key)));
  }

  function download() {
    const headers = selectedColumns.map((column) => column.label);
    if (mode === 'template') {
      exportCsv('assets-vorlage.csv', headers, []);
      return;
    }
    const rows = devices.map((device) => Object.fromEntries(
      selectedColumns.map((column) => [column.label, deviceCsvValue(device, column.key)])
    ));
    exportCsv(`assets-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-outline-variant bg-surface-container-low p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === 'data' ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setMode('data')}
          >
            <FileSpreadsheet size={15} className="mr-1.5 inline" /> Daten exportieren
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === 'template' ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setMode('template')}
          >
            <Columns3 size={15} className="mr-1.5 inline" /> Leere Vorlage
          </button>
        </div>
        <div className="text-sm text-on-surface-variant">
          {mode === 'template' ? 'Leere Vorlage mit Beispielwerten in der Vorschau' : `${devices.length} Assets`}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[310px_1fr]">
        <section className="rounded-xl border border-outline-variant bg-surface-container-low">
          <div className="border-b border-outline-variant p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-semibold text-on-surface">Spalten</div>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-blue-400 hover:underline" onClick={selectAll}>Alle</button>
                <button type="button" className="text-on-surface-variant hover:underline" onClick={selectNone}>Nur Pflicht</button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-outline" size={15} />
              <input className="field pl-8 text-sm" placeholder="Spalten suchen" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
          <div className="max-h-[350px] space-y-3 overflow-y-auto p-3">
            {groups.map((entry) => (
              <div key={entry.group}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-outline">{entry.group}</div>
                <div className="space-y-1">
                  {entry.columns.map((column) => {
                    const required = REQUIRED_KEYS.has(column.key);
                    return (
                      <label key={column.key} className={`flex items-start gap-2 rounded px-1 py-0.5 text-sm ${required ? 'cursor-default text-on-surface-variant' : 'cursor-pointer text-on-surface hover:bg-surface-container-high'}`}>
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-blue-500"
                          checked={selected.includes(column.key)}
                          disabled={required}
                          onChange={() => toggleColumn(column.key)}
                        />
                        <span className="min-w-0 flex-1">
                          {column.label}
                          {required && <span className="ml-1 text-[10px] font-semibold text-blue-400">Pflicht</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {groups.length === 0 && <div className="py-4 text-center text-sm text-on-surface-variant">Keine Spalten gefunden.</div>}
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-outline-variant bg-surface-container-low">
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant p-3">
            <div>
              <div className="font-semibold text-on-surface">{mode === 'template' ? 'Vorlage-Vorschau (Beispielwerte)' : 'CSV-Vorschau'}</div>
              <div className="text-xs text-on-surface-variant">{selectedColumns.length} Spalten ausgewählt</div>
            </div>
            <Info size={16} className="text-outline" />
          </div>
          <div className="overflow-auto p-3">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  {selectedColumns.map((column) => (
                    <th key={column.key} className="whitespace-nowrap border-b border-outline-variant px-2 py-1.5 text-left font-semibold text-on-surface-variant">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {selectedColumns.map((column) => (
                      <td key={column.key} className="max-w-[220px] truncate whitespace-nowrap border-b border-outline-variant/60 px-2 py-1.5 text-on-surface-variant">
                        {mode === 'template' ? row[column.key] : deviceCsvValue(row, column.key)}
                      </td>
                    ))}
                  </tr>
                ))}
                {previewRows.length === 0 && (
                  <tr>
                    <td colSpan={Math.max(selectedColumns.length, 1)} className="px-2 py-6 text-center text-on-surface-variant">Keine Assets vorhanden.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {mode === 'data' && devices.length > 5 && (
            <div className="border-t border-outline-variant px-3 py-2 text-xs text-on-surface-variant">Vorschau der ersten 5 von {devices.length} Assets.</div>
          )}
        </section>
      </div>

      <div className="csv-modal-footer -mx-5 -mb-5 mt-1">
        <button type="button" className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={17} /> Zurück
        </button>
        <button type="button" className="btn-primary" onClick={download} disabled={selectedColumns.length === 0}>
          <Download size={17} /> {mode === 'template' ? 'Vorlage herunterladen' : 'CSV exportieren'}
        </button>
      </div>
    </div>
  );
}
