import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import DeviceAssignment from '../components/DeviceAssignment';
import { STATUS_LABELS as statusLabels } from '../components/deviceMeta';

export default function DeviceCreate() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Formular-State: Alle Felder inkl. IP/MAC-Adresse und der Schalter für Ausleihbar/Meldbar.
  // isLendable/isReportable steuern, ob das Gerät ausgeliehen bzw. gemeldet werden kann.
  const [form, setForm] = useState({
    id: '',
    inventoryId: '',
    serialNumber: '',
    manufacturer: '',
    model: '',
    status: 'AVAILABLE',
    defectNote: '',
    ipAddress: '',
    macAddress: '',
    isLendable: false,
    isReportable: false,
    updatesEnabled: false,
    roomId: '',
    purchaseDate: '',
    warrantyEnd: '',
    labels: '',
    description: '',
    // Zuordnung/Sichtbarkeit (Konzept „Mein Gerät")
    category: 'OTHER',
    hostname: '',
    icon: '',
    visibility: 'ALL',
    areaId: '',
    adminId: ''
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

    if (!/^[a-zA-Z0-9_-]{3,50}$/.test(form.id)) {
      setError('Die Geräte-ID muss 3 bis 50 alphanumerische Zeichen lang sein.');
      setSaving(false);
      return;
    }

    if (!form.inventoryId || !form.inventoryId.trim()) {
      setError('Die Inventarnummer darf nicht leer sein.');
      setSaving(false);
      return;
    }

    if (form.status === 'DEFECT' && !form.defectNote.trim()) {
      setError('Bitte beschreiben, was defekt ist.');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        ...form,
        defectNote: form.status === 'DEFECT' ? form.defectNote.trim() : null,
        roomId: form.roomId || null,
        purchaseDate: form.purchaseDate || null,
        warrantyEnd: form.warrantyEnd || null,
        areaId: form.areaId || null,
        adminId: form.adminId || null,
        icon: form.icon || null,
        hostname: form.hostname || null,
        labels: form.labels.split(',').map((label) => label.trim()).filter(Boolean)
      };
      const { data } = await api.post('/devices', payload);
      navigate(`/devices?id=${data.device.id}`);
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
          <Link to="/devices" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main"><ArrowLeft size={16} />Zurück zur Liste</Link>
          <h1 className="text-2xl font-bold text-gray-800">Asset anlegen</h1>
          <p className="mt-1 text-sm text-gray-500">Inventardaten, Standort, Zustand und Verwaltungsdetails erfassen.</p>
        </div>
        <button className="btn-primary" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}{saving ? 'Speichert...' : 'Asset speichern'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <Header title="Identifikation" text="Die dreistellige Geräte-ID wird automatisch vorgeschlagen. Die Inventarnummer ist die Bezeichnung des Geräts." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field required label="Geräte-ID (Device-ID)" value={form.id} onChange={(value) => setValue('id', value)} placeholder="z. B. 001" />
          <Field required label="Inventarnummer (Name)" value={form.inventoryId} onChange={(value) => setValue('inventoryId', value)} placeholder="z. B. NB01-01 oder iPad-S001" />
          <Field required label="Hersteller" value={form.manufacturer} onChange={(value) => setValue('manufacturer', value)} />
          <Field required label="Modell / Bezeichnung" value={form.model} onChange={(value) => setValue('model', value)} />
          <Field label="Seriennummer" value={form.serialNumber} onChange={(value) => setValue('serialNumber', value)} />
          {/* Netzwerkinformationen – IP und MAC werden in der Geräteliste und Detailseite angezeigt */}
          <Field label="IP-Adresse" value={form.ipAddress} onChange={(value) => setValue('ipAddress', value)} placeholder="z. B. 192.168.1.100" />
          <Field label="MAC-Adresse" value={form.macAddress} onChange={(value) => setValue('macAddress', value)} placeholder="z. B. AA:BB:CC:DD:EE:FF" />
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
          {form.status === 'DEFECT' && (
            <label className="text-sm font-medium text-gray-700 md:col-span-2">Was ist defekt? <span className="text-red-500">*</span>
              <textarea
                className="field mt-1 min-h-20 resize-y"
                required
                value={form.defectNote}
                onChange={(event) => setValue('defectNote', event.target.value)}
                placeholder="Kurz beschreiben, was defekt ist. Wird Benutzern angezeigt, ohne ein Ticket zu erstellen."
              />
            </label>
          )}
          <label className="text-sm font-medium text-gray-700">Raum
            <select className="field mt-1" value={form.roomId} onChange={(event) => setValue('roomId', event.target.value)}>
              <option value="">Kein Raum</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
          {/* Schalter 'Ausleihbar': Wenn deaktiviert, wird die Ausleihe im Backend abgewiesen (DEVICE_NOT_LENDABLE) */}
          <label className="text-sm font-medium text-gray-700">Ausleihbar
            <div className="mt-1 flex items-center gap-3">
              <button type="button" className={`relative h-6 w-11 rounded-full transition-colors ${form.isLendable ? 'bg-emerald-500' : 'bg-gray-300'}`} onClick={() => setValue('isLendable', !form.isLendable)}>
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.isLendable ? 'translate-x-5' : ''}`} />
              </button>
              <span className="text-sm text-gray-600">{form.isLendable ? 'Ja' : 'Nein'}</span>
            </div>
          </label>
          {/* Schalter 'Meldbar': Wenn deaktiviert, können keine Fehler/Tickets für dieses Gerät erstellt werden (DEVICE_NOT_REPORTABLE) */}
          <label className="text-sm font-medium text-gray-700">Meldbar (Fehler melden)
            <div className="mt-1 flex items-center gap-3">
              <button type="button" className={`relative h-6 w-11 rounded-full transition-colors ${form.isReportable ? 'bg-emerald-500' : 'bg-gray-300'}`} onClick={() => setValue('isReportable', !form.isReportable)}>
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.isReportable ? 'translate-x-5' : ''}`} />
              </button>
              <span className="text-sm text-gray-600">{form.isReportable ? 'Ja' : 'Nein'}</span>
            </div>
          </label>
          {/* Schalter 'Updates': Steuert, ob das Gerät an den System-Updates teilnimmt */}
          <label className="text-sm font-medium text-gray-700">An Updates teilnehmen
            <div className="mt-1 flex items-center gap-3">
              <button type="button" className={`relative h-6 w-11 rounded-full transition-colors ${form.updatesEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`} onClick={() => setValue('updatesEnabled', !form.updatesEnabled)}>
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.updatesEnabled ? 'translate-x-5' : ''}`} />
              </button>
              <span className="text-sm text-gray-600">{form.updatesEnabled ? 'Ja' : 'Nein'}</span>
            </div>
          </label>
          <Field label="Kaufdatum" type="date" value={form.purchaseDate} onChange={(value) => setValue('purchaseDate', value)} />
          <Field label="Garantieende" type="date" value={form.warrantyEnd} onChange={(value) => setValue('warrantyEnd', value)} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Zuordnung und Sichtbarkeit" text="Bereich, zuständiger Administrator, Symbol und wer das Gerät sehen darf." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <DeviceAssignment form={form} setValue={setValue} />
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
  return <label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}<input className="field mt-1" required={required} type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
