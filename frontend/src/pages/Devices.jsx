import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, Plus, Search, Trash2, X, Printer, Pencil, ScanLine } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../components/ConfirmDialog';
import StatusPill from '../components/StatusPill';
import DeviceIcon from '../components/deviceIcons';
import LabelScanModal from '../components/LabelScanModal';
import MultiSelect from '../components/MultiSelect';
import { STATUS_BADGES as statusLabels, DEVICE_CATEGORIES, VISIBILITY_LABELS } from '../components/deviceMeta';

function naturalCompare(a, b) {
  const partsA = String(a).toLowerCase().split(/(\d+)/).filter(Boolean);
  const partsB = String(b).toLowerCase().split(/(\d+)/).filter(Boolean);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const pa = partsA[i];
    const pb = partsB[i];
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;
    const isNumA = /^\d+$/.test(pa);
    const isNumB = /^\d+$/.test(pb);
    if (isNumA && isNumB) {
      const diff = parseInt(pa, 10) - parseInt(pb, 10);
      if (diff !== 0) return diff;
    } else if (isNumA !== isNumB) {
      return isNumA ? -1 : 1;
    } else if (pa !== pb) {
      return pa < pb ? -1 : 1;
    }
  }
  return String(a).localeCompare(String(b), 'de', { numeric: true });
}

export default function Devices() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const permissions = user?.effectivePermissions || [];
  const role = user?.effectiveRole || user?.role;
  const canCreate = permissions.includes('DEVICE_CREATE');
  const canEdit = permissions.includes('DEVICE_EDIT');
  const canDelete = permissions.includes('DEVICE_DELETE');
  const canPrint = role !== 'VIEWER';
  const canImportExport = role === 'STAFF' || role === 'ADMIN';
  const [devices, setDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [areas, setAreas] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditStatus, setBulkEditStatus] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilters, setStatusFilters] = useState([]);
  const [roomFilters, setRoomFilters] = useState([]);
  const [areaFilters, setAreaFilters] = useState([]);
  const [error, setError] = useState('');

  async function load(overrides = {}) {
    const nextSearch = overrides.search ?? search;
    const nextStatus = overrides.statusFilters ?? statusFilters;
    const nextRoom = overrides.roomFilters ?? roomFilters;
    const nextArea = overrides.areaFilters ?? areaFilters;
    try {
      const { data: devicesData } = await api.get('/devices', {
        params: {
          search: nextSearch,
          status: nextStatus.length ? nextStatus.join(',') : undefined,
          room: nextRoom.length ? nextRoom.join(',') : undefined,
          area: nextArea.length ? nextArea.join(',') : undefined
        }
      });
      setDevices(devicesData.devices || []);
      setSelectedIds((ids) => ids.filter((id) => (devicesData.devices || []).some((d) => d.id === id)));
      setError('');
    } catch {
      setError('Geräte konnten nicht geladen werden.');
    }
  }

  useEffect(() => { api.get('/rooms').then(({ data }) => setRooms(data.rooms || [])).catch(() => {}); }, []);
  useEffect(() => { api.get('/areas').then(({ data }) => setAreas(data.areas || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const fromUrl = searchParams.get('search') || '';
    if (fromUrl !== search) { setSearch(fromUrl); load({ search: fromUrl }); }
  }, [searchParams]);

  const stats = useMemo(() => ({
    total: devices.length,
    available: devices.filter((d) => d.status === 'AVAILABLE').length,
    loaned: devices.filter((d) => d.status === 'LOANED').length,
    defect: devices.filter((d) => d.status === 'DEFECT').length
  }), [devices]);

  const groupedDevices = useMemo(() => {
    const groups = new Map();
    devices.forEach((device) => {
      const key = device.room?.id || 'no-room';
      if (!groups.has(key)) groups.set(key, { id: key, name: device.room?.name || 'Kein Raum zugewiesen', building: device.room?.building || '', devices: [] });
      groups.get(key).devices.push(device);
    });
    return Array.from(groups.values())
      .map((group) => ({ ...group, devices: [...group.devices].sort((a, b) => naturalCompare(a.inventoryId, b.inventoryId)) }))
      .sort((a, b) => {
        if (a.id === 'no-room') return 1;
        if (b.id === 'no-room') return -1;
        return a.name.localeCompare(b.name, 'de');
      });
  }, [devices]);

  const filteredDeviceIds = useMemo(() => devices.map((d) => d.id), [devices]);
  const allSelected = filteredDeviceIds.length > 0 && filteredDeviceIds.every((id) => selectedIds.includes(id));
  const selectedDevices = useMemo(() => devices.filter((device) => selectedIds.includes(device.id)), [devices, selectedIds]);

  function toggleSelected(id) { setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id])); }
  function toggleAllVisible() {
    setSelectedIds((ids) => {
      if (allSelected) return ids.filter((id) => !filteredDeviceIds.includes(id));
      return Array.from(new Set([...ids, ...filteredDeviceIds]));
    });
  }
  function toggleRoom(groupId) {
    const group = groupedDevices.find((g) => g.id === groupId);
    if (!group) return;
    const ids = group.devices.map((d) => d.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
  }
  function getRoomSelection(group) {
    const ids = group.devices.map((d) => d.id);
    const count = ids.filter((id) => selectedIds.includes(id)).length;
    return { all: count > 0 && count === ids.length, some: count > 0 && count < ids.length };
  }

  async function deleteSelected() {
    if (!canDelete || selectedIds.length === 0) return;
    const ok = await confirm({ title: 'Geräte löschen', message: `${selectedIds.length} Asset(s) wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`, tone: 'danger', confirmLabel: 'Löschen', cancelLabel: 'Abbrechen' });
    if (!ok) return;
    setError('');
    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/devices/${id}`)));
      setSelectedIds([]);
      await load();
    } catch (e) { setError(e.response?.data?.error || 'Ausgewählte Assets konnten nicht gelöscht werden.'); }
  }

  async function applyBulkEdit(data) {
    if (selectedIds.length === 0) return;
    setError('');
    try {
      await api.patch('/devices/bulk', { ids: selectedIds, data });
      setBulkEditOpen(false);
      setSelectedIds([]);
      await load();
      return true;
    } catch (e) { 
      setError(e.response?.data?.error || 'Ausgewählte Assets konnten nicht bearbeitet werden.');
      return false;
    }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface md:text-3xl">Geräte</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{devices.length} Geräte insgesamt</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {canImportExport && <Link className="btn-secondary" to="/devices/import"><ArrowLeftRight size={17} />Import/Export</Link>}
          <button className="btn-secondary" onClick={() => setScanOpen(true)}><ScanLine size={17} />Label scannen</button>
          {canCreate && <Link className="btn-primary" to="/devices/new"><Plus size={17} />Neu hinzufügen</Link>}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Assets" value={stats.total} />
        <Metric label="Verfügbar" value={stats.available} tone="green" />
        <Metric label="Verliehen" value={stats.loaned} tone="orange" />
        <Metric label="Defekt" value={stats.defect} tone="red" />
      </section>

      <section className="card overflow-hidden">
        {error && <div className="border-b border-badge-red bg-badge-red px-5 py-3 text-sm font-medium text-text-badge-red">{error}</div>}
        <div className="grid gap-3 border-b border-outline-variant p-4 lg:grid-cols-[1fr_180px_180px_200px_auto] lg:p-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={17} />
            <input className="field pl-9" placeholder="Inventarnummer, Modell oder Seriennummer" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          </div>
          <MultiSelect
            options={Object.entries(statusLabels).map(([value, [label]]) => ({ value, label }))}
            value={statusFilters}
            onChange={setStatusFilters}
            placeholder="Alle Status"
          />
          <MultiSelect
            options={rooms.map((entry) => ({ value: entry.id, label: entry.building ? `${entry.building} · ${entry.name}` : entry.name }))}
            value={roomFilters}
            onChange={setRoomFilters}
            placeholder="Alle Räume"
            searchPlaceholder="Raum suchen…"
          />
          <MultiSelect
            options={areas.map((entry) => ({ value: entry.id, label: entry.name }))}
            value={areaFilters}
            onChange={setAreaFilters}
            placeholder="Alle Bereiche"
            searchPlaceholder="Bereich suchen…"
          />
          <button className="btn-secondary" onClick={load}>Anwenden</button>
        </div>
        {selectedIds.length > 0 && (
          <BulkActions
            count={selectedIds.length}
            onClear={() => setSelectedIds([])}
            onEdit={canEdit ? () => { setBulkEditStatus(''); setBulkEditOpen(true); } : null}
            onDefect={canEdit ? () => { setBulkEditStatus('DEFECT'); setBulkEditOpen(true); } : null}
            onDelete={canDelete ? deleteSelected : null}
            onPrint={canPrint ? () => navigate(`/devices/print?ids=${selectedIds.join(',')}`) : null}
          />
        )}
        <div className="hidden overflow-x-auto md:block">
          {devices.length > 0 && (
            <div className="flex items-center gap-3 border-b border-outline-variant bg-surface-container-low px-4 py-2 text-xs font-medium text-on-surface-variant">
              <input type="checkbox" className="h-4 w-4 rounded border-outline" checked={allSelected} onChange={toggleAllVisible} />
              <span>Alle sichtbaren Assets auswählen</span>
            </div>
          )}
          <div className="grid grid-cols-[32px_minmax(200px,1.2fr)_140px_minmax(110px,1fr)_110px_130px] items-center gap-3 border-b border-outline-variant bg-surface-container-low px-4 py-2 text-xs font-medium text-on-surface-variant">
            <div />
            <div>Gerät</div>
            <div>Asset-ID</div>
            <div>Seriennummer</div>
            <div>Status</div>
            <div>Aktion</div>
          </div>
          {groupedDevices.map((group) => (
            <section key={group.id} className="border-b border-outline-variant last:border-b-0">
              <RoomHeader group={group} canSelect={canEdit} toggleRoom={() => toggleRoom(group.id)} groupAllSelected={getRoomSelection(group).all} groupSomeSelected={getRoomSelection(group).some} />
              <div className="divide-y divide-outline-variant">
                {group.devices.map((device) => <DeviceTreeRow key={device.id} device={device} canEdit={canEdit} selected={selectedIds.includes(device.id)} onToggleSelected={toggleSelected} />)}
              </div>
            </section>
          ))}
          {!devices.length && <div className="p-6 text-sm text-on-surface-variant">Keine Assets gefunden.</div>}
        </div>
        <div className="divide-y divide-outline-variant md:hidden">
          {groupedDevices.map((group) => {
            const sel = getRoomSelection(group);
            return (
              <RoomGroupDesktop key={group.id} group={group} canEdit={canEdit} selectedIds={selectedIds} onToggleSelected={toggleSelected} canSelect={canEdit} onToggleGroup={() => toggleRoom(group.id)} groupAllSelected={sel.all} groupSomeSelected={sel.some} />
            );
          })}
          {!devices.length && <div className="p-6 text-sm text-on-surface-variant">Keine Assets gefunden.</div>}
        </div>
      </section>
      {bulkEditOpen && createPortal(
        <BulkEditModal count={selectedIds.length} devices={selectedDevices} rooms={rooms} areas={areas} statusLabels={statusLabels} initialStatus={bulkEditStatus} onCancel={() => setBulkEditOpen(false)} onSave={applyBulkEdit} />,
        document.body
      )}
      <LabelScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onFound={(deviceId) => {
          setScanOpen(false);
          navigate(`/devices?id=${encodeURIComponent(deviceId)}`);
        }}
      />
    </div>
  );
}

function RoomHeader({ group, canSelect, toggleRoom, groupAllSelected, groupSomeSelected }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface-container-high px-4 py-3 text-on-surface">
      <div className="flex min-w-0 items-center gap-3">
        {canSelect && (
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-outline"
            checked={groupAllSelected}
            onChange={toggleRoom}
            ref={(el) => { if (el) el.indeterminate = groupSomeSelected && !groupAllSelected; }}
          />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{group.name}</div>
          {group.building && <div className="mt-0.5 truncate text-xs text-on-surface-variant">{group.building}</div>}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-primary/15 text-primary px-2.5 py-1 text-xs font-semibold">{group.devices.length}</span>
    </div>
  );
}

function BulkActions({ count, onClear, onEdit, onDefect, onDelete, onPrint }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 bg-badge-blue px-4 py-3 text-sm">
      <div className="font-semibold text-badge-blue">{count} ausgewählt</div>
      <div className="flex flex-wrap gap-2">
        {onEdit && <button className="btn-primary min-h-11 sm:min-h-9" onClick={onEdit}><Pencil size={16} />Bearbeiten</button>}
        {onDefect && <button className="btn-secondary min-h-11 sm:min-h-9 border-badge-red text-text-badge-red hover:bg-badge-red" onClick={onDefect}><AlertTriangle size={16} />Defekt</button>}
        {onPrint && <button className="btn-secondary min-h-11 sm:min-h-9" onClick={onPrint}><Printer size={16} />Druckansicht</button>}
        {onDelete && <button className="btn-secondary min-h-11 sm:min-h-9 border-badge-red text-text-badge-red hover:bg-badge-red" onClick={onDelete}><Trash2 size={16} />Löschen</button>}
        <button className="btn-secondary min-h-11 sm:min-h-9" onClick={onClear}><X size={16} />Auswahl aufheben</button>
      </div>
    </div>
  );
}

function BulkEditModal({ count, devices, rooms, areas, statusLabels, initialStatus = '', onCancel, onSave }) {
  const [status, setStatus] = useState(initialStatus);
  const [room, setRoom] = useState('');
  const [area, setArea] = useState('');
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState('');
  const [description, setDescription] = useState('');
  const [isLendable, setIsLendable] = useState('');
  const [isReportable, setIsReportable] = useState('');
  const [updatesEnabled, setUpdatesEnabled] = useState('');
  const [defectNotes, setDefectNotes] = useState(() => Object.fromEntries(devices.map((device) => [device.id, device.defectNote || ''])));
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  function updateDefectNote(id, value) {
    setDefectNotes((current) => ({ ...current, [id]: value }));
    setModalError('');
  }

  function applyDefectNoteToAll() {
    const note = devices.map((device) => defectNotes[device.id]?.trim()).find(Boolean);
    if (!note) {
      setModalError('Bitte zuerst bei einem Gerät eintragen, was defekt ist.');
      return;
    }
    setDefectNotes(Object.fromEntries(devices.map((device) => [device.id, note])));
    setModalError('');
  }

  function triSelect(label, value, onChange, yesLabel, noLabel) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-on-surface-variant">{label}</label>
        <select className="field" value={value} onChange={(e) => { onChange(e.target.value); setModalError(''); }}>
          <option value="">Unverändert</option>
          <option value="true">{yesLabel}</option>
          <option value="false">{noLabel}</option>
        </select>
      </div>
    );
  }

  async function submit() {
    if (saving) return;
    const data = {};
    if (status) data.status = status;
    if (room !== '') data.roomId = room;
    if (area !== '') data.areaId = area === '__none__' ? null : area;
    if (category !== '') data.category = category;
    if (visibility !== '') data.visibility = visibility;
    if (description !== '') data.description = description;
    if (isLendable !== '') data.isLendable = isLendable === 'true';
    if (isReportable !== '') data.isReportable = isReportable === 'true';
    if (updatesEnabled !== '') data.updatesEnabled = updatesEnabled === 'true';
    if (status === 'DEFECT') {
      const missing = devices.filter((device) => !String(defectNotes[device.id] || '').trim());
      if (missing.length > 0) {
        setModalError('Bitte für jedes defekte Gerät angeben, was defekt ist.');
        return;
      }
      data.defectNotes = Object.fromEntries(devices.map((device) => [device.id, defectNotes[device.id].trim()]));
    }
    if (Object.keys(data).length === 0) {
      setModalError('Bitte mindestens ein Feld ändern, sonst gibt es nichts zu übernehmen.');
      return;
    }
    setSaving(true);
    setModalError('');
    const ok = await onSave(data);
    setSaving(false);
    if (!ok) setModalError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="card my-8 max-h-[85vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant">
          <h2 className="text-lg font-bold text-on-surface">{count} Assets bearbeiten</h2>
          <button type="button" className="text-on-surface-variant hover:text-on-surface" onClick={onCancel}><X size={20} /></button>
        </div>
        <p className="mt-3 text-sm text-on-surface-variant">Nur die hier gesetzten Felder werden auf alle ausgewählten Assets übernommen.</p>

        {modalError && <div className="mt-3 rounded-lg bg-badge-red px-3 py-2 text-sm font-medium text-text-badge-red">{modalError}</div>}

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">Status</label>
            <select className="field" value={status} onChange={(e) => { setStatus(e.target.value); setModalError(''); }}>
              <option value="">Unverändert</option>
              {Object.entries(statusLabels).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          {status === 'DEFECT' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-500/10">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-on-surface">Was ist defekt?</div>
                  <div className="mt-0.5 text-xs text-on-surface-variant">Bitte pro Gerät kurz eintragen. Es wird kein Ticket erstellt.</div>
                </div>
                <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={applyDefectNoteToAll}>
                  Defekt bei allen Geräten eintragen
                </button>
              </div>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                {devices.map((device) => (
                  <label key={device.id} className="block">
                    <span className="text-xs font-medium text-on-surface">
                      {device.inventoryId}{device.model ? ` · ${device.model}` : ''}
                    </span>
                    <input
                      className="field mt-1 min-h-10 py-2 text-sm"
                      value={defectNotes[device.id] || ''}
                      onChange={(event) => updateDefectNote(device.id, event.target.value)}
                      placeholder="Kurz beschreiben, was defekt ist…"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">Raum</label>
            <select className="field" value={room} onChange={(e) => { setRoom(e.target.value); setModalError(''); }}>
              <option value="">Unverändert</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.building ? `${r.building} · ${r.name}` : r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">Bereich</label>
            <select className="field" value={area} onChange={(e) => { setArea(e.target.value); setModalError(''); }}>
              <option value="">Unverändert</option>
              <option value="__none__">Kein Bereich</option>
              {areas.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">Geräte-Typ</label>
            <select className="field" value={category} onChange={(e) => { setCategory(e.target.value); setModalError(''); }}>
              <option value="">Unverändert</option>
              {DEVICE_CATEGORIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">Sichtbarkeit</label>
            <select className="field" value={visibility} onChange={(e) => { setVisibility(e.target.value); setModalError(''); }}>
              <option value="">Unverändert</option>
              {Object.entries(VISIBILITY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant">Beschreibung</label>
            <textarea className="field min-h-20 resize-y" placeholder="Neue Beschreibung für alle ausgewählten Assets…" value={description} onChange={(e) => { setDescription(e.target.value); setModalError(''); }} />
          </div>
          {triSelect('Ausleihe möglich', isLendable, setIsLendable, 'Ja', 'Nein')}
          {triSelect('Fehlermeldung möglich', isReportable, setIsReportable, 'Ja', 'Nein')}
          {triSelect('Update-Historie nutzen', updatesEnabled, setUpdatesEnabled, 'Ja', 'Nein')}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary min-h-11 sm:min-h-10" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn-primary min-h-11 sm:min-h-10" onClick={submit} disabled={saving}>{saving ? 'Übernimmt…' : 'Übernehmen'}</button>
        </div>
      </div>
    </div>
  );
}

function RoomGroupMobile({ group, canEdit, selectedIds, onToggleSelected, canSelect, onToggleGroup, groupAllSelected, groupSomeSelected }) {
  return null;
}

function RoomGroupDesktop({ group, canEdit, selectedIds, onToggleSelected, canSelect, onToggleGroup, groupAllSelected, groupSomeSelected }) {
  return (
    <section className="border-b border-outline-variant last:border-b-0">
      <RoomHeader group={group} canSelect={canSelect} toggleRoom={onToggleGroup} groupAllSelected={groupAllSelected} groupSomeSelected={groupSomeSelected} />
      <div className="divide-y divide-outline-variant md:hidden">
        {group.devices.map((device) => <DeviceCard key={device.id} device={device} canEdit={canEdit} selected={selectedIds.includes(device.id)} onToggleSelected={onToggleSelected} />)}
      </div>
    </section>
  );
}

function DeviceCard({ device, canEdit, selected, onToggleSelected }) {
  return (
    <article className="p-4">
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-3 h-4 w-4 rounded border-outline" checked={selected} onChange={() => onToggleSelected(device.id)} />
        <Link to={`/devices?id=${device.id}`} className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface"><DeviceIcon device={device} size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-on-surface">{device.inventoryId}</div>
            <div className="mt-1 truncate text-xs text-on-surface-variant">{[device.manufacturer, device.model].filter(Boolean).join(' ')}</div>
            {device.defectNote && <div className="mt-1 line-clamp-2 text-xs text-badge-red">{device.defectNote}</div>}
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-on-surface-variant">
              <span className="truncate rounded-lg bg-surface-container-low px-2 py-1 font-mono">Asset-ID: {device.id}</span>
              <span className="truncate rounded-lg bg-surface-container-low px-2 py-1">{device.room?.name || 'Kein Raum'}</span>
            </div>
          </div>
          <StatusPill status={device.status} />
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link className="btn-secondary min-h-11 sm:min-h-10" to={`/devices?id=${device.id}`}>Öffnen</Link>
        {canEdit ? <Link className="btn-primary min-h-11 sm:min-h-10" to={`/devices/edit?id=${device.id}`}>Bearbeiten</Link> : <span />}
      </div>
    </article>
  );
}

function DeviceTreeRow({ device, canEdit, selected, onToggleSelected }) {
  return (
    <div className="grid grid-cols-[32px_minmax(200px,1.2fr)_140px_minmax(110px,1fr)_110px_130px] items-center gap-3 px-4 py-3 text-sm hover:bg-sidebar-item-hover transition">
      <input type="checkbox" className="h-4 w-4 rounded border-outline" checked={selected} onChange={() => onToggleSelected(device.id)} />
      <Link to={`/devices?id=${device.id}`} className="flex min-w-0 items-center gap-3">
        <span className="ml-2 h-px w-6 shrink-0 bg-primary/30" />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface"><DeviceIcon device={device} size={18} /></div>
        <div className="min-w-0">
          <div className="truncate font-semibold text-on-surface">{device.inventoryId || '-'}</div>
          <div className="truncate text-xs text-on-surface-variant">{[device.manufacturer, device.model].filter(Boolean).join(' ') || '-'}</div>
          {device.defectNote && <div className="truncate text-xs text-badge-red">{device.defectNote}</div>}
        </div>
      </Link>
      <div className="font-mono text-xs text-on-surface-variant">{device.id}</div>
      <div className="truncate text-on-surface-variant">{device.serialNumber || '-'}</div>
      <div><StatusPill status={device.status} /></div>
      <div className="flex gap-3">
        <Link className="font-medium text-primary hover:underline" to={`/devices?id=${device.id}`}>Öffnen</Link>
        {canEdit && <Link className="font-medium text-on-surface-variant" to={`/devices/edit?id=${device.id}`}>Bearbeiten</Link>}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'purple' }) {
  const tones = { purple: 'text-on-surface', green: 'text-badge-green', orange: 'text-badge-orange', red: 'text-badge-red' };
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-on-surface-variant md:text-sm">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}
