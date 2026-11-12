import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Filter, Plus, Search, MessageCircle, Inbox, X, Trash2, RotateCcw } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../components/ConfirmDialog';
import { ISSUE_TYPES, ISSUE_STATUSES, ISSUE_PRIORITIES, issueTypeMeta, issueContext, issueDevices, issueDisplayTitle, reporterName } from '../components/issueMeta';
import { assigneeIds, isAssignedTo, joinNames } from '../utils/issues';

const STATUS_FILTERS = [
  { value: '', label: 'Alle Status' },
  { value: 'OPEN', label: 'Offen' },
  { value: 'IN_PROGRESS', label: 'In Bearbeitung' },
  { value: 'WAITING', label: 'Warten auf Rückmeldung' },
  { value: 'CLOSED', label: 'Geschlossen' }
];

const COUNT_TABS = [
  { value: 'OPEN', label: 'Offen' },
  { value: 'IN_PROGRESS', label: 'In Bearbeitung' },
  { value: 'WAITING', label: 'Warten' }
];

function timeAgo(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}

const SORT_OPTIONS = [
  { value: 'updated', label: 'Zuletzt aktualisiert' },
  { value: 'created', label: 'Neueste zuerst' },
  { value: 'oldest', label: 'Älteste zuerst' },
  { value: 'priority', label: 'Priorität' }
];

const FILTER_STORAGE_KEY = 'ticket-board-filters';

export default function ManageIssues() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isAdmin = Boolean(user?.effectivePermissions?.includes('ADMIN') || user?.role === 'ADMIN' || user?.effectiveRole === 'ADMIN');
  const [issues, setIssues] = useState([]);
  const [trashIssues, setTrashIssues] = useState([]);
  const [trashView, setTrashView] = useState(false);
  const [sort, setSort] = useState('updated');
  const [counts, setCounts] = useState({ OPEN: 0, IN_PROGRESS: 0, WAITING: 0, CLOSED: 0 });
  const [rooms, setRooms] = useState([]);
  const [assignees, setAssignees] = useState([]);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [reporterFilter, setReporterFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const filtersReadyRef = useRef(false);

  // Zuletzt verwendete Filter und Sortierung im Browser merken.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setQuery(saved.query || '');
        setStatusFilter(saved.statusFilter || '');
        setTypeFilter(saved.typeFilter || '');
        setRoomFilter(saved.roomFilter || '');
        setAssigneeFilter(saved.assigneeFilter || '');
        setReporterFilter(saved.reporterFilter || '');
        setOwnerFilter(saved.ownerFilter === 'mine' ? 'mine' : 'all');
        setSort(SORT_OPTIONS.some((option) => option.value === saved.sort) ? saved.sort : 'updated');
      }
    } catch {
      // Ungültige gespeicherte Filter ignorieren.
    }
    filtersReadyRef.current = true;
  }, []);

  useEffect(() => {
    if (!filtersReadyRef.current) return;
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        query, statusFilter, typeFilter, roomFilter, assigneeFilter, reporterFilter, ownerFilter, sort
      }));
    } catch {
      // Speichern ist nur eine Komfortfunktion.
    }
  }, [query, statusFilter, typeFilter, roomFilter, assigneeFilter, reporterFilter, ownerFilter, sort]);

  useEffect(() => {
    function onDocMouseDown(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) setFilterOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const activeFilterCount = [statusFilter, typeFilter, roomFilter, assigneeFilter, reporterFilter, ownerFilter === 'mine' ? 'mine' : ''].filter(Boolean).length + (query.trim() ? 1 : 0);

  function resetFilters() {
    setQuery('');
    setStatusFilter('');
    setTypeFilter('');
    setRoomFilter('');
    setAssigneeFilter('');
    setReporterFilter('');
    setOwnerFilter('all');
  }

  useEffect(() => {
    load();
    api.get('/rooms').then((res) => setRooms(res.data.rooms || [])).catch(() => {});
    api.get('/issues/assignees').then((res) => setAssignees(res.data.assignees || [])).catch(() => {});
  }, []);

  async function load() {
    try {
      const { data } = await api.get('/issues/all');
      setIssues(data.issues || []);
      setCounts(data.counts || { OPEN: 0, IN_PROGRESS: 0, WAITING: 0, CLOSED: 0 });
    } catch {
      setIssues([]);
    }
  }

  async function loadTrash() {
    try {
      const { data } = await api.get('/issues/trash');
      setTrashIssues(data.issues || []);
    } catch {
      setTrashIssues([]);
    }
  }

  useEffect(() => {
    if (trashView) loadTrash();
  }, [trashView]);

  async function restoreTicket(issue) {
    try {
      await api.post(`/issues/${issue.id}/restore`);
      setTrashIssues((prev) => prev.filter((entry) => entry.id !== issue.id));
      load();
    } catch {
      // Fehler wird beim nächsten Laden sichtbar; die Liste bleibt unverändert.
    }
  }

  async function deleteForever(issue) {
    const ok = await confirm({
      title: 'Ticket endgültig löschen',
      message: 'Dieses Ticket wird unwiderruflich gelöscht. Fortfahren?',
      tone: 'danger',
      confirmLabel: 'Endgültig löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    try {
      await api.delete(`/issues/${issue.id}/permanent`);
      setTrashIssues((prev) => prev.filter((entry) => entry.id !== issue.id));
    } catch {
      // Siehe restoreTicket.
    }
  }

  const reporters = useMemo(() => {
    const map = new Map();
    issues.forEach((issue) => {
      if (!issue.reporterId) return;
      const name = issue.reporter?.displayName || issue.reporter?.username;
      if (name && !map.has(issue.reporterId)) map.set(issue.reporterId, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [issues]);

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (ownerFilter === 'mine' && !isAssignedTo(issue, user.id)) return false;
      if (typeFilter && issue.type !== typeFilter) return false;
      if (roomFilter && issue.roomId !== roomFilter) return false;
      if (assigneeFilter && !assigneeIds(issue).includes(assigneeFilter)) return false;
      if (reporterFilter && issue.reporterId !== reporterFilter) return false;
      if (statusFilter) {
        if (issue.status !== statusFilter) return false;
      } else if (issue.status === 'CLOSED') {
        // Ohne Status-Filter sind geschlossene Tickets standardmäßig ausgeblendet
        return false;
      }

      const haystack = [
        issue.id,
        issue.title,
        issue.description,
        issue.type,
        issue.softwareName,
        ...issueDevices(issue).flatMap((device) => [device.inventoryId, device.model]),
        issue.room?.name,
        issue.reporter?.displayName,
        issue.reporter?.username,
        // Alle Bearbeiter (Mehrfachzuweisung) sollen auffindbar sein.
        ...(issue.assignees || []).flatMap((a) => [a.displayName, a.username]),
        issue.reporterEmail,
        issue.status
      ].join(' ').toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [issues, query, statusFilter, typeFilter, roomFilter, assigneeFilter, reporterFilter, ownerFilter, user.id]);

  const sortedIssues = useMemo(() => {
    const priorityOrder = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
    const list = [...filteredIssues];
    if (sort === 'created') list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sort === 'oldest') list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sort === 'priority') {
      list.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
        || new Date(b.updatedAt) - new Date(a.updatedAt));
    } else list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return list;
  }, [filteredIssues, sort]);

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-zinc-100">Tickets</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">Arbeitsoberfläche für die IT-Verwaltung.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field w-auto" value={sort} onChange={(e) => setSort(e.target.value)} disabled={trashView}>
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button
            type="button"
            className={`btn-secondary ${trashView ? 'border-red-300 text-red-700 dark:border-red-900 dark:text-red-300' : ''}`}
            onClick={() => setTrashView((value) => !value)}
          >
            <Trash2 size={16} /> {trashView ? 'Papierkorb schließen' : 'Papierkorb'}
          </button>
          <button className="btn-primary" onClick={() => navigate('/issues/capture')}>
            <Plus size={17} /> Ticket erstellen
          </button>
        </div>
      </div>

      {/* Status-Zähler */}
      <div className={`flex flex-wrap items-center gap-2 ${trashView ? 'hidden' : ''}`}>
        {COUNT_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(statusFilter === tab.value ? '' : tab.value)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              statusFilter === tab.value
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-700 border-black/10 hover:border-gray-400 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500'
            }`}
          >
            {tab.label}
            <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${statusFilter === tab.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
              {counts[tab.value] || 0}
            </span>
          </button>
        ))}
        <button
          onClick={() => setStatusFilter(statusFilter === 'CLOSED' ? '' : 'CLOSED')}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
            statusFilter === 'CLOSED'
              ? 'bg-gray-800 text-white border-gray-800'
              : 'bg-white text-gray-700 border-black/10 hover:border-gray-400 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500'
          }`}
        >
          Geschlossen
          <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${statusFilter === 'CLOSED' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
            {counts.CLOSED || 0}
          </span>
        </button>
      </div>

      {/* Filter-Button mit Dropdown */}
      <div className={`flex flex-wrap items-center gap-3 ${trashView ? 'hidden' : ''}`}>
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              activeFilterCount > 0
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-700 border-black/10 hover:border-gray-400 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500'
            }`}
          >
            <Filter size={16} />
            Filter
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary/90 px-2 py-0.5 text-xs tabular-nums text-white dark:bg-primary">{activeFilterCount}</span>
            )}
            <ChevronDown size={15} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
          </button>

          {filterOpen && (
            <div className="animate-fade-in absolute left-0 top-full z-30 mt-2 w-[min(560px,calc(100vw-2rem))] rounded-2xl border border-outline-variant bg-surface-container p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-on-surface"><Filter size={15} />Filter</span>
                <button type="button" onClick={resetFilters} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <X size={13} />Zurücksetzen
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-on-surface-variant">Status
                  <select className="field mt-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-on-surface-variant">Ticketart
                  <select className="field mt-1" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="">Alle Ticketarten</option>
                    {ISSUE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-on-surface-variant">Raum
                  <select className="field mt-1" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
                    <option value="">Alle Räume</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-on-surface-variant">Zuständige Person
                  <select className="field mt-1" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                    <option value="">Alle Zuständigen</option>
                    {assignees.map((a) => <option key={a.id} value={a.id}>{a.displayName || a.username}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-on-surface-variant">Ersteller
                  <select className="field mt-1" value={reporterFilter} onChange={(e) => setReporterFilter(e.target.value)}>
                    <option value="">Alle Ersteller</option>
                    {reporters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
                <div className="flex items-end">
                  <div className="flex w-full rounded-lg border border-black/10 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-0.5 text-sm shadow-sm">
                    <button
                      className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${ownerFilter === 'all' ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                      onClick={() => setOwnerFilter('all')}
                    >Alle</button>
                    <button
                      className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${ownerFilter === 'mine' ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                      onClick={() => setOwnerFilter('mine')}
                    >Meine</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <input className="field pl-9 w-full" placeholder="Suchen… (Titel, Gerät, Raum, Person)" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
        <div className="p-4 border-b border-black/5 dark:border-zinc-700 bg-[#fafafa] dark:bg-zinc-800/50 flex items-center justify-between">
          <div className="font-semibold text-gray-800 dark:text-zinc-100">
            {trashView ? 'Papierkorb' : ownerFilter === 'mine' ? 'Meine Tickets' : 'Alle Tickets'}
          </div>
          <span className="badge bg-white shadow-sm border border-black/5 dark:bg-zinc-800 dark:border-zinc-700 text-gray-600 dark:text-zinc-400">
            {(trashView ? trashIssues : sortedIssues).length} Ticket(s)
          </span>
        </div>
        <div className="divide-y divide-black/5 dark:divide-zinc-700">
          {(trashView ? trashIssues : sortedIssues).map((issue) => {
            const typeMeta = issueTypeMeta(issue.type);
            const statusMeta = ISSUE_STATUSES[issue.status] || ISSUE_STATUSES.OPEN;
            const priorityMeta = ISSUE_PRIORITIES[issue.priority] || ISSUE_PRIORITIES.NORMAL;
            const context = issueContext(issue);
            return (
              <div
                key={issue.id}
                onClick={() => navigate(`/issues?id=${issue.id}`)}
                className="p-4 hover:bg-gray-800/5 dark:hover:bg-zinc-800/50 cursor-pointer transition flex flex-col md:flex-row gap-3 md:items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-gray-900 dark:text-zinc-100">{issueDisplayTitle(issue)}</h4>
                    <span className={`badge shrink-0 ${typeMeta.badge}`}>{typeMeta.label}</span>
                    {context && <span className="badge shrink-0 bg-white dark:bg-zinc-800 border border-black/10 dark:border-zinc-700 text-gray-700 dark:text-zinc-300">{context}</span>}
                    <span className={`badge shrink-0 ${priorityMeta.badge}`}>{priorityMeta.label}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1 truncate">
                    {reporterName(issue)} · {typeMeta.label}
                    {context ? ` · ${context}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex flex-col items-end text-xs text-gray-400 dark:text-zinc-500 gap-0.5">
                    <span className={`badge shrink-0 border ${statusMeta.badge}`}>{statusMeta.label}</span>
                    <span>{timeAgo(issue.createdAt)}</span>
                    <span>von {reporterName(issue)}</span>
                    {issue.assignees?.length > 0 && (
                      <span className="text-gray-500 dark:text-zinc-400">
                        {joinNames(issue.assignees.map((a) => a.displayName || a.username))}
                      </span>
                    )}
                    {issue.primaryAssignee && (
                      <span className="font-medium text-gray-600 dark:text-zinc-300">
                        HV: {issue.primaryAssignee.displayName || issue.primaryAssignee.username}
                      </span>
                    )}
                    {issue.comments?.length > 0 && (
                      <span className="flex items-center gap-1 text-gray-300 dark:text-zinc-600">
                        <MessageCircle size={13} /> {issue.comments.length}
                      </span>
                    )}
                    {trashView && (
                      <span className="mt-1 flex flex-wrap justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          className="rounded-lg border border-black/10 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          onClick={() => restoreTicket(issue)}
                        >
                          <RotateCcw size={11} className="mr-1 inline" />Wiederherstellen
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                            onClick={() => deleteForever(issue)}
                          >
                            <Trash2 size={11} className="mr-1 inline" />Endgültig
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {(trashView ? trashIssues : sortedIssues).length === 0 && (
            <div className="p-10 text-center text-gray-500 dark:text-zinc-400 flex flex-col items-center gap-3">
              <Inbox size={28} className="text-gray-300 dark:text-zinc-600" />
              {trashView ? 'Der Papierkorb ist leer.' : 'Keine Tickets gefunden.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}