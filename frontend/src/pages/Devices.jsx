import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Cpu, Filter, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

const statusLabels = {
  AVAILABLE: ['Verfügbar', 'bg-green-100 text-green-700'],
  LOANED: ['Verliehen', 'bg-orange-100 text-orange-600'],
  RESERVED: ['Reserviert', 'bg-yellow-100 text-yellow-700'],
  DEFECT: ['Defekt', 'bg-red-100 text-red-700'],
  MAINTENANCE: ['Wartung', 'bg-gray-100 text-gray-700'],
  RETIRED: ['Ausgemustert', 'bg-gray-100 text-gray-600']
};

export default function Devices() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const canEdit = ['STAFF', 'ADMIN'].includes(user?.role);
  const [devices, setDevices] = useState([]);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function load(overrides = {}) {
    const nextSearch = overrides.search ?? search;
    const nextStatus = overrides.status ?? status;
    try {
      const { data: devicesData } = await api.get('/devices', { params: { search: nextSearch, status: nextStatus || undefined } });
      setDevices(devicesData.devices || []);
      setError('');
    } catch {
      setError('Geräte konnten nicht geladen werden.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get('search') || '';
    if (fromUrl !== search) {
      setSearch(fromUrl);
      load({ search: fromUrl });
    }
  }, [searchParams]);

  const stats = useMemo(() => ({
    total: devices.length,
    available: devices.filter((device) => device.status === 'AVAILABLE').length,
    loaned: devices.filter((device) => device.status === 'LOANED').length,
    defect: devices.filter((device) => device.status === 'DEFECT').length
  }), [devices]);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 md:text-3xl">Assets</h1>
          <p className="mt-1 text-sm text-gray-500">Geräte, Räume, Status und Inventarnummern</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button className="btn-secondary"><SlidersHorizontal size={17} />Spalten</button>
          <button className="btn-secondary"><Filter size={17} />Filter</button>
          {canEdit && <Link className="btn-primary col-span-2 sm:col-span-1" to="/devices/new"><Plus size={17} />Neu hinzufügen</Link>}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Assets" value={stats.total} />
        <Metric label="Verfügbar" value={stats.available} tone="green" />
        <Metric label="Verliehen" value={stats.loaned} tone="orange" />
        <Metric label="Defekt" value={stats.defect} tone="red" />
      </section>

      <section className="card overflow-hidden">
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{error}</div>}
        <div className="grid gap-3 border-b border-black/5 p-4 lg:grid-cols-[1fr_220px_auto] lg:p-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input className="field pl-9" placeholder="Inventarnummer, Modell oder Seriennummer" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} />
          </div>
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Alle Status</option>
            {Object.entries(statusLabels).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button className="btn-secondary" onClick={load}>Anwenden</button>
        </div>

        <div className="divide-y divide-black/5 md:hidden">
          {devices.map((device) => <DeviceCard key={device.id} device={device} canEdit={canEdit} />)}
          {!devices.length && <div className="p-5 text-sm text-gray-500">Keine Assets gefunden.</div>}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Asset / Name</th>
                <th className="p-4 text-left font-medium">Geräte-ID</th>
                <th className="p-4 text-left font-medium">Seriennummer</th>
                <th className="p-4 text-left font-medium">Raum</th>
                <th className="p-4 text-left font-medium">Status</th>
                <th className="p-4 text-left font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => <DeviceRow key={device.id} device={device} canEdit={canEdit} />)}
              {!devices.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="6">Keine Assets gefunden.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DeviceCard({ device, canEdit }) {
  const [label, classes] = statusLabels[device.status] || statusLabels.AVAILABLE;
  return (
    <article className="p-4">
      <Link to={`/devices/${device.id}`} className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#27272a] text-[#e5e7eb]">
          <Cpu size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-gray-800">{device.inventoryId}</div>
          <div className="mt-1 truncate text-xs text-gray-500">{[device.manufacturer, device.model].filter(Boolean).join(' ')}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
            <span className="truncate rounded-xl bg-[#fafafa] px-2 py-1 font-mono">ID: {device.id}</span>
            <span className="truncate rounded-xl bg-[#fafafa] px-2 py-1">{device.room?.name || 'Kein Raum'}</span>
          </div>
        </div>
        <span className={`badge shrink-0 ${classes}`}>{label}</span>
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link className="btn-secondary min-h-10" to={`/devices/${device.id}`}>Öffnen</Link>
        {canEdit ? <Link className="btn-primary min-h-10" to={`/devices/${device.id}/edit`}>Bearbeiten</Link> : <span />}
      </div>
    </article>
  );
}

function DeviceRow({ device, canEdit }) {
  const [label, classes] = statusLabels[device.status] || statusLabels.AVAILABLE;
  return (
    <tr className="table-row">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#27272a] text-[#e5e7eb]">
            <Cpu size={19} />
          </div>
          <div>
            <div className="font-semibold text-gray-800">{device.inventoryId}</div>
            <div className="text-xs text-gray-500">{[device.manufacturer, device.model].filter(Boolean).join(' ')}</div>
          </div>
        </div>
      </td>
      <td className="p-4 font-mono text-gray-700">{device.id}</td>
      <td className="p-4 text-gray-600">{device.serialNumber || '-'}</td>
      <td className="p-4 text-gray-600">{device.room?.name || '-'}</td>
      <td className="p-4"><span className={`badge ${classes}`}>{label}</span></td>
      <td className="p-4">
        <div className="flex gap-3">
          <Link className="font-medium text-[#e5e7eb]" to={`/devices/${device.id}`}>Öffnen</Link>
          {canEdit && <Link className="font-medium text-gray-600" to={`/devices/${device.id}/edit`}>Bearbeiten</Link>}
        </div>
      </td>
    </tr>
  );
}

function Metric({ label, value, tone = 'purple' }) {
  const tones = {
    purple: 'text-[#e5e7eb]',
    green: 'text-green-600',
    orange: 'text-orange-500',
    red: 'text-red-500'
  };
  return <div className="card p-4"><div className="text-xs font-medium text-gray-500 md:text-sm">{label}</div><div className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</div></div>;
}
