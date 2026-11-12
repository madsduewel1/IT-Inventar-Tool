import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  FileText,
  MessageSquare,
  Printer,
  Trash2,
  User,
  AlertCircle,
  CalendarClock,
  StickyNote
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../components/ConfirmDialog';
import { PageLoader } from '../components/Loading';

const STATUS_LABELS = {
  REQUESTED: 'Angefragt',
  DISCUSSION_REQUESTED: 'Gespräch erbeten',
  ACTIVE: 'Aktiv',
  OVERDUE: 'Überfällig',
  RETURNED: 'Zurückgegeben'
};

const STATUS_CLASSES = {
  REQUESTED: 'bg-badge-violet text-text-badge-violet',
  DISCUSSION_REQUESTED: 'bg-badge-yellow text-text-badge-yellow',
  ACTIVE: 'bg-badge-orange text-text-badge-orange',
  OVERDUE: 'bg-badge-red text-text-badge-red',
  RETURNED: 'bg-surface-container-high text-on-surface-variant'
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('de-DE');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LoanDetail() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirm = useConfirm();
  const permissions = user?.effectivePermissions || [];
  const canEdit = permissions.includes('LOAN_MANAGE');
  const canDelete = permissions.includes('LOAN_DELETE');

  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  // Freie Geräte für die Zuweisung (Bereichsauswahl vor der Freigabe).
  const [candidates, setCandidates] = useState([]);
  const [candidateDeviceId, setCandidateDeviceId] = useState('');
  const [assigning, setAssigning] = useState(false);

  async function load() {
    try {
      const { data } = await api.get(`/loans/${id}`);
      setLoan(data.loan);
      setError('');
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Ausleihe konnte nicht geladen werden.');
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setMessage('');
    setActionError('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function runAction(fn, successText, failText) {
    setActionError('');
    setMessage('');
    try {
      await fn();
      await load();
      if (successText) setMessage(successText);
    } catch (err) {
      setActionError(err.response?.data?.error || failText);
    }
  }

  // Vor der Freigabe: freie Geräte des Bereichs laden (bei einer Anfrage ohne
  // Bereich alle freien Geräte).
  useEffect(() => {
    if (!canEdit || !loan || !['REQUESTED', 'DISCUSSION_REQUESTED'].includes(loan.status)) {
      setCandidates([]);
      return;
    }
    let ignore = false;
    api.get('/devices', { params: { status: 'AVAILABLE' } })
      .then(({ data }) => {
        if (ignore) return;
        const free = (data.devices || []).filter((device) => device.isLendable !== false);
        const inArea = loan.areaId ? free.filter((device) => device.areaId === loan.areaId) : free;
        setCandidates(inArea);
        setCandidateDeviceId((current) => (current || loan.deviceId || ''));
      })
      .catch(() => { if (!ignore) setCandidates([]); });
    return () => { ignore = true; };
  }, [canEdit, loan?.id, loan?.status, loan?.areaId, loan?.deviceId]);

  async function assignDevice() {
    if (!candidateDeviceId) return;
    setAssigning(true);
    await runAction(
      () => api.patch(`/loans/${id}/device`, { deviceId: candidateDeviceId }),
      'Gerät wurde der Ausleihe zugewiesen.',
      'Gerät konnte nicht zugewiesen werden.'
    );
    setAssigning(false);
  }

  function approveLoan() {
    runAction(() => api.patch(`/loans/${id}/approve`, { message: 'Ausleihe wurde akzeptiert.' }), 'Ausleihe wurde akzeptiert.', 'Anfrage konnte nicht akzeptiert werden.');
  }

  function returnLoan() {
    runAction(() => api.patch(`/loans/${id}/return`), 'Ausleihe wurde zurückgenommen.', 'Rückgabe konnte nicht gespeichert werden.');
  }

  async function requestDiscussion() {
    const message = window.prompt('Nachricht an den Benutzer, z. B. "Bitte um Gespräch heute um 10:30 Uhr im IT-Büro".');
    if (!message?.trim()) return;
    runAction(() => api.patch(`/loans/${id}/discussion`, { message }), null, 'Gesprächsbitte konnte nicht gespeichert werden.');
  }

  function archiveLoan() {
    runAction(() => api.patch(`/loans/${id}/archive`), 'Ausleihe wurde archiviert.', 'Ausleihe konnte nicht archiviert werden.');
  }

  function unarchiveLoan() {
    runAction(() => api.patch(`/loans/${id}/unarchive`), 'Ausleihe wurde wiederhergestellt.', 'Ausleihe konnte nicht wiederhergestellt werden.');
  }

  async function deleteLoan() {
    const ok = await confirm({
      title: 'Ausleihe endgültig löschen',
      message: 'Diese Ausleihe wird dauerhaft gelöscht und kann nicht wiederhergestellt werden. Fortfahren?',
      tone: 'danger',
      confirmLabel: 'Endgültig löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    runAction(async () => {
      await api.delete(`/loans/${id}`);
      navigate('/loans', { replace: true });
    }, null, 'Ausleihe konnte nicht gelöscht werden.');
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <PageLoader text="Lade Ausleihe…" />
      </div>
    );
  }

  if (error && !loan) {
    return (
      <div className="card mx-auto max-w-xl p-10 text-center dark:bg-zinc-900 dark:border-zinc-800">
        <AlertCircle size={32} className="mx-auto mb-4 text-red-500" />
        <h2 className="text-xl font-bold text-gray-800 dark:text-zinc-100">Ausleihe nicht gefunden</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">{error}</p>
        <Link className="btn-secondary mt-6 inline-flex items-center gap-2" to="/loans">
          <ArrowLeft size={16} /> Zurück zur Ausleihe
        </Link>
      </div>
    );
  }

  if (!loan) return null;

  const device = loan.device || {};
  const borrower = loan.user?.displayName || loan.borrowerName || loan.user?.username || '—';
  const isArchived = Boolean(loan.archivedAt);
  const isPending = ['REQUESTED', 'DISCUSSION_REQUESTED'].includes(loan.status);
  const isActive = ['ACTIVE', 'OVERDUE'].includes(loan.status);

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <button className="btn-secondary hidden shrink-0 md:inline-flex" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-container-high text-primary">
            <ArrowLeftRight size={28} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-on-surface md:text-2xl">Ausleihe {loan.id}</h1>
              <span className={`badge shrink-0 ${STATUS_CLASSES[loan.status] || 'bg-surface-container-high text-outline'}`}>
                {STATUS_LABELS[loan.status] || loan.status}
              </span>
              {isArchived && <span className="badge shrink-0 bg-surface-container-high text-on-surface-variant">Archiviert</span>}
            </div>
            <p className="mt-0.5 truncate text-sm text-on-surface-variant">
              {device.inventoryId || device.model ? `${device.inventoryId || ''}${device.model ? ' · ' + device.model : ''}` : 'Unbekanntes Asset'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && isPending && (
            <button className="btn-primary" onClick={approveLoan}><CheckCircle2 size={16} />Akzeptieren</button>
          )}
          {canEdit && isActive && (
            <button className="btn-primary" onClick={returnLoan}><CheckCircle2 size={16} />Zurücknehmen</button>
          )}
          <Link className="btn-secondary" to={`/loans/certificate?id=${loan.id}`}><Printer size={16} />Bescheinigung drucken</Link>
        </div>
      </header>

      {message && <div className="rounded-xl bg-badge-green px-4 py-3 text-sm font-medium text-text-badge-green">{message}</div>}
      {actionError && <div className="rounded-xl bg-badge-red px-4 py-3 text-sm font-medium text-text-badge-red">{actionError}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {/* Asset */}
          <section className="card p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-on-surface">
              <ArrowLeftRight size={16} className="text-outline" /> {loan.areaId ? 'Bereich und Asset' : 'Asset'}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {loan.area && (
                <div>
                  <div className="text-xs text-on-surface-variant">Bereich</div>
                  <div className="font-semibold text-on-surface">
                    {loan.area.name}
                    {loan.area.room?.name ? ` · ${loan.area.room.name}` : ''}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-on-surface-variant">Inventarnummer</div>
                <div className="font-semibold text-on-surface">{device.inventoryId || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-on-surface-variant">Gerät</div>
                <div className="font-semibold text-on-surface">{device.model || device.manufacturer || '—'}</div>
              </div>
              {device.serialNumber && (
                <div>
                  <div className="text-xs text-on-surface-variant">Seriennummer</div>
                  <div className="font-mono text-on-surface">{device.serialNumber}</div>
                </div>
              )}
              {device.room?.name && (
                <div>
                  <div className="text-xs text-on-surface-variant">Standort</div>
                  <div className="font-medium text-on-surface">{device.room.name}</div>
                </div>
              )}
            </div>

            {/* Gerät vor der Freigabe festlegen (Konzept Abschnitt 12) */}
            {canEdit && ['REQUESTED', 'DISCUSSION_REQUESTED'].includes(loan.status) && candidates.length > 0 && (
              <div className="mt-4 border-t border-outline-variant pt-4">
                <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  Gerät zuweisen{loan.area ? ` (frei im Bereich ${loan.area.name})` : ''}
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <select
                    className="field min-w-0 flex-1"
                    value={candidateDeviceId}
                    onChange={(event) => setCandidateDeviceId(event.target.value)}
                  >
                    <option value="">Automatisch (Vorschlag der IT)</option>
                    {candidates.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.inventoryId}{entry.model ? ` · ${entry.model}` : ''}{entry.room?.name ? ` · ${entry.room.name}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-secondary shrink-0"
                    onClick={assignDevice}
                    disabled={assigning || !candidateDeviceId || candidateDeviceId === loan.deviceId}
                  >
                    {candidateDeviceId === loan.deviceId && loan.deviceId ? 'Zugewiesen' : 'Zuweisen'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-on-surface-variant">
                  Ohne Zuweisung sucht die IT beim Akzeptieren das passende freie Gerät.
                </p>
              </div>
            )}
          </section>

          {/* Ausleiher */}
          <section className="card p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-on-surface">
              <User size={16} className="text-outline" /> Ausleiher
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-on-surface-variant">Name</div>
                <div className="font-semibold text-on-surface">{borrower}</div>
              </div>
              {loan.borrowerContact && (
                <div>
                  <div className="text-xs text-on-surface-variant">Kontakt</div>
                  <div className="font-medium text-on-surface">{loan.borrowerContact}</div>
                </div>
              )}
              {loan.borrowerGroup && (
                <div>
                  <div className="text-xs text-on-surface-variant">Klasse / Gruppe / Einrichtung</div>
                  <div className="font-medium text-on-surface">{loan.borrowerGroup}</div>
                </div>
              )}
              {loan.user?.email && (
                <div>
                  <div className="text-xs text-on-surface-variant">E-Mail</div>
                  <div className="font-medium text-on-surface">{loan.user.email}</div>
                </div>
              )}
            </div>
          </section>

          {/* Zeitraum */}
          <section className="card p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-on-surface">
              <CalendarClock size={16} className="text-outline" /> Zeitraum
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-xs text-on-surface-variant">Ausgabe</div>
                <div className="font-semibold text-on-surface">{formatDate(loan.startDate)}</div>
              </div>
              <div>
                <div className="text-xs text-on-surface-variant">Rückgabe bis</div>
                <div className="font-semibold text-on-surface">{formatDate(loan.dueDate)}</div>
              </div>
              {loan.returnDate && (
                <div>
                  <div className="text-xs text-on-surface-variant">Zurückgegeben am</div>
                  <div className="font-semibold text-on-surface">{formatDate(loan.returnDate)}</div>
                </div>
              )}
            </div>
          </section>

          {loan.requestReason && (
            <section className="card p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Grund der Anfrage</div>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-on-surface">{loan.requestReason}</p>
            </section>
          )}

          {loan.decisionMessage && (
            <section className="card p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Entscheidung / Nachricht</div>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-on-surface">{loan.decisionMessage}</p>
              {loan.decidedAt && (
                <p className="mt-2 text-xs text-on-surface-variant">Entschieden am {formatDateTime(loan.decidedAt)}</p>
              )}
            </section>
          )}

          {loan.notes && (
            <section className="card p-5">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-on-surface">
                <StickyNote size={16} className="text-outline" /> Hinweise
              </h2>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-on-surface">{loan.notes}</p>
            </section>
          )}
        </div>

        {/* Aktionen */}
        <aside>
          <div className="sticky top-6 space-y-4">
            <section className="card p-5">
              <div className="mb-3 font-semibold text-on-surface">Aktionen</div>
              <div className="space-y-2">
                <Link className="btn-secondary w-full justify-center" to={`/loans/certificate?id=${loan.id}`}>
                  <FileText size={16} />Bescheinigung drucken
                </Link>

                {canEdit && isPending && (
                  <button className="btn-primary w-full justify-center" onClick={approveLoan}>
                    <CheckCircle2 size={16} />Akzeptieren
                  </button>
                )}
                {canEdit && isPending && (
                  <button className="btn-secondary w-full justify-center" onClick={requestDiscussion}>
                    <MessageSquare size={16} />Bitte um Gespräch
                  </button>
                )}
                {canEdit && isActive && (
                  <button className="btn-secondary w-full justify-center" onClick={returnLoan}>
                    <CheckCircle2 size={16} />Zurücknehmen
                  </button>
                )}
                {canEdit && !isArchived && (
                  <button className="btn-secondary w-full justify-center" onClick={archiveLoan}>
                    <Archive size={16} />Archivieren
                  </button>
                )}
                {canEdit && isArchived && (
                  <button className="btn-secondary w-full justify-center" onClick={unarchiveLoan}>
                    <ArchiveRestore size={16} />Wiederherstellen
                  </button>
                )}
                {canDelete && (
                  <button className="btn-secondary w-full justify-center text-red-600 border-red-700/40 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={deleteLoan}>
                    <Trash2 size={16} />Endgültig löschen
                  </button>
                )}
                {!canEdit && (
                  <p className="pt-1 text-xs leading-5 text-on-surface-variant">
                    Du kannst diese Ausleihe nur einsehen. Rückfragen zur Freigabe werden dir hier angezeigt.
                  </p>
                )}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}