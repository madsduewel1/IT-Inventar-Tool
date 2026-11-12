import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import { useConfirm } from '../../components/ConfirmDialog';
import { AdminPage, Metric } from './Users';

export default function ApiKeys() {
  const confirm = useConfirm();
  const [apiKeys, setApiKeys] = useState([]);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [plainKey, setPlainKey] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/api-keys');
      setApiKeys(data.apiKeys || []);
    } catch {
      setApiKeys([]);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => apiKeys.filter((key) => key.name.toLowerCase().includes(query.toLowerCase())), [apiKeys, query]);

  async function createKey(event) {
    event.preventDefault();
    const { data } = await api.post('/api-keys', { name });
    setPlainKey(data.key);
    setName('');
    setFormOpen(false);
    load();
  }

  async function deleteKey(id) {
    const ok = await confirm({
      title: 'API-Key löschen',
      message: 'API-Key wirklich löschen? Agents mit diesem Key können danach nicht mehr melden.',
      tone: 'danger',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    await api.delete(`/api-keys/${id}`);
    load();
  }

  return (
    <AdminPage title="API-Keys" subtitle="Zugriff für Integrationen verwalten">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Keys" value={apiKeys.length} />
          <Metric label="Aktiv" value={apiKeys.filter((key) => key.active).length} tone="green" />
          <Metric label="Benutzt" value={apiKeys.filter((key) => key.lastUsed).length} tone="orange" />
        </div>
        <button className="btn-primary" onClick={() => setFormOpen(true)}><Plus size={17} />Neu hinzufügen</button>
      </div>

      {plainKey && (
        <div className="card border-green-100 bg-green-50 p-4 text-sm text-green-800">
          <KeyRound className="mr-2 inline" size={16} />
          Neuer Key: <span className="font-mono">{plainKey}</span>
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-black/5 p-5">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input className="field pl-9" placeholder="Key-Name suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        {/* Mobil: Kartenliste statt Tabelle */}
        <div className="divide-y divide-black/5 md:hidden">
          {filtered.map((key) => (
            <div key={key.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-semibold text-gray-800 dark:text-zinc-100">{key.name}</span>
                <span className={`badge shrink-0 ${key.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{key.active ? 'Aktiv' : 'Inaktiv'}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                Erstellt {key.createdAt?.slice(0, 10)} · Zuletzt genutzt{' '}
                {key.lastUsed ? key.lastUsed.slice(0, 16).replace('T', ' ') : '-'}
              </div>
              <button className="btn-secondary min-h-11 mt-3 w-full border-badge-red text-text-badge-red" onClick={() => deleteKey(key.id)}>
                <Trash2 size={16} />Löschen
              </button>
            </div>
          ))}
          {!filtered.length && <div className="p-5 text-sm text-gray-500 dark:text-zinc-400">Keine API-Keys gefunden.</div>}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Name</th>
                <th className="p-4 text-left font-medium">Status</th>
                <th className="p-4 text-left font-medium">Erstellt</th>
                <th className="p-4 text-left font-medium">Letzte Nutzung</th>
                <th className="p-4 text-left font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((key) => (
                <tr key={key.id} className="table-row">
                  <td className="p-4 font-semibold text-gray-800">{key.name}</td>
                  <td className="p-4"><span className={`badge ${key.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{key.active ? 'Aktiv' : 'Inaktiv'}</span></td>
                  <td className="p-4 text-gray-600">{key.createdAt?.slice(0, 10)}</td>
                  <td className="p-4 text-gray-600">{key.lastUsed ? key.lastUsed.slice(0, 16).replace('T', ' ') : '-'}</td>
                  <td className="p-4"><button className="font-medium text-red-600" onClick={() => deleteKey(key.id)}><Trash2 className="mr-1 inline" size={16} />Löschen</button></td>
                </tr>
              ))}
              {!filtered.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="5">Keine API-Keys gefunden.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={formOpen} title="API-Key neu hinzufügen" subtitle="Der vollständige Key wird nur einmal angezeigt" onClose={() => setFormOpen(false)}>
        <form onSubmit={createKey} className="space-y-4">
          <input className="field" required placeholder="Name, z.B. Raum 104 Agent" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setFormOpen(false)}>Abbrechen</button>
            <button className="btn-primary w-full sm:w-auto">Key erstellen</button>
          </div>
        </form>
      </Modal>
    </AdminPage>
  );
}
