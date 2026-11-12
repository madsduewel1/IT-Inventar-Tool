import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, Download, Filter, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../components/ConfirmDialog';
import { exportCsv } from '../utils/csv';

export default function Rooms() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const permissions = user?.effectivePermissions || [];
  const canCreate = permissions.includes('ROOM_CREATE');
  const canEdit = permissions.includes('ROOM_EDIT');
  const canDelete = permissions.includes('ROOM_DELETE');
  const [rooms, setRooms] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/rooms');
      const nextRooms = data.rooms || [];
      setRooms(nextRooms);
      setSelectedIds((ids) => ids.filter((id) => nextRooms.some((room) => room.id === id)));
    } catch {
      setError('Räume konnten nicht geladen werden.');
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rooms.filter((room) => {
    const matchesQuery = [room.name, room.building, room.description].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase());
    return matchesQuery;
  }), [rooms, query]);

  const filteredIds = useMemo(() => filtered.map((room) => room.id), [filtered]);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  function toggleSelected(id) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  function toggleAllVisible() {
    setSelectedIds((ids) => {
      if (allSelected) return ids.filter((id) => !filteredIds.includes(id));
      return Array.from(new Set([...ids, ...filteredIds]));
    });
  }

  async function deleteSelected() {
    if (!canDelete || selectedIds.length === 0) return;
    const ok = await confirm({
      title: 'Räume löschen',
      message: `${selectedIds.length} Raum/Räume wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`,
      tone: 'danger',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    setError('');
    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/rooms/${id}`)));
      setSelectedIds([]);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Ausgewählte Räume konnten nicht gelöscht werden.');
    }
  }

  function exportRooms() {
    const headers = ['name', 'id', 'building', 'description', 'devices'];
    const rows = filtered.map((room) => ({
      name: room.name,
      id: room.id,
      building: room.building || '',
      description: room.description || '',
      devices: (room.devices?.length || 0)
    }));
    exportCsv(`raeume-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Räume</h1>
          <p className="mt-1 text-sm text-gray-500">Standorte als strukturierte Liste mit Typ, Gebäude und Asset-Anzahl</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={exportRooms}><Download size={17} />CSV exportieren</button>
          {canCreate && <Link className="btn-primary" to="/rooms/new"><Plus size={17} />Neu hinzufügen</Link>}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric label="Räume" value={rooms.length} />
        <Metric label="Assets zugeordnet" value={rooms.reduce((sum, room) => sum + (room.devices?.length || 0), 0)} tone="green" />
        <Metric label="Gebäude" value={new Set(rooms.map((room) => room.building).filter(Boolean)).size} tone="orange" />
      </section>

      <section className="card overflow-hidden">
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{error}</div>}
        <div className="grid gap-3 border-b border-black/5 p-5 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input className="field pl-9" placeholder="Raum, Gebäude oder Beschreibung suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <button className="btn-secondary"><Filter size={17} />Filter aktiv</button>
        </div>

        {/* Mobil: Kartenliste statt Tabelle – kein Querscrollen auf dem Handy */}
        <div className="divide-y divide-black/5 md:hidden">
          {filtered.map((room) => (
            <div key={room.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-zinc-100">
                  <DoorOpen size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-800 dark:text-zinc-100">{room.name}</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400">
                {room.building || 'Ohne Gebäude'} · {room.devices?.length || 0} Assets
              </div>
                  <div className="mt-0.5 font-mono text-[11px] text-gray-400 dark:text-zinc-500">{room.id}</div>
                </div>
                {canEdit && (
                  <Link className="btn-secondary min-h-11 shrink-0 px-3" to={`/rooms/edit?id=${room.id}`}>Bearbeiten</Link>
                )}
              </div>
              {room.description && (
                <div className="mt-2 text-sm text-gray-600 dark:text-zinc-400">{room.description}</div>
              )}
            </div>
          ))}
          {!filtered.length && <div className="p-5 text-sm text-gray-500 dark:text-zinc-400">Keine Räume gefunden.</div>}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Raum</th>
                <th className="p-4 text-left font-medium">Raum-ID</th>
                <th className="p-4 text-left font-medium">Gebäude</th>
                <th className="p-4 text-left font-medium">Assets</th>
                <th className="p-4 text-left font-medium">Beschreibung</th>
                <th className="p-4 text-left font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((room) => (
                <tr key={room.id} className="table-row">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-zinc-100">
                        <DoorOpen size={19} />
                      </div>
                      <div className="font-semibold text-gray-800">{room.name}</div>
                    </div>
                  </td>
                  <td className="p-4"><span className="font-mono text-xs text-gray-500">{room.id}</span></td>
                  <td className="p-4 text-gray-600">{room.building || '-'}</td>
                  <td className="p-4 font-semibold text-gray-800">{room.devices?.length || 0}</td>
                  <td className="max-w-md truncate p-4 text-gray-600">{room.description || '-'}</td>
                  <td className="p-4">{canEdit && <Link className="font-medium text-blue-600 dark:text-blue-400 hover:underline" to={`/rooms/edit?id=${room.id}`}>Bearbeiten</Link>}</td>
                </tr>
              ))}
              {!filtered.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="6">Keine Räume gefunden.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

function Metric({ label, value, tone = 'purple' }) {
  const tones = {
    purple: 'text-gray-800 dark:text-gray-200',
    green: 'text-green-600 dark:text-green-400',
    orange: 'text-orange-500 dark:text-orange-400',
    red: 'text-red-500 dark:text-red-400'
  };
  return (
    <div className="card p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}
