import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { api } from '../api/client';

export default function IssueCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [devices, setDevices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [form, setForm] = useState({ 
    deviceId: searchParams.get('deviceId') || '', 
    title: '', 
    description: '', 
    priority: 'NORMAL' 
  });

  useEffect(() => {
    api.get('/devices')
      .then(res => setDevices(res.data.devices || []))
      .catch(() => setError('Geräte konnten nicht geladen werden.'));
  }, []);

  async function submitReport(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    
    try {
      await api.post('/issues', form);
      navigate('/issues'); // Zurück zur Übersicht nach dem Erstellen
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Fehler konnte nicht gemeldet werden.');
      setSaving(false);
    }
  }

  return (
    <div className="page-enter max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to="/issues" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-[#e5e7eb]">
            <ArrowLeft size={16} /> Zurück zur Übersicht
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">Neues Ticket erstellen</h1>
          <p className="mt-1 text-sm text-gray-500">Beschreibe das Problem so genau wie möglich für die IT.</p>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <form onSubmit={submitReport} className="card p-6 space-y-6">
        <div className="bg-gray-800 text-gray-100 p-4 rounded-xl flex gap-3 items-start border border-gray-700">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            Wenn du einen Fehler für ein Gerät meldest, wird dieses automatisch als <strong>defekt</strong> markiert und kann vorerst nicht mehr ausgeliehen werden.
          </div>
        </div>
        
        <label className="text-sm font-medium text-gray-700 block">1. Welches Gerät ist betroffen?
          <select className="field mt-2" value={form.deviceId} onChange={(event) => setForm({ ...form, deviceId: event.target.value })} required>
            <option value="">Bitte ein Gerät auswählen...</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.inventoryId} {device.model ? `- ${device.model}` : ''}
              </option>
            ))}
          </select>
        </label>
        
        <label className="text-sm font-medium text-gray-700 block">2. Wie dringend ist das Problem?
          <select className="field mt-2" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
            <option value="LOW">Niedrig (Nicht dringend, stört kaum)</option>
            <option value="NORMAL">Normal (Stört beim Arbeiten)</option>
            <option value="HIGH">Hoch (Gerät stark eingeschränkt)</option>
            <option value="CRITICAL">Kritisch (Gerät komplett unbrauchbar)</option>
          </select>
        </label>
        
        <label className="text-sm font-medium text-gray-700 block">3. Kurze Zusammenfassung
          <input className="field mt-2" placeholder="z.B. Bildschirm flackert, Akku lädt nicht..." value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        </label>
        
        <label className="text-sm font-medium text-gray-700 block">4. Genaue Fehlerbeschreibung
          <textarea className="field mt-2 min-h-32" placeholder="Was genau passiert? Wann tritt der Fehler auf? Hast du schon etwas ausprobiert?" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
        </label>
        
        <div className="pt-4 border-t border-black/5 flex justify-end">
          <button className="btn-primary" type="submit" disabled={saving}>
            <Save size={17} /> {saving ? 'Wird gesendet...' : 'Ticket absenden'}
          </button>
        </div>
      </form>
    </div>
  );
}
