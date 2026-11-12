import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail, MailCheck, AlertCircle, Save, User, Clock, Search } from 'lucide-react';
import { api } from '../api/client';
import { PageLoader } from '../components/Loading';
import { ISSUE_TYPES } from '../components/issueMeta';

const priorities = [
  { value: 'LOW', label: 'Niedrig (Nicht dringend, stört kaum)' },
  { value: 'NORMAL', label: 'Normal (Stört beim Arbeiten)' },
  { value: 'HIGH', label: 'Hoch (Gerät stark eingeschränkt)' },
  { value: 'CRITICAL', label: 'Kritisch (Gerät komplett unbrauchbar)' }
];

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EmailToTicket() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mailId = searchParams.get('id');

  const [mail, setMail] = useState(null);
  const [devices, setDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    type: 'DEVICE',
    deviceIds: [],
    roomName: '',
    softwareName: '',
    title: '',
    description: '',
    priority: 'NORMAL',
    assigneeId: ''
  });

  const [deviceQuery, setDeviceQuery] = useState('');

  const filteredDevices = devices
    .filter((device) => device.isReportable !== false)
    .filter((device) => {
      const q = deviceQuery.toLowerCase().trim();
      if (!q) return true;
      return [device.inventoryId, device.model, device.manufacturer, device.serialNumber, device.room?.name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q));
    });

  function toggleDevice(deviceId) {
    setForm((f) => ({
      ...f,
      deviceIds: f.deviceIds.includes(deviceId)
        ? f.deviceIds.filter((id) => id !== deviceId)
        : [...f.deviceIds, deviceId]
    }));
  }

  useEffect(() => {
    if (!mailId) {
      setError('Keine E-Mail-ID übergeben.');
      setLoading(false);
      return;
    }

    Promise.all([
      api.get(`/inbound-mail/${mailId}`).then(res => res.data.mail),
      api.get('/devices').then(res => res.data.devices || []).catch(() => []),
      api.get('/rooms').then(res => res.data.rooms || []).catch(() => []),
      api.get('/issues/assignees').then(res => res.data.assignees || []).catch(() => [])
    ])
      .then(([loadedMail, loadedDevices, loadedRooms, loadedAssignees]) => {
        setMail(loadedMail);
        setDevices(loadedDevices);
        setRooms(loadedRooms);
        setAssignees(loadedAssignees);
        setForm(prev => ({
          ...prev,
          title: loadedMail.subject || '',
          description: loadedMail.body || ''
        }));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'E-Mail konnte nicht geladen werden.');
        setLoading(false);
      });
  }, [mailId]);

  function validateForm() {
    if (!form.title.trim()) {
      setError('Bitte einen Ticket-Titel eingeben.');
      return false;
    }
    if (form.type === 'DEVICE' && form.deviceIds.length === 0) {
      setError('Bitte mindestens ein betroffenes Gerät auswählen.');
      return false;
    }
    if (form.type === 'WLAN' && !form.roomName.trim()) {
      setError('Bitte einen Raum angeben.');
      return false;
    }
    if (form.type === 'SOFTWARE' && !form.softwareName.trim()) {
      setError('Bitte die Software angeben.');
      return false;
    }
    return true;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    setError('');

    try {
      const { data } = await api.post(`/inbound-mail/${mailId}/convert`, {
        type: form.type,
        deviceIds: form.type === 'DEVICE' ? form.deviceIds : undefined,
        roomName: form.type === 'WLAN' ? form.roomName.trim() : undefined,
        softwareName: form.type === 'SOFTWARE' ? form.softwareName.trim() : undefined,
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        assigneeId: form.assigneeId || null
      });

      if (data?.issue?.id) {
        navigate(`/issues?id=${data.issue.id}`);
      } else {
        navigate('/email-support');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Erstellen des Tickets.');
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoader className="min-h-60" text="Lade E-Mail-Daten…" />;
  }

  if (error && !mail) {
    return (
      <div className="page-enter max-w-3xl mx-auto space-y-6">
        <Link to="/email-support" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main">
          <ArrowLeft size={16} /> Zurück zum E-Mail-Support
        </Link>
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <Link to="/email-support" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main">
          <ArrowLeft size={16} /> Zurück zum E-Mail-Support
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-zinc-100 flex items-center gap-2">
          <MailCheck className="text-blue-500" size={24} />
          E-Mail in Ticket umwandeln
        </h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          Überprüfe die E-Mail-Daten, weise die betroffenen Geräte zu und erstelle das Fehlerticket.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Original E-Mail Vorschau */}
      <section className="card space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-zinc-200">
            <Mail size={16} className="text-blue-500" />
            Original-E-Mail
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={13} />
            {fmtDate(mail?.receivedAt)}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">Absender:</span>
            <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-zinc-200">
              <User size={14} className="text-gray-400" />
              <span>{mail?.fromName ? `${mail.fromName} (${mail.fromAddr})` : mail?.fromAddr}</span>
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">Original-Betreff:</span>
            <span className="font-medium text-gray-800 dark:text-zinc-200">{mail?.subject || '(Kein Betreff)'}</span>
          </div>
        </div>

        <div>
          <span className="text-xs text-gray-400 block mb-1">E-Mail-Nachricht:</span>
          <div className="rounded-xl bg-[#fafafa] dark:bg-zinc-900/60 border border-black/5 dark:border-white/5 p-3.5 text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed font-sans">
            {mail?.body || '(Kein Textinhalt)'}
          </div>
        </div>
      </section>

      {/* Ticket-Formular */}
      <form onSubmit={handleSubmit} className="card space-y-5 p-4 sm:space-y-6 sm:p-6">
        <div className="bg-blue-50/50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 p-4 rounded-xl flex gap-3 items-start border border-blue-100 dark:border-blue-900/30">
          <AlertCircle size={20} className="shrink-0 mt-0.5 text-blue-500" />
          <div className="text-sm leading-relaxed">
            Nach der Freigabe wird das Ticket erstellt. Bei Schulgeräten wird deren Status automatisch auf <strong>defekt</strong> gesetzt, sofern sie verfügbar sind. Du kannst mehrere Geräte zuordnen. Ein Privat-/Dienstgeräte-, WLAN- oder Software-Ticket wird ohne Inventarverknüpfung angelegt.
          </div>
        </div>

        {/* Ticketart wählen */}
        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
          Ticketart <span className="text-red-500">*</span>
          <select
            className="field mt-2"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {ISSUE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        {form.type === 'DEVICE' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                Welche Geräte sind betroffen? <span className="text-red-500">*</span>
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400">{form.deviceIds.length} ausgewählt</span>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
              <input
                className="field pl-9"
                placeholder="Geräte suchen… (Inventarnummer, Modell, Raum)"
                value={deviceQuery}
                onChange={(e) => setDeviceQuery(e.target.value)}
              />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-black/10 dark:border-zinc-700 divide-y divide-black/5 dark:divide-zinc-700">
              {filteredDevices.length === 0 && (
                <div className="p-6 text-center text-sm text-gray-400">Kein Gerät gefunden.</div>
              )}
              {filteredDevices.map((dev) => {
                const active = form.deviceIds.includes(dev.id);
                return (
                  <label
                    key={dev.id}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition ${
                      active ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-[#fafafa] dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 accent-gray-900"
                      checked={active}
                      onChange={() => toggleDevice(dev.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-gray-800 dark:text-zinc-200 text-sm">
                        {dev.inventoryId}
                        {dev.model ? <span className="font-normal text-gray-500 dark:text-zinc-400"> – {dev.model}</span> : null}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                        {[dev.manufacturer, dev.room?.name].filter(Boolean).join(' · ') || 'Keine weiteren Angaben'}
                      </span>
                    </span>
                    {active && <CheckCircle2 size={18} className="text-blue-600 shrink-0 mt-1" />}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {form.type === 'WLAN' && (
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
            In welchem Raum besteht das Problem? <span className="text-red-500">*</span>
            <input
              className="field mt-2"
              list="wlan-room-suggestions"
              placeholder="Raumname eingeben, z. B. IF01, Bibliothek oder Werkstatt…"
              value={form.roomName}
              onChange={(e) => setForm({ ...form, roomName: e.target.value })}
              required
            />
            <datalist id="wlan-room-suggestions">
              {rooms.map((room) => <option key={room.id} value={room.name} />)}
            </datalist>
          </label>
        )}

        {form.type === 'SOFTWARE' && (
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
            Welche Software ist betroffen? <span className="text-red-500">*</span>
            <input
              className="field mt-2"
              placeholder="z. B. Microsoft Word, IServ, Browser…"
              value={form.softwareName}
              onChange={(e) => setForm({ ...form, softwareName: e.target.value })}
              required
            />
          </label>
        )}

        {form.type === 'PERSONAL' && (
          <div className="rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-black/5 dark:border-zinc-700 px-4 py-3 text-sm text-gray-500 dark:text-zinc-400 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            Privat-/Dienstgeräte-Tickets werden ohne Inventarverknüpfung erstellt.
          </div>
        )}

        {/* Priorität & Zuweisung */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
            Dringlichkeit / Priorität
            <select
              className="field mt-2"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {priorities.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
            Zuweisen an (zuständige Person, optional)
            <select
              className="field mt-2"
              value={form.assigneeId}
              onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
            >
              <option value="">— Nicht zugewiesen —</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName || a.username}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Titel */}
        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
          Ticket-Titel <span className="text-red-500">*</span>
          <input
            className="field mt-2"
            placeholder="z. B. Bildschirm flackert, WLAN ausgefallen, Word startet nicht..."
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </label>

        {/* Beschreibung */}
        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
          Fehlerbeschreibung <span className="text-red-500">*</span>
          <textarea
            className="field mt-2 min-h-32 leading-relaxed"
            placeholder="Fehlerbeschreibung für die IT..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
        </label>

        {/* Buttons */}
        <div className="pt-4 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/email-support')}
            className="btn-secondary"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={saving}
          >
            <CheckCircle2 size={17} />
            {saving ? 'Wird erstellt...' : 'Ticket erstellen & freigeben'}
          </button>
        </div>
      </form>
    </div>
  );
}
