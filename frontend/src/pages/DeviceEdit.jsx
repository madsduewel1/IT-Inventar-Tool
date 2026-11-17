import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../components/ConfirmDialog';
import { PageLoader } from '../components/Loading';
import DeviceAssignment from '../components/DeviceAssignment';
import { STATUS_LABELS as statusLabels } from '../components/deviceMeta';

export default function DeviceEdit() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Formular-State für die Bearbeitung – initialisiert mit den aktuellen Device-Daten.
  // isLendable/isReportable werden als Boolean-Toggles dargestellt.
  const [form, setForm] = useState({
    inventoryId: '',
    serialNumber: '',
    manufacturer: '',
    model: '',
    status: 'AVAILABLE',
    statusLocked: false,
    defectNote: '',
    ipAddress: '',
    macAddress: '',
    isLendable: true,
    isReportable: true,
    updatesEnabled: true,
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
          statusLocked: Boolean(device.statusLocked),
          defectNote: device.defectNote || '',
          ipAddress: device.ipAddress || '',
          macAddress: device.macAddress || '',
          isLendable: device.isLendable ?? true,
          isReportable: device.isReportable ?? true,
          updatesEnabled: device.updatesEnabled ?? true,
          roomId: device.roomId || '',
          purchaseDate: device.purchaseDate?.slice(0, 10) || '',
          warrantyEnd: device.warrantyEnd?.slice(0, 10) || '',
          labels: (device.labels || []).join(', '),
          description: device.description || '',
          category: device.category || 'OTHER',
          hostname: device.hostname || '',
          icon: device.icon || '',
          visibility: device.visibility || 'ALL',
          areaId: device.areaId || '',
          adminId: device.adminId || ''
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
      await api.patch(`/devices/${id}`, payload);
      navigate(`/devices?id=${encodeURIComponent(id)}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Asset konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDevice() {
    const ok = await confirm({
      title: 'Gerät löschen',
      message: 'Gerät unwiderruflich löschen? Alle zugehörigen Tickets, Ausleihen und Verläufe werden ebenfalls entfernt.',
      tone: 'danger',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    try {
      await api.delete(`/devices/${id}`);
      navigate('/devices', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Gerät konnte nicht gelöscht werden.');
    }
  }

  if (loading) return <PageLoader className="min-h-64" text="Lade Gerät…" />;

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to={`/devices?id=${encodeURIComponent(id)}`} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main"><ArrowLeft size={16} />Zurück zum Asset</Link>
          <h1 className="text-2xl font-bold text-gray-800">Asset bearbeiten</h1>
          <p className="mt-1 text-sm text-gray-500">Inventardaten, Standort und Zustand aktualisieren.</p>
        </div>
        <button className="btn-primary" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}{saving ? 'Speichert...' : 'Änderungen speichern'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <Header title="Identifikation" text="Geräte-ID (nicht änderbar), Inventarnummer, Seriennummer und Bezeichnung." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field disabled label="Geräte-ID (Device-ID)" value={id} />
          <Field required label="Inventarnummer (Name)" value={form.inventoryId} onChange={(value) => setValue('inventoryId', value)} />
          <Field required label="Hersteller" value={form.manufacturer} onChange={(value) => setValue('manufacturer', value)} />
          <Field required label="Modell / Bezeichnung" value={form.model} onChange={(value) => setValue('model', value)} />
          <Field label="Seriennummer" value={form.serialNumber} onChange={(value) => setValue('serialNumber', value)} />
          {/* Netzwerkinformationen – IP und MAC-Adresse des Geräts */}
          <Field label="IP-Adresse" value={form.ipAddress} onChange={(value) => setValue('ipAddress', value)} />
          <Field label="MAC-Adresse" value={form.macAddress} onChange={(value) => setValue('macAddress', value)} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Standort und Zustand" text="Status, Raum und Verwaltungsdaten." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">Status
            <select className="field mt-1" value={form.status} onChange={(event) => setValue('status', event.target.value)}>
              {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <span className="mt-2 flex items-start gap-2 text-xs font-normal text-gray-500">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.statusLocked}
                onChange={(event) => setValue('statusLocked', event.target.checked)}
              />
              Status vor automatischen Ticket-Änderungen schützen
            </span>
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
          {/* Schalter 'Ausleihbar' – deaktiviert verhindert Ausleihe (DEVICE_NOT_LENDABLE im Backend) */}
          <label className="text-sm font-medium text-gray-700">Ausleihbar
            <div className="mt-1 flex items-center gap-3">
              <button type="button" className={`relative h-6 w-11 rounded-full transition-colors ${form.isLendable ? 'bg-emerald-500' : 'bg-gray-300'}`} onClick={() => setValue('isLendable', !form.isLendable)}>
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.isLendable ? 'translate-x-5' : ''}`} />
              </button>
              <span className="text-sm text-gray-600">{form.isLendable ? 'Ja' : 'Nein'}</span>
            </div>
          </label>
          {/* Schalter 'Meldbar' – deaktiviert verhindert Fehlermeldungen (DEVICE_NOT_REPORTABLE im Backend) */}
          <label className="text-sm font-medium text-gray-700">Meldbar (Fehler melden)
            <div className="mt-1 flex items-center gap-3">
              <button type="button" className={`relative h-6 w-11 rounded-full transition-colors ${form.isReportable ? 'bg-emerald-500' : 'bg-gray-300'}`} onClick={() => setValue('isReportable', !form.isReportable)}>
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.isReportable ? 'translate-x-5' : ''}`} />
              </button>
              <span className="text-sm text-gray-600">{form.isReportable ? 'Ja' : 'Nein'}</span>
            </div>
          </label>
          {/* Schalter 'Updates' – deaktiviert schließt Gerät von automatischen Updates aus */}
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
        <Header title="Beschreibung" text="Labels mit Komma trennen." />
        <div className="grid gap-3 p-5">
          <Field label="Labels" value={form.labels} onChange={(value) => setValue('labels', value)} />
          <label className="text-sm font-medium text-gray-700">Beschreibung und Hinweise
            <textarea className="field mt-1" rows="7" value={form.description} onChange={(event) => setValue('description', event.target.value)} />
          </label>
        </div>
      </section>

      {((user?.effectiveRole || user?.role) === 'ADMIN' || user?.effectivePermissions?.includes('DEVICE_DELETE')) && (
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

function Field({ label, value, onChange, type = 'text', required = false, disabled = false }) {
  return <label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}<input className={`field mt-1 ${disabled ? 'cursor-not-allowed bg-gray-100 text-gray-500 opacity-70' : ''}`} required={required} disabled={disabled} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
