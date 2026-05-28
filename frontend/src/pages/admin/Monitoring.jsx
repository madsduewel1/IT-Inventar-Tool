import { useEffect, useMemo, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage, Metric } from './Users';

export default function Monitoring() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');

  async function load() {
    const { data } = await api.get('/monitoring');
    setRows(data.monitoring || []);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((row) => {
    const haystack = [row.device?.inventoryId, row.device?.model, row.hostname, row.ip].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase()) && (!state || String(row.online) === state);
  }), [rows, query, state]);

  return (
    <AdminPage title="Monitoring" subtitle="Agent-Reports, Hostnamen und Live-Status prüfen">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Reports" value={rows.length} />
        <Metric label="Online" value={rows.filter((row) => row.online).length} tone="green" />
        <Metric label="Offline" value={rows.filter((row) => !row.online).length} tone="red" />
        <Metric label="CPU > 80%" value={rows.filter((row) => Number(row.cpuPercent || 0) > 80).length} tone="orange" />
      </div>

      <section className="card overflow-hidden">
        <div className="grid gap-3 border-b border-black/5 p-5 md:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input className="field pl-9" placeholder="Hostname, IP oder Asset suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="field" value={state} onChange={(event) => setState(event.target.value)}>
            <option value="">Alle Zustände</option>
            <option value="true">Online</option>
            <option value="false">Offline</option>
          </select>
          <button className="btn-secondary" onClick={load}><Activity size={17} />Aktualisieren</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Asset</th>
                <th className="p-4 text-left font-medium">Hostname</th>
                <th className="p-4 text-left font-medium">IP</th>
                <th className="p-4 text-left font-medium">Status</th>
                <th className="p-4 text-left font-medium">CPU/RAM/Disk</th>
                <th className="p-4 text-left font-medium">Letzter Kontakt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="table-row">
                  <td className="p-4 font-semibold text-gray-800">{row.device?.inventoryId || '-'}</td>
                  <td className="p-4 text-gray-600">{row.hostname || '-'}</td>
                  <td className="p-4 font-mono text-gray-600">{row.ip || '-'}</td>
                  <td className="p-4"><span className={`badge ${row.online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{row.online ? 'Online' : 'Offline'}</span></td>
                  <td className="p-4 text-gray-600">{percent(row.cpuPercent)} / {percent(row.ramPercent)} / {percent(row.diskPercent)}</td>
                  <td className="p-4 text-gray-600">{row.lastSeen ? row.lastSeen.slice(0, 16).replace('T', ' ') : '-'}</td>
                </tr>
              ))}
              {!filtered.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="6">Keine Monitoringdaten vorhanden.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPage>
  );
}

function percent(value) {
  return value === null || value === undefined ? '-' : `${Math.round(Number(value))}%`;
}
