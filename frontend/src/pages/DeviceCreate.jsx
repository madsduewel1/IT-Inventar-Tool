import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../api/client';

const statusLabels = {
  AVAILABLE: 'Verfügbar',
  RESERVED: 'Reserviert',
  DEFECT: 'Defekt',
  MAINTENANCE: 'Wartung',
  RETIRED: 'Ausgemustert'
};

export default function DeviceCreate() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    id: '',
    inventoryId: '',
    serialNumber: '',
    manufacturer: '',
    model: '',
    status: 'AVAILABLE',
    roomId: '',
    purchaseDate: '',
    warrantyEnd: '',
    labels: '',
    description: ''
  });

  useEffect(() => {
    api.get('/rooms').then(({ data }) => setRooms(data.rooms || [])).catch(() => setRooms([]));
    api.get('/devices').then(({ data }) => {
      const devices = data.devices || [];
      const numbers = devices
        .map((d) => parseInt(d.id, 10))
        .filter((n) => !isNaN(n));
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      const nextId = String(max + 1).padStart(3, '0');
      setValue('id', nextId);
    }).catch(() => {});
  }, []);

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    if (!/^\d{3,4}$/.test(form.id)) {
      setError('Die Geräte-ID (Device-ID) muss eine 3- oder 4-stellige Zahl sein (z. B. 001 oder 1000).');
      setSaving(false);
      return;
    }

    if (!form.inventoryId || !form.inventoryId.trim()) {
      setError('Die Inventarnummer darf nicht leer sein.');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        ...form,
        roomId: form.roomId || null,
        purchaseDate: form.purchaseDate || null,
        warrantyEnd: form.warrantyEnd || null,
        labels: form.labels.split(',').map((label) => label.trim()).filter(Boolean)
      };
      const { data } = await api.post('/devices', payload);
      navigate(`/devices/${data.device.id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Asset konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to="/devices" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-[#e5e7eb]"><ArrowLeft size={16} />Zurück zur Liste</Link>
          <h1 className="text-2xl font-bold text-gray-800">Asset anlegen</h1>
          <p className="mt-1 text-sm text-gray-500">Inventardaten, Standort, Zustand und Verwaltungsdetails erfassen.</p>
        </div>
        <button className="btn-primary" disabled={saving}><Save size={17} />{saving ? 'Speichert...' : 'Asset speichern'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <Header title="Identifikation" text="Die dreistellige Geräte-ID wird automatisch vorgeschlagen. Die Inventarnummer ist die Bezeichnung des Geräts." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field required label="Geräte-ID (Device-ID)" value={form.id} onChange={(value) => setValue('id', value)} placeholder="z. B. 001" />
          <Field required label="Inventarnummer (Name)" value={form.inventoryId} onChange={(value) => setValue('inventoryId', value)} placeholder="z. B. NB01-01 oder iPad-S001" />
          <Field label="Hersteller" value={form.manufacturer} onChange={(value) => setValue('manufacturer', value)} />
          <Field label="Modell / Bezeichnung" value={form.model} onChange={(value) => setValue('model', value)} />
          <Field label="Seriennummer" value={form.serialNumber} onChange={(value) => setValue('serialNumber', value)} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Standort und Zustand" text="Diese Angaben steuern Listen, Ausleihe und Hinweise im Dashboard." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">Status
            <select className="field mt-1" value={form.status} onChange={(event) => setValue('status', event.target.value)}>
              {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">Raum
            <select className="field mt-1" value={form.roomId} onChange={(event) => setValue('roomId', event.target.value)}>
              <option value="">Kein Raum</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
          <Field label="Kaufdatum" type="date" value={form.purchaseDate} onChange={(value) => setValue('purchaseDate', value)} />
          <Field label="Garantieende" type="date" value={form.warrantyEnd} onChange={(value) => setValue('warrantyEnd', value)} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Beschreibung" text="Labels mit Komma trennen, zum Beispiel Kamera, HDMI, Medienkoffer." />
        <div className="grid gap-3 p-5">
          <Field label="Labels" value={form.labels} onChange={(value) => setValue('labels', value)} placeholder="Laptop, Lehrergerät, USB-C" />
          <label className="text-sm font-medium text-gray-700">Beschreibung und Hinweise
            <textarea className="field mt-1" rows="7" value={form.description} onChange={(event) => setValue('description', event.target.value)} />
          </label>
        </div>
      </section>
    </form>
  );
}

function Header({ title, text }) {
  return <div className="border-b border-black/5 p-5"><div className="font-semibold text-gray-800">{title}</div><div className="mt-1 text-sm text-gray-500">{text}</div></div>;
}

function Field({ label, value, onChange, type = 'text', placeholder = '', required = false }) {
  return <label className="text-sm font-medium text-gray-700">{label}<input className="field mt-1" required={required} type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
