import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronRight, FileText, Plus, Search, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import MultiSelect from '../components/MultiSelect';

const LOAN_STATUS_OPTIONS = [
  { value: 'REQUESTED', label: 'Angefragt' },
  { value: 'DISCUSSION_REQUESTED', label: 'Gespräch erbeten' },
  { value: 'ACTIVE', label: 'Aktiv' },
  { value: 'OVERDUE', label: 'Überfällig' },
  { value: 'RETURNED', label: 'Zurückgegeben' }
];

export default function Loans({ mine = false }) {
  const { user } = useAuth();
  const permissions = user?.effectivePermissions || [];
  const canEdit = permissions.includes('LOAN_MANAGE') && !mine;
  const personalView = mine || !canEdit;
  const [loans, setLoans] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState([]);
  const [areaFilters, setAreaFilters] = useState([]);
  const [areas, setAreas] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const archivedParam = showArchived ? '?archived=true' : '';
      const loansReq = personalView ? api.get(`/loans/my${archivedParam}`) : api.get(`/loans${archivedParam}`);
      const { data } = await loansReq;
      setLoans(data.loans || []);
      setError('');
    } catch {
      setError('Ausleihen konnten nicht geladen werden.');
    }
  }

  useEffect(() => {
    load();
  }, [personalView, showArchived]);

  useEffect(() => {
    api.get('/areas').then(({ data }) => setAreas(data.areas || [])).catch(() => setAreas([]));
  }, []);

  const filtered = useMemo(() => loans.filter((loan) => {
    const haystack = [
      loan.device?.inventoryId,
      loan.device?.model,
      loan.borrowerName,
      loan.borrowerContact,
      loan.borrowerGroup,
      loan.user?.displayName,
      loan.user?.username,
      loan.notes,
      loan.requestReason,
      loan.decisionMessage,
      loan.area?.name
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase())
      && (!statusFilters.length || statusFilters.includes(loan.status))
      && (!areaFilters.length || areaFilters.includes(loan.areaId));
  }), [loans, query, statusFilters, areaFilters]);

  const hasFilters = Boolean(query.trim()) || statusFilters.length > 0 || areaFilters.length > 0;

  function resetFilters() {
    setQuery('');
    setStatusFilters([]);
    setAreaFilters([]);
  }

  const detailTo = (loan) => `/loans/detail?id=${loan.id}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{personalView ? 'Meine Ausleihen' : 'Ausleihe'}</h1>
          <p className="mt-1 text-sm text-gray-500">{personalView ? 'Eigene Ausleihen und Anfragen im Blick behalten' : 'Ausleihen, Rückgaben und offene Anfragen verwalten'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Link className="btn-secondary" to="/loans/request"><Plus size={17} />Ausleihe anfragen</Link>}
          {personalView && <Link className="btn-primary" to="/loans/request"><Plus size={17} />Ausleihe anfragen</Link>}
          {canEdit && <Link className="btn-primary" to="/loans/new"><Plus size={17} />Neu hinzufügen</Link>}
          {canEdit && (
            <button className="btn-secondary" onClick={() => setShowArchived((current) => !current)}>
              {showArchived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
              {showArchived ? 'Aktive Ausleihen' : 'Archiv anzeigen'}
            </button>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-2">
        <Metric label="Anfragen" value={loans.filter((loan) => loan.status === 'REQUESTED').length} tone="green" />
        <Metric label="Aktiv (inkl. überfällig)" value={loans.filter((loan) => ['ACTIVE', 'OVERDUE'].includes(loan.status)).length} tone="orange" />
      </section>

      <section className="card overflow-hidden">
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{error}</div>}
        <div className="grid gap-3 border-b border-black/5 p-4 lg:grid-cols-[1fr_200px_190px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input className="field pl-9" placeholder="Asset, Ausleiher, Grund oder Nachricht suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <MultiSelect
            options={LOAN_STATUS_OPTIONS}
            value={statusFilters}
            onChange={setStatusFilters}
            placeholder="Alle Status"
          />
          <MultiSelect
            options={areas.map((entry) => ({ value: entry.id, label: entry.name }))}
            value={areaFilters}
            onChange={setAreaFilters}
            placeholder="Alle Bereiche"
            searchPlaceholder="Bereich suchen…"
          />
          {hasFilters && (
            <button type="button" className="btn-secondary" onClick={resetFilters}>
              <X size={17} />Zurücksetzen
            </button>
          )}
        </div>

        <div className="divide-y divide-black/5 md:hidden">
          {filtered.map((loan) => (
            <LoanCard key={loan.id} loan={loan} to={detailTo(loan)} />
          ))}
          {!filtered.length && <div className="p-5 text-sm text-gray-500">Keine Ausleihen gefunden.</div>}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Asset</th>
                <th className="p-4 text-left font-medium">Ausleiher</th>
                <th className="p-4 text-left font-medium">Zeitraum</th>
                <th className="p-4 text-left font-medium">Grund / Nachricht</th>
                <th className="p-4 text-left font-medium">Status</th>
                <th className="p-4 text-left font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((loan) => (
                <tr key={loan.id} className="table-row align-top">
                  <td className="p-4">
                    <Link className="font-semibold text-gray-800 hover:text-gray-900" to={detailTo(loan)}>{loan.device?.model || loan.device?.inventoryId || loan.requestedModel || 'Anfrage ohne Gerät'}</Link>
                    <div className="text-xs text-gray-500">{loan.device?.inventoryId}</div>
                    {loan.area?.name && <div className="mt-0.5 text-xs text-gray-500">Bereich: {loan.area.name}</div>}
                  </td>
                  <td className="p-4 text-gray-600">
                    <div className="font-medium text-gray-800">{loan.user?.displayName || loan.borrowerName || loan.user?.username || '-'}</div>
                    {(loan.borrowerContact || loan.borrowerGroup) && <div className="text-xs text-gray-500">{[loan.borrowerContact, loan.borrowerGroup].filter(Boolean).join(' - ')}</div>}
                  </td>
                  <td className="p-4 text-gray-600">
                    <div>{loan.startDate?.slice(0, 10)}</div>
                    <div className="text-xs text-gray-500">bis {loan.dueDate?.slice(0, 10)}</div>
                  </td>
                  <td className="max-w-xs p-4 text-gray-600">
                    {loan.requestReason && <div className="line-clamp-2">{loan.requestReason}</div>}
                    {loan.decisionMessage && <div className="mt-2 rounded-md bg-gray-100 dark:bg-zinc-800/50 p-2 text-xs text-gray-600 dark:text-gray-400">{loan.decisionMessage}</div>}
                  </td>
                  <td className="p-4"><Status status={loan.status} /></td>
                  <td className="p-4">
                    <div className="flex flex-col gap-2">
                      <Link className="btn-secondary min-h-11 sm:min-h-9 justify-center text-xs" to={detailTo(loan)}><ChevronRight className="mr-1 inline" size={15} />Details</Link>
                      <Link className="font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white" to={`/loans/certificate?id=${loan.id}`}><FileText className="mr-1 inline" size={16} />Bescheinigung</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="6">Keine Ausleihen gefunden.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Status({ status }) {
  const classes = {
    REQUESTED: 'bg-gray-100 text-gray-700',
    DISCUSSION_REQUESTED: 'bg-yellow-100 text-yellow-700',
    OVERDUE: 'bg-red-100 text-red-700',
    RETURNED: 'bg-gray-100 text-gray-600',
    ACTIVE: 'bg-orange-100 text-orange-600'
  };
  const labels = {
    REQUESTED: 'Angefragt',
    DISCUSSION_REQUESTED: 'Gespräch erbeten',
    ACTIVE: 'Aktiv',
    RETURNED: 'Zurückgegeben',
    OVERDUE: 'Überfällig'
  };
  return <span className={`badge ${classes[status] || classes.ACTIVE}`}>{labels[status] || status}</span>;
}

function LoanCard({ loan, to }) {
  return (
    <Link className="block p-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition" to={to}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-gray-800">{loan.device?.model || loan.device?.inventoryId || loan.requestedModel || 'Anfrage ohne Gerät'}</div>
          <div className="mt-0.5 text-xs text-gray-500">{loan.device?.inventoryId}</div>
          {loan.area?.name && <div className="mt-0.5 text-xs text-gray-500">Bereich: {loan.area.name}</div>}
        </div>
        <Status status={loan.status} />
      </div>

      <div className="grid gap-2 text-sm text-gray-500">
        <div>
          <span className="text-gray-400">Ausleiher: </span>
          <span className="font-medium text-gray-800">{loan.user?.displayName || loan.borrowerName || loan.user?.username || '-'}</span>
        </div>
        <div>
          <span className="text-gray-400">Zeitraum: </span>
          <span>{loan.startDate?.slice(0, 10)} bis {loan.dueDate?.slice(0, 10)}</span>
        </div>
        {loan.requestReason && <div className="rounded-md bg-gray-50 dark:bg-zinc-800/40 border border-black/5 dark:border-zinc-700 p-3 text-gray-700 dark:text-zinc-300">{loan.requestReason}</div>}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="btn-secondary min-h-11 sm:min-h-10 flex-1 justify-center"><ChevronRight size={16} />Details öffnen</span>
      </div>
    </Link>
  );
}

function Metric({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-gray-800 dark:text-gray-200',
    green: 'text-green-600 dark:text-green-400',
    orange: 'text-orange-500 dark:text-orange-400',
    red: 'text-red-500 dark:text-red-400'
  };
  return (
    <div className="card p-3">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}