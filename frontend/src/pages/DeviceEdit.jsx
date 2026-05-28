import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

const statusLabels = {
  AVAILABLE: 'Verfügbar',
  LOANED: 'Verliehen',
  RESERVED: 'Reserviert',
  DEFECT: 'Defekt',
  MAINTENANCE: 'Wartung',
  RETIRED: 'Ausgemustert'
};

export default function DeviceEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
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
    Promise.all([api.get(`/devices/${id}`), api.get('/rooms')])
      .then(([deviceResult, roomsResult]) => {
        const device = deviceResult.data.device;
        setRooms(roomsResult.data.rooms || []);
        setForm({
          inventoryId: device.inventoryId || '',
          serialNumber: device.serialNumber || '',
          manufacturer: device.manufacturer || '',
          model: device.model || '',
          status: device.status || 'AVAILABLE',
          roomId: device.roomId || '',
          purchaseDate: device.purchaseDate?.slice(0, 10) || '',
          warrantyEnd: device.warrantyEnd?.slice(0, 10) || '',
          labels: (device.labels || []).join(', '),
          description: device.description || ''
        });
      })
      .catch(() => setError('Asset konnte nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [id]);

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

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
      await api.patch(`/devices/${id}`, payload);
      navigate(`/devices/${id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Asset konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDevice() {
    if (!window.confirm('Gerät unwiderruflich löschen? Alle zugehörigen Tickets, Ausleihen und Verläufe werden ebenfalls entfernt.')) return;
    try {
      await api.delete(`/devices/${id}`);
      navigate('/devices', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Gerät konnte nicht gelöscht werden.');
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Lade...</div>;

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to={`/devices/${id}`} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-[#e5e7eb]"><ArrowLeft size={16} />Zurück zum Asset</Link>
          <h1 className="text-2xl font-bold text-gray-800">Asset bearbeiten</h1>
          <p className="mt-1 text-sm text-gray-500">Inventardaten, Standort und Zustand aktualisieren.</p>
        </div>
        <button className="btn-primary" disabled={saving}><Save size={17} />{saving ? 'Speichert...' : 'Änderungen speichern'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <Header title="Identifikation" text="Geräte-ID (nicht änderbar), Inventarnummer, Seriennummer und Bezeichnung." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field disabled label="Geräte-ID (Device-ID)" value={id} />
          <Field required label="Inventarnummer (Name)" value={form.inventoryId} onChange={(value) => setValue('inventoryId', value)} />
          <Field label="Hersteller" value={form.manufacturer} onChange={(value) => setValue('manufacturer', value)} />
          <Field label="Modell / Bezeichnung" value={form.model} onChange={(value) => setValue('model', value)} />
          <Field label="Seriennummer" value={form.serialNumber} onChange={(value) => setValue('serialNumber', value)} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Standort und Zustand" text="Status, Raum und Verwaltungsdaten." />
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
        <Header title="Beschreibung" text="Labels mit Komma trennen." />
        <div className="grid gap-3 p-5">
          <Field label="Labels" value={form.labels} onChange={(value) => setValue('labels', value)} />
          <label className="text-sm font-medium text-gray-700">Beschreibung und Hinweise
            <textarea className="field mt-1" rows="7" value={form.description} onChange={(event) => setValue('description', event.target.value)} />
          </label>
        </div>
      </section>

      {user?.role === 'ADMIN' && (
        <div className="pt-4 mt-8 border-t border-red-100 flex justify-end">
          <button type="button" onClick={deleteDevice} className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 w-full md:w-auto">
            Gerät endgültig löschen
          </button>
        </div>
      )}
    </form>
  );
}

function Header({ title, text }) {
  return <div className="border-b border-black/5 p-5"><div className="font-semibold text-gray-800">{title}</div><div className="mt-1 text-sm text-gray-500">{text}</div></div>;
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return <label className="text-sm font-medium text-gray-700">{label}<input className="field mt-1" required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
