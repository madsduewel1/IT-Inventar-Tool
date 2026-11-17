import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../api/client';

export default function LoanCreate() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [users, setUsers] = useState([]);
  const [areas, setAreas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    deviceId: '',
    areaId: '',
    customAssetName: '',
    userId: '',
    borrowerName: '',
    borrowerContact: '',
    borrowerGroup: '',
    dueDate: '',
    notes: ''
  });

  useEffect(() => {
    api.get('/devices')
      .then(({ data }) => setDevices((data.devices || []).filter((device) => device.status === 'AVAILABLE' && device.isLendable)))
      .catch(() => setDevices([]));
    api.get('/users/list')
      .then(({ data }) => setUsers(data.users || []))
      .catch(() => setUsers([]));
    api.get('/areas')
      .then(({ data }) => setAreas(data.areas || []))
      .catch(() => setAreas([]));
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
          <Link to="/loans" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main"><ArrowLeft size={16} />Zurück zur Ausleihe</Link>
          <h1 className="text-2xl font-bold text-gray-800">Ausleihe anlegen</h1>
          <p className="mt-1 text-sm text-gray-500">Asset auswählen und freie Ausleiherdaten erfassen.</p>
        </div>
        <button className="btn-primary" disabled={saving}><Save size={17} />{saving ? 'Speichert...' : 'Ausleihe speichern'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <Header title="Asset" text="Wähle ein verfügbares Asset oder 'Anderes' für eine freie manuelle Eingabe." />
        <div className="grid gap-3 p-5">
          <label className="text-sm font-medium text-gray-700">Asset <span className="text-red-500">*</span>
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

          <label className="text-sm font-medium text-gray-700 md:col-span-2">Gerätebereich (optional)
            <select className="field mt-1" value={form.areaId} onChange={(event) => setValue('areaId', event.target.value)}>
              <option value="">Automatisch (Bereich des Assets)</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </label>
          {form.areaId && (
            <p className="text-xs text-gray-500">Das gewählte Asset muss diesem Bereich angehören, sonst lehnt die Verwaltung die Ausleihe ab.</p>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Ausleiher" text="Wähle ein System-Konto aus oder trage die Daten manuell ein." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 md:col-span-2">System-Benutzerkonto (optional)
            <select className="field mt-1" value={form.userId} onChange={(e) => {
              const uId = e.target.value;
              if (uId) {
                const selectedUser = users.find(u => u.id === uId);
                setForm(current => ({
                  ...current,
                  userId: uId,
                  borrowerName: selectedUser.displayName || selectedUser.username,
                  borrowerContact: selectedUser.email || ''
                }));
              } else {
                setForm(current => ({
                  ...current,
                  userId: '',
                  borrowerName: '',
                  borrowerContact: ''
                }));
              }
              setError('');
            }}>
              <option value="">Manuelle Eingabe / Kein Konto</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.displayName || u.username} {u.email ? `(${u.email})` : ''}</option>
              ))}
            </select>
          </label>
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
  return <label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}<input className="field mt-1" required={required} type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
