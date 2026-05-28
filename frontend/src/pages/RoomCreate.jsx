import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../api/client';

const roomTypes = {
  STORAGE: 'Lager',
  CLASSROOM: 'Klassenraum',
  STUDIO: 'Studio',
  WORKSHOP: 'Werkstatt',
  SERVERROOM: 'Serverraum',
  OTHER: 'Sonstiges'
};

export default function RoomCreate() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', building: '', type: 'OTHER', description: '' });

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/rooms', form);
      navigate('/rooms');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Raum konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to="/rooms" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-[#e5e7eb]"><ArrowLeft size={16} />Zurück zu Räumen</Link>
          <h1 className="text-2xl font-bold text-gray-800">Raum anlegen</h1>
          <p className="mt-1 text-sm text-gray-500">Standort, Gebäudeteil und Beschreibung erfassen.</p>
        </div>
        <button className="btn-primary" disabled={saving}><Save size={17} />{saving ? 'Speichert...' : 'Raum speichern'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field required label="Name" value={form.name} onChange={(value) => setValue('name', value)} />
          <Field label="Gebäude" value={form.building} onChange={(value) => setValue('building', value)} />
          <label className="text-sm font-medium text-gray-700 md:col-span-2">Raumtyp
            <select className="field mt-1" value={form.type} onChange={(event) => setValue('type', event.target.value)}>
              {Object.entries(roomTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 md:col-span-2">Beschreibung
            <textarea className="field mt-1" rows="6" value={form.description} onChange={(event) => setValue('description', event.target.value)} />
          </label>
        </div>
      </section>
    </form>
  );
}

function Field({ label, value, onChange, required = false }) {
  return <label className="text-sm font-medium text-gray-700">{label}<input className="field mt-1" required={required} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
