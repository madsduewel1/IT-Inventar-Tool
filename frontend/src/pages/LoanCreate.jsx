import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../api/client';

export default function LoanCreate() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    deviceId: '',
    customAssetName: '',
    borrowerName: '',
    borrowerContact: '',
    borrowerGroup: '',
    dueDate: '',
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
      await api.post('/loans', form);
      navigate('/loans');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Ausleihe konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to="/loans" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-[#e5e7eb]"><ArrowLeft size={16} />Zurück zur Ausleihe</Link>
          <h1 className="text-2xl font-bold text-gray-800">Ausleihe anlegen</h1>
          <p className="mt-1 text-sm text-gray-500">Asset auswählen und freie Ausleiherdaten erfassen.</p>
        </div>
        <button className="btn-primary" disabled={saving}><Save size={17} />{saving ? 'Speichert...' : 'Ausleihe speichern'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <Header title="Asset" text="Wähle ein verfügbares Asset oder 'Anderes' für eine freie manuelle Eingabe." />
        <div className="grid gap-3 p-5">
          <label className="text-sm font-medium text-gray-700">Asset
            <select className="field mt-1" required value={form.deviceId} onChange={(event) => setValue('deviceId', event.target.value)}>
              <option value="">Asset wählen</option>
              {devices.map((device) => <option key={device.id} value={device.id}>{device.inventoryId} · {device.model || device.manufacturer || 'Ohne Bezeichnung'}</option>)}
              <option value="other">Anderes (individuelle Bezeichnung)</option>
            </select>
          </label>

          {form.deviceId === 'other' && (
            <div className="mt-2 space-y-2">
              <Field required label="Bezeichnung des anderen Assets" value={form.customAssetName} onChange={(value) => setValue('customAssetName', value)} placeholder="z. B. 5x HDMI Kabel, E-Bike Schlüssel, Adapter..." />
            </div>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Ausleiher" text="Der Ausleiher muss kein Benutzerkonto im System haben." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field required label="Name" value={form.borrowerName} onChange={(value) => setValue('borrowerName', value)} placeholder="Vor- und Nachname" />
          <Field label="Kontakt" value={form.borrowerContact} onChange={(value) => setValue('borrowerContact', value)} placeholder="E-Mail, Telefon oder Kürzel" />
          <Field label="Klasse / Gruppe / Einrichtung" value={form.borrowerGroup} onChange={(value) => setValue('borrowerGroup', value)} />
          <Field required label="Rückgabe bis" type="date" value={form.dueDate} onChange={(value) => setValue('dueDate', value)} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Notizen" text="Zubehör, Zustand bei Ausgabe oder besondere Vereinbarungen." />
        <div className="p-5">
          <textarea className="field" rows="6" value={form.notes} onChange={(event) => setValue('notes', event.target.value)} />
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
