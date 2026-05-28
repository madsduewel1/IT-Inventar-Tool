import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, Filter, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

const roomTypes = {
  STORAGE: 'Lager',
  CLASSROOM: 'Klassenraum',
  STUDIO: 'Studio',
  WORKSHOP: 'Werkstatt',
  SERVERROOM: 'Serverraum',
  OTHER: 'Sonstiges'
};

export default function Rooms() {
  const { user } = useAuth();
  const canEdit = ['STAFF', 'ADMIN'].includes(user?.role);
  const [rooms, setRooms] = useState([]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/rooms');
    setRooms(data.rooms || []);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rooms.filter((room) => {
    const matchesQuery = [room.name, room.building, room.description].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!type || room.type === type);
  }), [rooms, query, type]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Räume</h1>
          <p className="mt-1 text-sm text-gray-500">Standorte als strukturierte Liste mit Typ, Gebäude und Asset-Anzahl</p>
        </div>
        {canEdit && <Link className="btn-primary" to="/rooms/new"><Plus size={17} />Neu hinzufügen</Link>}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Räume" value={rooms.length} />
        <Metric label="Assets zugeordnet" value={rooms.reduce((sum, room) => sum + (room.devices?.length || 0), 0)} tone="green" />
        <Metric label="Gebäude" value={new Set(rooms.map((room) => room.building).filter(Boolean)).size} tone="orange" />
        <Metric label="Lager" value={rooms.filter((room) => room.type === 'STORAGE').length} tone="red" />
      </section>

      <section className="card overflow-hidden">
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{error}</div>}
        <div className="grid gap-3 border-b border-black/5 p-5 lg:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input className="field pl-9" placeholder="Raum, Gebäude oder Beschreibung suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="field" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Alle Raumtypen</option>
            {Object.entries(roomTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button className="btn-secondary"><Filter size={17} />Filter aktiv</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Raum</th>
                <th className="p-4 text-left font-medium">Gebäude</th>
                <th className="p-4 text-left font-medium">Typ</th>
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
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#27272a] text-[#e5e7eb]">
                        <DoorOpen size={19} />
                      </div>
                      <div className="font-semibold text-gray-800">{room.name}</div>
                    </div>
                  </td>
                  <td className="p-4 text-gray-600">{room.building || '-'}</td>
                  <td className="p-4"><span className="badge bg-[#fafafa] text-gray-700">{roomTypes[room.type] || room.type}</span></td>
                  <td className="p-4 font-semibold text-gray-800">{room.devices?.length || 0}</td>
                  <td className="max-w-md truncate p-4 text-gray-600">{room.description || '-'}</td>
                  <td className="p-4">{canEdit && <Link className="font-medium text-[#e5e7eb]" to={`/rooms/${room.id}/edit`}>Bearbeiten</Link>}</td>
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
    purple: 'text-[#e5e7eb]',
    green: 'text-green-600',
    orange: 'text-orange-500',
    red: 'text-red-500'
  };
  return <div className="card p-4"><div className="text-sm text-gray-500">{label}</div><div className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</div></div>;
}
