import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MessageCircle, Save, AlertCircle, History, Paperclip, Download, MapPin, Wifi, Monitor, User, AppWindow, RefreshCw, ChevronDown, MessageSquareWarning } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../components/ConfirmDialog';
import { PageLoader } from '../components/Loading';
import { ISSUE_STATUSES, ISSUE_PRIORITIES, issueTypeMeta, issueContext, issueDevices, issueDisplayTitle, reporterName } from '../components/issueMeta';
import { isAssignedTo, joinNames } from '../utils/issues';

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Offen' },
  { value: 'IN_PROGRESS', label: 'In Bearbeitung' },
  { value: 'WAITING', label: 'Warten auf Rückmeldung' },
  { value: 'CLOSED', label: 'Geschlossen' }
];

// Intervall der Live-Aktualisierung. Ohne Websocket-Server wird der Verlauf in
// regelmäßigen Abständen neu geladen, damit Antworten der IT sofort erscheinen.
const LIVE_REFRESH_MS = 10000;

function fmtTime(date) {
  return new Date(date).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isImage(mime) {
  return typeof mime === 'string' && mime.startsWith('image/');
}

const TYPE_ICONS = { Monitor, User, Wifi, AppWindow };

export default function IssueDetail() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [issue, setIssue] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(location.state?.confirmation || '');
  const [timelineView, setTimelineView] = useState('chat');
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const [liveError, setLiveError] = useState('');
  // Sobald im Bearbeitungsformular etwas geändert, aber noch nicht gespeichert
  // wurde, überschreibt die Live-Aktualisierung diese Felder nicht mehr.
  const formDirtyRef = useRef(false);
  const chatScrollRef = useRef(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    try {
      const { data } = await api.get(`/issues/${id}`);
      setIssue(data.issue);
      setCanManage(data.canManage);
      setCanRestore(Boolean(data.canRestore));
      if (data.canManage) {
        api.get('/issues/assignees').then((res) => setAssignees(res.data.assignees || [])).catch(() => {});
      }
      formDirtyRef.current = false;
      setEditForm({
        status: data.issue.status,
        priority: data.issue.priority,
        resolution: data.issue.resolution || '',
        assigneeIds: (data.issue.assignees || []).map((a) => a.id),
        primaryAssigneeId: data.issue.primaryAssigneeId || ''
      });
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Laden des Tickets.');
      setLoading(false);
    }
  }

  /**
   * Lädt nur die flüchtigen Teile des Tickets neu (Verlauf, Chat, Status,
   * Bearbeiter). Nachrichten der IT erscheinen dadurch ohne Neuladen der Seite.
   * Bearbeitungsformular-Eingaben bleiben unangetastet.
   */
  async function refreshLive() {
    if (!id) return;
    try {
      const { data } = await api.get(`/issues/${id}`);
      setIssue((prev) => {
        const merged = { ...data.issue };
        if (formDirtyRef.current && prev) {
          merged.status = prev.status;
          merged.priority = prev.priority;
          merged.resolution = prev.resolution;
          merged.assignees = prev.assignees;
        }
        return merged;
      });
      setLiveUpdatedAt(new Date());
      setLiveError('');
    } catch (err) {
      // Ein einzelner fehlgeschlagener Abruf soll keine Fehlermeldung erzwingen;
      // der nächste Versuch im laufenden Intervall holt ohnehin wieder auf.
      if (err.response?.status !== 404) setLiveError('Live-Aktualisierung gerade nicht erreichbar – es wird automatisch weiter versucht.');
    }
  }

  // Live-Aktualisierung des Verlaufs. pausiert im Hintergrund-Tab, damit keine
  // unnötigen Anfragen entstehen, und holt beim Zurückkehren sofort nach.
  useEffect(() => {
    if (!id) return undefined;
    const run = () => { if (!document.hidden) refreshLive(); };
    const interval = setInterval(run, LIVE_REFRESH_MS);
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Neue Nachrichten bleiben unten sichtbar, ohne dass der Nutzer scrollen muss.
  const commentCount = issue?.comments?.length || 0;
  useEffect(() => {
    const box = chatScrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [commentCount]);

  function changeEditForm(patch) {
    formDirtyRef.current = true;
    setEditForm((prev) => ({ ...prev, ...patch }));
  }

  async function submitComment(event) {
    if (event) event.preventDefault();
    if (!commentText.trim() || !issue) return;
    setActionError('');
    try {
      const { data } = await api.post(`/issues/${issue.id}/comments`, { text: commentText });
      setIssue((prev) => ({ ...prev, comments: [...(prev.comments || []), data.comment] }));
      setCommentText('');
      setLiveUpdatedAt(new Date());
    } catch {
      setActionError('Nachricht konnte nicht gespeichert werden.');
    }
  }

  async function addInternalNote(event) {
    if (event) event.preventDefault();
    if (!noteText.trim() || !issue) return;
    setActionError('');
    setAddingNote(true);
    try {
      const { data } = await api.post(`/issues/${issue.id}/notes`, { text: noteText });
      setIssue((prev) => ({ ...prev, internalNotes: [...(prev.internalNotes || []), data.note] }));
      setNoteText('');
    } catch {
      setActionError('Interne Notiz konnte nicht gespeichert werden.');
    } finally {
      setAddingNote(false);
    }
  }

  async function deleteInternalNote(noteId) {
    setActionError('');
    try {
      await api.delete(`/issues/${issue.id}/notes/${noteId}`);
      setIssue((prev) => ({ ...prev, internalNotes: (prev.internalNotes || []).filter((note) => note.id !== noteId) }));
    } catch {
      setActionError('Interne Notiz konnte nicht gelöscht werden.');
    }
  }

  async function restoreIssue() {
    setActionError('');
    try {
      const { data } = await api.post(`/issues/${issue.id}/restore`);
      setIssue(data.issue);
      setCanRestore(false);
    } catch {
      setActionError('Ticket konnte nicht wiederhergestellt werden.');
    }
  }

  async function updateIssue(event) {
    if (event) event.preventDefault();
    setActionError('');
    setSaving(true);
    try {
      await api.patch(`/issues/${issue.id}`, editForm);
      await load();
    } catch {
      setActionError('Ticket konnte nicht aktualisiert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteIssue() {
    const ok = await confirm({
      title: canManage ? 'Ticket in den Papierkorb' : 'Ticket zurücknehmen',
      message: canManage
        ? 'Das Ticket wird in den Papierkorb verschoben und kann von Administratoren wiederhergestellt werden.'
        : 'Möchtest du dieses Ticket wirklich zurücknehmen?',
      tone: 'danger',
      confirmLabel: canManage ? 'In Papierkorb' : 'Zurücknehmen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    setActionError('');
    try {
      await api.delete(`/issues/${issue.id}`);
      navigate(canManage ? '/issues/manage' : '/issues', { replace: true });
    } catch {
      setActionError('Ticket konnte nicht gelöscht werden.');
    }
  }

  // „Mir zuweisen" ergänzt die eigene ID, ohne andere Bearbeiter zu entfernen.
  async function assignToMe() {
    setActionError('');
    setSaving(true);
    try {
      const current = (issue.assignees || []).map((a) => a.id);
      const next = current.includes(user.id) ? current : [...current, user.id];
      await api.patch(`/issues/${issue.id}`, { assigneeIds: next });
      await load();
    } catch {
      setActionError('Ticket konnte nicht zugewiesen werden.');
    } finally {
      setSaving(false);
    }
  }

  function toggleAssignee(userId) {
    setEditForm((prev) => {
      formDirtyRef.current = true;
      const current = prev.assigneeIds || [];
      const next = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      return {
        ...prev,
        assigneeIds: next,
        primaryAssigneeId: next.includes(prev.primaryAssigneeId) ? prev.primaryAssigneeId : ''
      };
    });
  }

  const timeline = useMemo(() => {
    if (!issue) return [];
    const events = [];
    (issue.activities || []).forEach((a) => events.push({ at: new Date(a.createdAt).getTime(), kind: 'activity', data: a }));
    (issue.comments || []).forEach((c) => events.push({ at: new Date(c.createdAt).getTime(), kind: 'comment', data: c }));
    return events.sort((a, b) => a.at - b.at);
  }, [issue]);

  // Systemereignisse und Chat getrennt darstellen, damit Änderungen nicht
  // zwischen den Nachrichten untergehen.
  const visibleTimeline = timeline.filter((event) => (timelineView === 'chat'
    ? event.kind === 'comment'
    : event.kind === 'activity'));

  if (loading) return <PageLoader text="Lade Ticket…" />;
  if (error) return (
    <div className="card p-10 text-center flex flex-col items-center dark:bg-zinc-900 dark:border-zinc-800">
      <AlertCircle size={32} className="text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-800 dark:text-zinc-100">Fehler</h2>
      <p className="text-gray-500 dark:text-zinc-400 mt-2">{error}</p>
      <button className="btn-secondary mt-6" onClick={() => navigate(-1)}>Zurück</button>
    </div>
  );

  const typeMeta = issueTypeMeta(issue.type);
  const statusMeta = ISSUE_STATUSES[issue.status] || ISSUE_STATUSES.OPEN;
  const priorityMeta = ISSUE_PRIORITIES[issue.priority] || ISSUE_PRIORITIES.NORMAL;
  const context = issueContext(issue);
  const TypeIcon = TYPE_ICONS[typeMeta.icon];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Hauptspalte: Kopf, Beschreibung, Verlauf. Auf dem Desktop nimmt sie die
          gesamte verfügbare Bildschirmhöhe ein – der Chat wächst mit, damit oben
          und unten kaum gescrollt werden muss. */}
      <div className="flex min-w-0 flex-col gap-4 lg:min-h-[calc(100dvh-6.5rem)]">
        {/* Kopfbereich */}
        <header className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <button className="btn-secondary hidden shrink-0 md:inline-flex" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-container-high text-primary sm:h-14 sm:w-14">
              <TypeIcon size={26} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words text-xl font-bold text-on-surface md:text-2xl">{issueDisplayTitle(issue)}</h1>
                <span className={`badge shrink-0 border ${statusMeta.badge}`}>{statusMeta.label}</span>
                <span className={`badge shrink-0 ${priorityMeta.badge}`}>{priorityMeta.label}</span>
              </div>
              <p className="mt-1 text-sm text-on-surface-variant">
                {typeMeta.label} · Gemeldet von {reporterName(issue)} am {new Date(issue.createdAt).toLocaleDateString('de-DE')} · Ticket-ID {issue.id}
                {context ? <span> · {context}</span> : null}
              </p>
            </div>
          </div>
        </header>

        {confirmation && (
          <div className="flex items-start gap-2 rounded-xl bg-badge-green px-4 py-3 text-sm font-medium text-text-badge-green">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {confirmation}
          </div>
        )}

        {issue.deletedAt && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">Dieses Ticket liegt im Papierkorb.</span>
            {canRestore && (
              <button type="button" className="btn-secondary" onClick={restoreIssue}>
                Wiederherstellen
              </button>
            )}
          </div>
        )}

        {actionError && (
          <div className="flex items-start gap-2 rounded-xl bg-badge-red px-4 py-3 text-sm font-medium text-text-badge-red">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {actionError}
          </div>
        )}

        {/* Beschreibung inkl. Lösung und Anhänge in einer kompakten Card */}
        <section className="card p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <MessageSquareWarning size={16} className="text-outline" /> Problembeschreibung
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-on-surface-variant">{issue.description}</p>

          {issue.resolution && (
            <div className="mt-4 flex gap-3 rounded-xl bg-badge-green px-4 py-3 text-sm font-medium text-text-badge-green">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold">Lösung der IT</div>
                <div className="mt-1 whitespace-pre-wrap font-normal">{issue.resolution}</div>
              </div>
            </div>
          )}

          {issue.attachments?.length > 0 && (
            <div className="mt-4 border-t border-outline-variant pt-4">
              <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                <Paperclip size={14} className="text-outline" /> Anhänge ({issue.attachments.length})
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {issue.attachments.map((file) => (
                  isImage(file.type) ? (
                    <a key={file.filename} href={file.url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
                      <img src={file.url} alt={file.name} className="h-36 w-full object-cover group-hover:opacity-90 transition" />
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-on-surface-variant">
                        <span className="min-w-0 truncate">{file.name}</span>
                        <Download size={13} className="shrink-0" />
                      </div>
                    </a>
                  ) : (
                    <a key={file.filename} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant transition hover:bg-surface-container-high">
                      <Paperclip size={16} className="shrink-0 text-outline" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <Download size={14} className="shrink-0 text-outline" />
                    </a>
                  )
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Verlauf & Chat – füllt auf dem Desktop die restliche Höhe der Spalte */}
        <section className="card flex h-[55vh] min-h-[15rem] flex-col overflow-hidden lg:h-auto lg:flex-1">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-2">
            <History size={16} className="text-outline" />
            <div className="flex rounded-lg border border-outline-variant p-0.5">
              <button
                type="button"
                onClick={() => setTimelineView('chat')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${timelineView === 'chat' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                Chat ({(issue.comments || []).length})
              </button>
              <button
                type="button"
                onClick={() => setTimelineView('history')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${timelineView === 'history' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                Verlauf ({(issue.activities || []).length})
              </button>
            </div>
            <span className="ml-auto flex items-center gap-2 text-[11px] font-normal text-on-surface-variant">
              <span className="hidden sm:inline">
                {liveError
                  ? liveError
                  : liveUpdatedAt
                    ? `automatisch aktualisiert, ${liveUpdatedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                    : 'Live-Aktualisierung läuft'}
              </span>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-outline-variant text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
                title="Jetzt aktualisieren"
                onClick={() => refreshLive()}
              >
                <RefreshCw size={14} />
              </button>
            </span>
          </div>

          <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
            {visibleTimeline.map((event, index) => {
              if (event.kind === 'activity') {
                const a = event.data;
                const actor = a.user?.displayName || a.user?.username;
                return (
                  <div key={`a-${index}`} className="animate-fade-in flex items-start gap-3 text-xs text-outline">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.action === 'CREATED' ? 'bg-primary' : 'bg-outline-variant'}`} />
                    <span className="shrink-0 whitespace-nowrap">{fmtTime(a.createdAt)}</span>
                    <span className="min-w-0 break-words">
                      {actor ? <strong className="font-semibold text-on-surface-variant">{actor}</strong> : null}
                      {actor ? ' — ' : ''}{a.details}
                    </span>
                  </div>
                );
              }
              const c = event.data;
              const isMe = c.userId === user.id;
              const isIT = c.user?.role === 'STAFF' || c.user?.role === 'ADMIN';
              return (
                <div key={`c-${index}`} className={`animate-fade-in flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="mb-1 flex flex-wrap items-baseline gap-2 px-1">
                    <span className="text-xs font-semibold text-on-surface-variant">{isMe ? 'Du' : (c.user?.displayName || c.user?.username)}</span>
                    {isIT && !isMe && <span className="rounded bg-surface-container-highest px-1.5 py-0.5 text-[10px] font-bold text-on-surface">IT</span>}
                    <span className="text-[10px] text-outline">{fmtTime(c.createdAt)}</span>
                  </div>
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl p-3.5 text-sm ${isMe ? 'rounded-tr-sm bg-primary text-on-primary' : 'rounded-tl-sm border border-outline-variant bg-surface-container-low text-on-surface'}`}>
                    {c.text}
                  </div>
                </div>
              );
            })}
            {visibleTimeline.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-outline">
                {timelineView === 'chat' ? 'Noch keine Nachrichten vorhanden.' : 'Noch keine Systemereignisse vorhanden.'}
              </div>
            )}
          </div>

          {timelineView === 'chat' && (
            <form onSubmit={submitComment} className="flex shrink-0 gap-2 border-t border-outline-variant p-3 sm:p-4">
              <input
                className="field flex-1"
                placeholder="Nachricht schreiben…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button type="submit" className="btn-primary shrink-0" disabled={!commentText.trim()}>Senden</button>
            </form>
          )}
        </section>
      </div>

      {/* Seitenpalte: Ticket-Info und IT-Bearbeitung. Auf dem Desktop klebt sie
          mit, mobil erscheint sie kompakt unter dem Chat. */}
      <aside className="min-w-0">
        <div className="space-y-4 lg:sticky lg:top-6">
          <CollapsibleCard title="Ticket-Info" icon={TypeIcon}>
            <dl className="divide-y divide-outline-variant/70 text-sm">
              <InfoRow label="Ticketart">{typeMeta.label}</InfoRow>

              {issue.type === 'WLAN' && (
                <InfoRow label="Raum">
                  <span className="flex items-center justify-end gap-1.5">
                    <MapPin size={13} className="shrink-0 text-outline" />
                    {issue.room?.name || '—'}{issue.room?.building ? ` (${issue.room.building})` : ''}
                  </span>
                </InfoRow>
              )}

              {issue.type === 'SOFTWARE' && (
                <InfoRow label="Software">{issue.softwareName || '—'}</InfoRow>
              )}

              <InfoRow label="Zugewiesen an">
                {issue.assignees?.length
                  ? joinNames(issue.assignees.map((a) => a.displayName || a.username))
                  : 'Nicht zugewiesen'}
              </InfoRow>

              <InfoRow label="Hauptverantwortlich">
                {issue.primaryAssignee
                  ? (issue.primaryAssignee.displayName || issue.primaryAssignee.username)
                  : '—'}
              </InfoRow>

              {issue.templateName && <InfoRow label="Vorlage">{issue.templateName}</InfoRow>}

              <InfoRow label="Erstellt">{fmtTime(issue.createdAt)}</InfoRow>
            </dl>

            {issue.type === 'DEVICE' && issueDevices(issue).length > 0 && (
              <div className="pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  {issueDevices(issue).length === 1 ? 'Gerät' : `Geräte (${issueDevices(issue).length})`}
                </div>
                <div className="mt-2 space-y-2">
                  {issueDevices(issue).map((device) => (
                    <div key={device.id} className="space-y-1.5 rounded-xl border border-outline-variant bg-surface-container-low p-3 text-xs">
                      <Link
                        to={`/devices?id=${device.id}`}
                        className="block font-semibold text-muted hover:text-main hover:underline"
                      >
                        {device.inventoryId}
                        {device.model ? <span className="font-normal text-outline"> – {device.model}</span> : null}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-on-surface-variant">
                        {device.serialNumber && <span>SN: {device.serialNumber}</span>}
                        {device.room?.name && (
                          <span className="flex items-center gap-1">
                            <MapPin size={11} className="text-outline" /> {device.room.name}
                          </span>
                        )}
                        <span>Status: {device.status || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {issue.comments?.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 border-t border-outline-variant pt-3 text-xs text-outline">
                <MessageCircle size={13} /> {issue.comments.length} Nachricht(en)
              </div>
            )}
          </CollapsibleCard>

          {canManage && (
            <section className="card p-4">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-on-surface">
                <MessageSquareWarning size={16} className="text-outline" /> Interne Notizen
              </h2>
              <p className="mb-3 text-xs text-outline">Nur für IT und Administration sichtbar – wird nicht an den Reporter gemailt.</p>
              <form onSubmit={addInternalNote} className="space-y-2">
                <textarea
                  className="field min-h-20"
                  placeholder="Interne Information, Diagnose oder Übergabehinweis…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <button className="btn-secondary w-full" type="submit" disabled={addingNote || !noteText.trim()}>
                  {addingNote ? 'Speichert…' : 'Notiz hinzufügen'}
                </button>
              </form>
              {(issue.internalNotes || []).length > 0 && (
                <ul className="mt-3 space-y-2">
                  {issue.internalNotes.map((note) => (
                    <li key={note.id} className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
                      <div className="mb-1 flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300">
                        <span className="font-semibold">{note.user?.displayName || note.user?.username || 'Unbekannt'}</span>
                        <span>{fmtTime(note.createdAt)}</span>
                        {(note.userId === user.id || ['ADMIN'].includes(user?.effectiveRole || user?.role)) && (
                          <button
                            type="button"
                            className="ml-auto text-amber-600 hover:text-red-600 dark:text-amber-300"
                            onClick={() => deleteInternalNote(note.id)}
                          >
                            Löschen
                          </button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap">{note.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {canManage && !issue.deletedAt ? (
            <section className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
                <Save size={16} className="text-outline" /> IT-Bearbeitung
              </h2>
              <form onSubmit={updateIssue} className="space-y-3">
                <label className="block text-sm font-medium text-on-surface-variant">Status
                  <select className="field mt-1" value={editForm.status} onChange={(e) => changeEditForm({ status: e.target.value })}>
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-on-surface-variant">Priorität
                  <select className="field mt-1" value={editForm.priority} onChange={(e) => changeEditForm({ priority: e.target.value })}>
                    {Object.entries(ISSUE_PRIORITIES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                  </select>
                </label>
                <div className="block text-sm font-medium text-on-surface-variant">
                  Bearbeiter (mehrfach möglich)
                  {editForm.assigneeIds?.length > 0 && (
                    <span className="ml-1 font-normal text-outline">
                      {editForm.assigneeIds.length} ausgewählt
                    </span>
                  )}
                  <div className="mt-1 max-h-48 divide-y divide-outline-variant/70 overflow-y-auto rounded-md border border-outline-variant">
                    {assignees.map((a) => {
                      const selected = (editForm.assigneeIds || []).includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition ${
                            selected
                              ? 'bg-primary/10 text-on-surface'
                              : 'text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleAssignee(a.id)}
                            className="h-5 w-5 shrink-0 accent-primary"
                          />
                          <span className="flex-1 truncate">{a.displayName || a.username}</span>
                        </label>
                      );
                    })}
                    {assignees.length === 0 && (
                      <div className="px-3 py-2 text-sm text-outline">Keine Benutzer verfügbar.</div>
                    )}
                  </div>
                </div>
                <label className="block text-sm font-medium text-on-surface-variant">Hauptverantwortlich
                  <select
                    className="field mt-1"
                    value={editForm.primaryAssigneeId || ''}
                    onChange={(e) => changeEditForm({ primaryAssigneeId: e.target.value })}
                  >
                    <option value="">Kein Hauptverantwortlicher</option>
                    {(editForm.assigneeIds || []).map((assigneeId) => {
                      const entry = assignees.find((candidate) => candidate.id === assigneeId);
                      return entry ? (
                        <option key={entry.id} value={entry.id}>{entry.displayName || entry.username}</option>
                      ) : null;
                    })}
                  </select>
                </label>
                <label className="block text-sm font-medium text-on-surface-variant">Offizielle Lösungsnotiz
                  <textarea className="field mt-1 min-h-20" placeholder="Wird für den Nutzer grün hervorgehoben…" value={editForm.resolution} onChange={(e) => changeEditForm({ resolution: e.target.value })} />
                </label>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary flex-1" onClick={assignToMe} disabled={saving}>
                    Mir zuweisen
                  </button>
                  <button className="btn-primary flex-1" type="submit" disabled={saving}>
                    {saving ? 'Speichert…' : 'Speichern'}
                  </button>
                </div>
              </form>
              <button type="button" onClick={deleteIssue} className="btn-secondary mt-3 w-full border-red-700/40 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20">
                In den Papierkorb verschieben
              </button>
            </section>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-xs leading-5 text-on-surface-variant">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-outline" />
                Du kannst Status und Priorität nicht bearbeiten. Bitte nutze den Chat für Rückfragen an die IT.
              </div>
              {issue.reporterId === user.id && (
                <button onClick={deleteIssue} className="btn-secondary w-full border-red-700/40 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20">
                  Ticket zurücknehmen
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

// Karte mit aufklappbarem Inhalt: mobil standardmäßig eingeklappt, damit auf
// kleinen Displays wenig gescrollt wird – ab md immer geöffnet, genau wie die
// Abschnitte auf der Gerätedetailseite.
function CollapsibleCard({ title, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left md:cursor-default md:pointer-events-none"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          {Icon && <Icon size={16} className="text-outline" />}
          {title}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-outline transition-transform md:hidden ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`border-t border-outline-variant ${open ? 'block animate-fade-in' : 'hidden md:block'}`}>
        <div className="px-4 py-3">{children}</div>
      </div>
    </section>
  );
}

// Ein Label/Wert-Paar in der Ticket-Info.
function InfoRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="shrink-0 text-on-surface-variant">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-on-surface">{children}</dd>
    </div>
  );
}
