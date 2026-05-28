import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { api } from '../api/client';

export default function LoanRequest() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    deviceId: '',
    startDate: '',
    dueDate: '',
    requestReason: '',
    notes: ''
  });

  useEffect(() => {
    api.get('/devices')
      .then(({ data }) => setDevices((data.devices || []).filter((device) => device.status === 'AVAILABLE')))
      .catch(() => setDevices([]));
  }, []);

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/loans/request', form);
      navigate('/loans/my');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Anfrage konnte nicht gesendet werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to="/loans/my" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-200"><ArrowLeft size={16} />Zurück zu meinen Ausleihen</Link>
          <h1 className="text-2xl font-bold text-gray-800">Ausleihe anfragen</h1>
          <p className="mt-1 text-sm text-gray-500">Wähle ein verfügbares Asset, Zeitraum und Grund für deine Anfrage.</p>
        </div>
        <button className="btn-primary" disabled={saving}><Send size={17} />{saving ? 'Sendet...' : 'Anfrage senden'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <Header title="Asset" text="Nur aktuell verfügbare Assets können angefragt werden." />
        <div className="p-5">
          <label className="text-sm font-medium text-gray-700">Asset
            <select className="field mt-1" required value={form.deviceId} onChange={(event) => setValue('deviceId', event.target.value)}>
              <option value="">Asset wählen</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>{device.inventoryId} - {device.model || device.manufacturer || 'Ohne Bezeichnung'}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Zeitraum" text="Gib an, ab wann und bis wann du das Asset brauchst." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field required label="Startdatum" type="date" value={form.startDate} onChange={(value) => setValue('startDate', value)} />
          <Field required label="Rückgabe bis" type="date" value={form.dueDate} onChange={(value) => setValue('dueDate', value)} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Grund" text="Beschreibe kurz, wofür du das Asset benötigst." />
        <div className="grid gap-3 p-5">
          <label className="text-sm font-medium text-gray-700">Grund der Anfrage
            <textarea className="field mt-1" required rows="5" value={form.requestReason} onChange={(event) => setValue('requestReason', event.target.value)} />
          </label>
          <label className="text-sm font-medium text-gray-700">Zusätzliche Hinweise
            <textarea className="field mt-1" rows="4" value={form.notes} onChange={(event) => setValue('notes', event.target.value)} />
          </label>
        </div>
      </section>
    </form>
  );
}

function Header({ title, text }) {
  return <div className="border-b border-black/5 p-5"><div className="font-semibold text-gray-800">{title}</div><div className="mt-1 text-sm text-gray-500">{text}</div></div>;
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return <label className="text-sm font-medium text-gray-700">{label}<input className="field mt-1" required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
