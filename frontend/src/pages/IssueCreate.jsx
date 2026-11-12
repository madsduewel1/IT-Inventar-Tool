import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Search, Paperclip, X, AlertCircle, CheckCircle2, Monitor, User, Wifi, AppWindow, CheckCheck } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { ISSUE_TYPES } from '../components/issueMeta';

const TYPE_ICONS = { Monitor, User, Wifi, AppWindow };

const SOFTWARE_SUGGESTIONS = ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Browser', 'IServ', 'Schulsoftware'];

const MAX_DEVICES = 50;

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Unwichtig' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'Störend' },
  { value: 'CRITICAL', label: 'Kritisch' }
];

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function IssueCreate({ mode = 'self' }) {
  const isCapture = mode === 'capture';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || '';
  // Geräte-Vorauswahl aus der URL (z. B. „Fehler melden" auf der Geräteseite)
  const initialDeviceId = searchParams.get('deviceId') || '';
  const { user } = useAuth();
  // Tickets gehören IT und Administratoren. Nur diese dürfen sich selbst als
  // zuständig eintragen – Viewer'sche Tickets starten daher ohne Bearbeiter.
  const canTakeOwnership = ['STAFF', 'ADMIN'].includes(user?.effectiveRole || user?.role);

  const [type, setType] = useState(ISSUE_TYPES.some((t) => t.value === initialType) ? initialType : '');
  const [devices, setDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [deviceQuery, setDeviceQuery] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState(() => {
    const empty = {
      title: '',
      description: '',
      priority: 'NORMAL',
      reporterId: '',
      deviceIds: [],
      roomName: '',
      softwareName: ''
    };
    if (isCapture) return empty;
    try {
      const raw = sessionStorage.getItem('issue-draft');
      if (!raw) return empty;
      const saved = JSON.parse(raw);
      return {
        ...empty,
        ...saved,
        deviceIds: Array.isArray(saved.deviceIds) ? saved.deviceIds : []
      };
    } catch {
      return empty;
    }
  });
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    if (isCapture) {
      api.get('/users/list')
        .then((res) => setUsers(res.data.users || []))
        .catch(() => setUsers([]));
    }
  }, [isCapture]);

  // Entwurf im Browser zwischenspeichern, damit ein versehentliches Neuladen
  // oder ein Wechsel der Ticketart die Eingaben nicht verwirft.
  useEffect(() => {
    if (isCapture) return;
    try {
      sessionStorage.setItem('issue-draft', JSON.stringify(form));
    } catch {
      // Speicher voll oder deaktiviert – Entwurf ist nur eine Komfortfunktion.
    }
  }, [form, isCapture]);

  useEffect(() => {
    api.get('/issue-templates')
      .then((res) => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]));
  }, []);

  // Gerät aus der URL übernehmen, sobald die Geräteliste geladen ist.
  useEffect(() => {
    if (!initialDeviceId || type !== 'DEVICE' || devices.length === 0) return;
    setForm((f) => (f.deviceIds.includes(initialDeviceId) ? f : { ...f, deviceIds: [...f.deviceIds, initialDeviceId] }));
  }, [initialDeviceId, type, devices]);

  useEffect(() => {
    if (!type) return;
    if (type === 'DEVICE') {
      setLoadingMeta(true);
      api.get('/devices')
        .then(res => setDevices(res.data.devices || []))
        .catch(() => setError('Geräte konnten nicht geladen werden.'))
        .finally(() => setLoadingMeta(false));
    }
    if (type === 'WLAN') {
      setLoadingMeta(true);
      api.get('/rooms')
        .then(res => setRooms(res.data.rooms || []))
        .catch(() => setError('Räume konnten nicht geladen werden.'))
        .finally(() => setLoadingMeta(false));
    }
  }, [type]);

  const typeMeta = ISSUE_TYPES.find((t) => t.value === type);
  const TypeIcon = type ? TYPE_ICONS[typeMeta.icon] : null;

  const filteredDevices = devices.filter((device) => {
    const q = deviceQuery.toLowerCase().trim();
    if (!q) return true;
    return [device.inventoryId, device.model, device.manufacturer, device.serialNumber, device.room?.name]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(q));
  });

  const selectedDevices = form.deviceIds
    .map((id) => devices.find((d) => d.id === id))
    .filter(Boolean)
    .sort((a, b) => (a.inventoryId || '').localeCompare(b.inventoryId || '', 'de'));

  const primaryDevice = selectedDevices[0] || null;
  const availableTemplates = templates.filter((template) => {
    if (template.type && template.type !== type) return false;
    if (template.areaId) {
      if (type !== 'DEVICE') return false;
      return primaryDevice?.areaId === template.areaId;
    }
    return true;
  });
  const selectedTemplate = availableTemplates.find((template) => template.id === templateId) || null;
  const fieldHelp = selectedTemplate?.fieldHelp || {};
  const attachmentsAllowed = selectedTemplate?.attachmentsAllowed !== false;
  const maxAttachments = Math.min(10, selectedTemplate?.maxAttachments ?? 10);

  useEffect(() => {
    if (!templateId) return;
    if (!availableTemplates.some((template) => template.id === templateId)) setTemplateId('');
  }, [templateId, availableTemplates]);

  function toggleDevice(deviceId) {
    setForm((f) => {
      const selected = f.deviceIds.includes(deviceId);
      if (!selected && f.deviceIds.length >= MAX_DEVICES) return f;
      return {
        ...f,
        deviceIds: selected
          ? f.deviceIds.filter((id) => id !== deviceId)
          : [...f.deviceIds, deviceId]
      };
    });
  }

  const selectableDevices = filteredDevices.filter((device) => device.isReportable !== false);
  const allFilteredSelected = selectableDevices.length > 0 && selectableDevices.every((device) => form.deviceIds.includes(device.id));

  function toggleAllFiltered() {
    setForm((f) => {
      if (allFilteredSelected) {
        const visible = new Set(selectableDevices.map((device) => device.id));
        return { ...f, deviceIds: f.deviceIds.filter((id) => !visible.has(id)) };
      }
      const missing = selectableDevices
        .map((device) => device.id)
        .filter((id) => !f.deviceIds.includes(id))
        .slice(0, MAX_DEVICES - f.deviceIds.length);
      return { ...f, deviceIds: [...f.deviceIds, ...missing] };
    });
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const { data } = await api.post('/issues/attachments', formData);
      setAttachments((prev) => [...prev, ...data.files].slice(0, maxAttachments));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Dateien konnten nicht hochgeladen werden.');
    } finally {
      setUploading(false);
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    if (type === 'DEVICE' && form.deviceIds.length === 0) {
      setError('Bitte mindestens ein Schulgerät auswählen.');
      setSaving(false);
      return;
    }
    if (type === 'WLAN' && !form.roomName.trim()) {
      setError('Bitte einen Raum angeben.');
      setSaving(false);
      return;
    }
    if (type === 'SOFTWARE' && !form.softwareName.trim()) {
      setError('Bitte die Software angeben.');
      setSaving(false);
      return;
    }
    if (isCapture && !form.reporterId) {
      setError('Bitte die Person auswählen, für die das Ticket erstellt wird.');
      setSaving(false);
      return;
    }
    if (!form.title.trim()) {
      setError('Bitte eine kurze Zusammenfassung angeben.');
      setSaving(false);
      return;
    }
    if (!form.description.trim()) {
      setError('Bitte das Problem beschreiben.');
      setSaving(false);
      return;
    }

    try {
      const { data } = await api.post('/issues', {
        type,
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        // Bei einer Vorlage übernimmt der Server die hinterlegten
        // Standardbearbeiter; die eigene Person nicht dazwischenfunken lassen.
        assigneeId: selectedTemplate ? undefined : (canTakeOwnership ? user?.id : undefined),
        reporterId: isCapture ? form.reporterId : undefined,
        templateId: selectedTemplate?.id || undefined,
        deviceIds: type === 'DEVICE' ? form.deviceIds : undefined,
        roomName: type === 'WLAN' ? form.roomName.trim() : undefined,
        softwareName: type === 'SOFTWARE' ? form.softwareName.trim() : undefined,
        attachments
      });
      try { sessionStorage.removeItem('issue-draft'); } catch { /* optional */ }
      navigate(`/issues?id=${data.issue.id}`, { state: { confirmation: data.confirmation } });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Fehler konnte nicht gemeldet werden.');
      setSaving(false);
    }
  }

  if (!type) {
    return (
      <div className="page-enter max-w-3xl mx-auto space-y-6">
        <div>
          <Link to={isCapture ? '/issues/manage' : '/issues'} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main">
            <ArrowLeft size={16} /> {isCapture ? 'Zurück zum Ticket-Board' : 'Zurück zu meinen Tickets'}
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-zinc-100">{isCapture ? 'Neues Ticket aufnehmen' : 'Neues Ticket erstellen'}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            {isCapture ? 'Erstelle ein Ticket im Auftrag einer anderen Person.' : 'Wähle zuerst, welche Art von Problem vorliegt.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {ISSUE_TYPES.map((option) => {
            const Icon = TYPE_ICONS[option.icon];
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                className="card group p-6 text-left hover:border-gray-300 dark:hover:border-zinc-600 transition"
              >
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${option.badge.split(' ').slice(0, 2).join(' ')}`}>
                  <Icon size={24} />
                </span>
                <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-zinc-100 group-hover:text-main transition">
                  {option.label}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">{option.subtitle}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter max-w-3xl mx-auto space-y-6">
      <div>
        <button
          type="button"
          onClick={() => setType('')}
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main"
        >
          <ArrowLeft size={16} /> Andere Ticketart wählen
        </button>
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${typeMeta.badge.split(' ').slice(0, 2).join(' ')}`}>
            {TypeIcon && <TypeIcon size={22} />}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-zinc-100">Neues Ticket · {typeMeta.label}</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400">{typeMeta.subtitle}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm font-medium text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {isCapture && (
        <div className="bg-violet-50/50 dark:bg-violet-950/20 text-violet-800 dark:text-violet-300 p-4 rounded-xl flex gap-3 items-start border border-violet-100 dark:border-violet-900/30">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            Du erstellst dieses Ticket <strong>im Auftrag einer anderen Person</strong>. Die ausgewählte Person wird als Ersteller des Problems geführt und erhält den Fortschritt zu diesem Ticket.
          </div>
        </div>
      )}

      {type === 'DEVICE' && (
        <div className="bg-blue-50/50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 p-4 rounded-xl flex gap-3 items-start border border-blue-100 dark:border-blue-900/30">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            Beim Melden von Schulgeräten werden diese automatisch als <strong>defekt</strong> markiert und können vorerst nicht mehr ausgeliehen werden. Die Gerätedaten werden aus dem Inventar übernommen. Du kannst mehrere Geräte auswählen, wenn das gleiche Problem mehrfach auftritt.
          </div>
        </div>
      )}

      <form onSubmit={submitReport} className="card space-y-5 p-4 sm:space-y-6 sm:p-6 dark:bg-zinc-900 dark:border-zinc-800">
        {availableTemplates.length > 0 && (
          <div className="rounded-xl border border-black/10 dark:border-zinc-700 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">Vorlage verwenden (optional)</span>
              {selectedTemplate && (
                <button
                  type="button"
                  onClick={() => setTemplateId('')}
                  className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-zinc-200"
                >
                  Auswahl entfernen
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
              Vorlagen füllen Dringlichkeit und Standardbearbeiter vor und können Hinweise enthalten.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {availableTemplates.map((template) => {
                const active = template.id === templateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setTemplateId(template.id);
                      if (template.priority) setForm((f) => ({ ...f, priority: template.priority }));
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-violet-400 bg-violet-50/70 dark:border-violet-700 dark:bg-violet-950/30'
                        : 'border-black/10 hover:border-gray-300 dark:border-zinc-700 dark:hover:border-zinc-500'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-zinc-100">
                      {template.icon && <span aria-hidden="true">{template.icon}</span>}
                      <span className="min-w-0 truncate">{template.name}</span>
                      {active && <CheckCircle2 size={15} className="ml-auto shrink-0 text-violet-600" />}
                    </span>
                    {template.description && (
                      <span className="mt-1 block text-xs text-gray-500 dark:text-zinc-400">{template.description}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-gray-400">
                      {template.assignees?.length ? `${template.assignees.length} Standardbearbeiter` : 'Keine Standardbearbeiter'}
                      {template.recipientCount ? ` · ${template.recipientCount} Mail-Empfänger` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedTemplate?.confirmationMessage && (
              <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-zinc-800/60 dark:text-zinc-300">
                {selectedTemplate.confirmationMessage}
              </p>
            )}
          </div>
        )}

        {isCapture && (
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
            Für wen wird das Ticket erstellt? <span className="text-red-500">*</span>
            <select
              className="field mt-2"
              value={form.reporterId}
              onChange={(e) => setForm({ ...form, reporterId: e.target.value })}
              required
            >
              <option value="">— Person auswählen —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.username}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === 'DEVICE' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                {isCapture ? '2.' : '1.'} Welche Schulgeräte sind betroffen? <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-zinc-400">
                  {selectedDevices.length > 0
                    ? `${selectedDevices.length} von max. ${MAX_DEVICES} ausgewählt`
                    : 'Mehrfachauswahl möglich'}
                </span>
                {selectableDevices.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-black/10 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-zinc-300 hover:border-gray-400 hover:text-gray-900 dark:hover:text-zinc-100 transition"
                  >
                    <CheckCheck size={13} />
                    {allFilteredSelected ? 'Auswahl aufheben' : 'Alle auswählen'}
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
              <input
                className="field pl-9"
                placeholder="Geräte suchen… (Inventarnummer, Modell, Raum)"
                value={deviceQuery}
                onChange={(e) => setDeviceQuery(e.target.value)}
              />
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-black/10 dark:border-zinc-700 divide-y divide-black/5 dark:divide-zinc-700">
              {loadingMeta && (
                <div className="p-6 text-center text-sm text-gray-400">Geräte werden geladen…</div>
              )}
              {!loadingMeta && filteredDevices.length === 0 && (
                <div className="p-6 text-center text-sm text-gray-400">Kein Gerät gefunden.</div>
              )}
              {filteredDevices.map((device) => {
                const active = form.deviceIds.includes(device.id);
                const reportable = device.isReportable !== false;
                const disabled = !reportable || (!active && form.deviceIds.length >= MAX_DEVICES);
                return (
                  <label
                    key={device.id}
                    className={`flex items-start gap-3 px-4 py-3 transition ${
                      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      active ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-[#fafafa] dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 accent-gray-900"
                      checked={active}
                      disabled={disabled}
                      onChange={() => toggleDevice(device.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-gray-800 dark:text-zinc-200 text-sm">
                        {device.inventoryId}
                        {device.model ? <span className="font-normal text-gray-500 dark:text-zinc-400"> – {device.model}</span> : null}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                        {[device.manufacturer, device.room?.name, device.serialNumber ? `SN: ${device.serialNumber}` : null].filter(Boolean).join(' · ') || 'Keine weiteren Angaben'}
                      </span>
                      {!reportable && (
                        <span className="block text-xs text-gray-400 mt-1">Für dieses Gerät können keine Fehler gemeldet werden.</span>
                      )}
                    </span>
                    {active && <CheckCircle2 size={18} className="text-blue-600 shrink-0 mt-1" />}
                  </label>
                );
              })}
            </div>

            {selectedDevices.length > 0 && (
              <div className="rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-black/5 dark:border-zinc-700 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Ausgewählte Geräte ({selectedDevices.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, deviceIds: [] }))}
                    className="-mr-1 inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-medium text-gray-400 transition hover:text-red-500"
                  >
                    Alle entfernen
                  </button>
        </div>

                <ul className="space-y-1.5">
                  {selectedDevices.map((device) => (
                    <li
                      key={device.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-black/5 dark:border-zinc-700 px-3 py-2 text-xs text-gray-700 dark:text-zinc-300"
                    >
                      <span className="min-w-0">
                        <span className="font-semibold">{device.inventoryId}</span>
                        {device.model ? <span className="text-gray-500 dark:text-zinc-400"> – {device.model}</span> : null}
                        {device.room?.name ? <span className="text-gray-400"> · {device.room.name}</span> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleDevice(device.id)}
                        className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                        aria-label={`${device.inventoryId} aus der Auswahl entfernen`}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {type === 'WLAN' && (
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
            {isCapture ? '2.' : '1.'} Wo besteht das Problem? <span className="text-red-500">*</span>
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

        {type === 'SOFTWARE' && (
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
            {isCapture ? '2.' : '1.'} Welche Software ist betroffen? <span className="text-red-500">*</span>
            <input
              className="field mt-2"
              list="software-suggestions"
              placeholder="z. B. Microsoft Word, IServ, Browser…"
              value={form.softwareName}
              onChange={(e) => setForm({ ...form, softwareName: e.target.value })}
              required
            />
            <datalist id="software-suggestions">
              {SOFTWARE_SUGGESTIONS.map((name) => <option key={name} value={name} />)}
            </datalist>
          </label>
        )}

        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
          Kurze Zusammenfassung <span className="text-red-500">*</span>
          <input
            className="field mt-2"
            maxLength={90}
            placeholder="z. B. WLAN funktioniert nicht, Word startet nicht, Laptop lädt nicht…"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          {fieldHelp.title && <span className="mt-1 block text-xs text-gray-500 dark:text-zinc-400">{fieldHelp.title}</span>}
        </label>

        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
          {type === 'PERSONAL' ? 'Was ist mit deinem Privat-/Dienstgerät nicht in Ordnung?' : 'Was funktioniert nicht?'} <span className="text-red-500">*</span>
          {selectedTemplate?.descriptionHint && (
            <span className="mt-1 block rounded-lg bg-violet-50 px-3 py-2 text-xs font-normal text-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
              {selectedTemplate.descriptionHint}
            </span>
          )}
          <textarea
            className="field mt-2 min-h-32 leading-relaxed"
            placeholder={
              type === 'WLAN'
                ? 'z. B. Im Raum IF01 funktioniert das WLAN seit heute Morgen nicht mehr. Betrifft mehrere Personen?'
                : 'Beschreibe das Problem möglichst genau: Was passiert, wann tritt es auf, was hast du schon ausprobiert?'
            }
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
          {fieldHelp.description && <span className="mt-1 block text-xs text-gray-500 dark:text-zinc-400">{fieldHelp.description}</span>}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">
            Dringlichkeit
            <select className="field mt-2" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {fieldHelp.priority && <span className="mt-1 block text-xs text-gray-500 dark:text-zinc-400">{fieldHelp.priority}</span>}
          </label>
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-zinc-300 block">Anhänge (optional)</span>
            {attachmentsAllowed ? (
              <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/10 dark:border-zinc-700 px-4 py-3 text-sm font-medium text-gray-600 dark:text-zinc-400 hover:border-gray-400 hover:text-gray-800 peer-checked:border-gray-800 transition">
                <Paperclip size={16} />
                {uploading ? 'Lädt hoch…' : `Datei/Bild anhängen (max. ${maxAttachments})`}
                <input type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} disabled={uploading || attachments.length >= maxAttachments} />
              </label>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-black/10 px-4 py-3 text-xs text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
                Diese Vorlage erlaubt keine Anhänge.
              </p>
            )}
            {fieldHelp.attachments && <span className="mt-1 block text-xs text-gray-500 dark:text-zinc-400">{fieldHelp.attachments}</span>}
            {attachments.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {attachments.map((file) => (
                  <li key={file.filename} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-zinc-800/60 px-3 py-2 text-xs text-gray-700 dark:text-zinc-300">
                    <span className="min-w-0 truncate">{file.name} <span className="text-gray-400">({formatBytes(file.size)})</span></span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((a) => a.filename !== file.filename))}
                      className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                      aria-label="Anhang entfernen"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Abschnitt 16: Was die Dringlichkeit bewirkt – konkret und ohne
            „automatisch defekt"-Versprechen. */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
          <span className="font-semibold">Wirkung auf das Gerät:</span> „Unwichtig“, „Normal“ und „Störend“
          zeigen das Gerät als <span className="font-medium">Eingeschränkt</span>, „Kritisch“ als{' '}
          <span className="font-medium">Defekt</span> – die Ursache steht als Ticket am Gerät. Welche
          Dringlichkeit was auslöst, legt die IT fest.
        </div>

        <div className="pt-4 border-t border-black/5 dark:border-zinc-700 flex">
          <button className="btn-primary w-full sm:w-auto sm:ml-auto" type="submit" disabled={saving}>
            <Save size={17} /> {saving ? 'Wird gesendet…' : 'Ticket erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}