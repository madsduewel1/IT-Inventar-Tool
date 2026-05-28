import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Filter, MessageSquare, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

export default function Loans({ mine = false }) {
  const { user } = useAuth();
  const role = user?.effectiveRole || user?.role;
  const canEdit = ['STAFF', 'ADMIN'].includes(role) && !mine;
  const personalView = mine || !canEdit;
  const [loans, setLoans] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const loansReq = personalView ? api.get('/loans/my') : api.get('/loans');
    const { data } = await loansReq;
    setLoans(data.loans || []);
  }

  useEffect(() => { load(); }, [personalView]);

  const filtered = useMemo(() => loans.filter((loan) => {
    const haystack = [
      loan.device?.inventoryId,
      loan.device?.model,
      loan.borrowerName,
      loan.borrowerContact,
      loan.borrowerGroup,
      loan.user?.username,
      loan.notes,
      loan.requestReason,
      loan.decisionMessage
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase()) && (!status || loan.status === status);
  }), [loans, query, status]);

  async function returnLoan(id) {
    setError('');
    try {
      await api.patch(`/loans/${id}/return`);
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Rueckgabe konnte nicht gespeichert werden.');
    }
  }

  async function approveLoan(id) {
    setError('');
    try {
      await api.patch(`/loans/${id}/approve`, { message: 'Ausleihe wurde akzeptiert.' });
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Anfrage konnte nicht akzeptiert werden.');
    }
  }

  async function requestDiscussion(id) {
    const message = window.prompt('Nachricht an den Benutzer, z. B. "Bitte um Gespraech heute um 10:30 Uhr im IT-Buero".');
    if (!message?.trim()) return;
    setError('');
    try {
      await api.patch(`/loans/${id}/discussion`, { message });
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Gesprächsbitte konnte nicht gespeichert werden.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{personalView ? 'Meine Ausleihen' : 'Ausleihe'}</h1>
          <p className="mt-1 text-sm text-gray-500">{personalView ? 'Eigene Ausleihen und Anfragen im Blick behalten' : 'Ausleihen, Rueckgaben und offene Anfragen verwalten'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {personalView && <Link className="btn-primary" to="/loans/request"><Plus size={17} />Ausleihe anfragen</Link>}
          {canEdit && <Link className="btn-primary" to="/loans/new"><Plus size={17} />Neu hinzufügen</Link>}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric label="Vorgänge" value={loans.length} />
        <Metric label="Anfragen" value={loans.filter((loan) => loan.status === 'REQUESTED').length} />
        <Metric label="Aktiv" value={loans.filter((loan) => loan.status === 'ACTIVE').length} tone="orange" />
        <Metric label="Gespräch" value={loans.filter((loan) => loan.status === 'DISCUSSION_REQUESTED').length} />
        <Metric label="Zurück" value={loans.filter((loan) => loan.status === 'RETURNED').length} tone="green" />
      </section>

      <section className="card overflow-hidden">
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{error}</div>}
        <div className="grid gap-3 border-b border-black/5 p-4 lg:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input className="field pl-9" placeholder="Asset, Ausleiher, Grund oder Nachricht suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Alle Status</option>
            <option value="REQUESTED">Angefragt</option>
            <option value="DISCUSSION_REQUESTED">Gespräch erbeten</option>
            <option value="ACTIVE">Aktiv</option>
            <option value="OVERDUE">Überfällig</option>
            <option value="RETURNED">Zurückgegeben</option>
          </select>
          <button className="btn-secondary"><Filter size={17} />Filter active</button>
        </div>

        <div className="divide-y divide-black/5 md:hidden">
          {filtered.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              user={user}
              canEdit={canEdit}
              onReturn={returnLoan}
              onApprove={approveLoan}
              onDiscussion={requestDiscussion}
            />
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
                    <div className="font-semibold text-gray-800">{loan.device?.model || loan.device?.inventoryId}</div>
                    <div className="text-xs text-gray-500">{loan.device?.inventoryId}</div>
                  </td>
                  <td className="p-4 text-gray-600">
                    <div className="font-medium text-gray-800">{loan.borrowerName || loan.user?.username || '-'}</div>
                    {(loan.borrowerContact || loan.borrowerGroup) && <div className="text-xs text-gray-500">{[loan.borrowerContact, loan.borrowerGroup].filter(Boolean).join(' - ')}</div>}
                  </td>
                  <td className="p-4 text-gray-600">
                    <div>{loan.startDate?.slice(0, 10)}</div>
                    <div className="text-xs text-gray-500">bis {loan.dueDate?.slice(0, 10)}</div>
                  </td>
                  <td className="max-w-xs p-4 text-gray-600">
                    {loan.requestReason && <div className="line-clamp-2">{loan.requestReason}</div>}
                    {loan.decisionMessage && <div className="mt-2 rounded-md bg-[#24262d] p-2 text-xs text-gray-400">{loan.decisionMessage}</div>}
                  </td>
                  <td className="p-4"><Status status={loan.status} /></td>
                  <td className="p-4">
                    <div className="flex flex-col gap-2">
                      {canEdit && loan.status !== 'RETURNED' && ['ACTIVE', 'OVERDUE'].includes(loan.status) && (
                        <button className="font-medium text-gray-200" onClick={() => returnLoan(loan.id)}><CheckCircle2 className="mr-1 inline" size={16} />Zurücknehmen</button>
                      )}
                      {canEdit && ['REQUESTED', 'DISCUSSION_REQUESTED'].includes(loan.status) && (
                        <>
                          <button className="font-medium text-green-500" onClick={() => approveLoan(loan.id)}><CheckCircle2 className="mr-1 inline" size={16} />Akzeptieren</button>
                          <button className="font-medium text-gray-200" onClick={() => requestDiscussion(loan.id)}><MessageSquare className="mr-1 inline" size={16} />Bitte um Gespräch</button>
                        </>
                      )}
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

function LoanCard({ loan, user, canEdit, onReturn, onApprove, onDiscussion }) {
  return (
    <article className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-gray-800">{loan.device?.model || loan.device?.inventoryId}</div>
          <div className="mt-0.5 text-xs text-gray-500">{loan.device?.inventoryId}</div>
        </div>
        <Status status={loan.status} />
      </div>

      <div className="grid gap-2 text-sm text-gray-500">
        <div>
          <span className="text-gray-400">Ausleiher: </span>
          <span className="font-medium text-gray-800">{loan.borrowerName || loan.user?.username || '-'}</span>
        </div>
        <div>
          <span className="text-gray-400">Zeitraum: </span>
          <span>{loan.startDate?.slice(0, 10)} bis {loan.dueDate?.slice(0, 10)}</span>
        </div>
        {loan.requestReason && <div className="rounded-md bg-[#101318] p-3 text-gray-300">{loan.requestReason}</div>}
        {loan.decisionMessage && <div className="rounded-md bg-[#24262d] p-3 text-gray-300">{loan.decisionMessage}</div>}
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          {loan.status !== 'RETURNED' && ['ACTIVE', 'OVERDUE'].includes(loan.status) && (
            <button className="btn-secondary min-h-10" onClick={() => onReturn(loan.id)}><CheckCircle2 size={16} />Zurücknehmen</button>
          )}
          {['REQUESTED', 'DISCUSSION_REQUESTED'].includes(loan.status) && (
            <>
              <button className="btn-secondary min-h-10 text-green-500" onClick={() => onApprove(loan.id)}><CheckCircle2 size={16} />Akzeptieren</button>
              <button className="btn-secondary min-h-10" onClick={() => onDiscussion(loan.id)}><MessageSquare size={16} />Gespräch</button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function Metric({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-gray-200',
    green: 'text-green-600',
    orange: 'text-orange-500',
    red: 'text-red-500'
  };
  return <div className="card p-3"><div className="text-xs font-medium text-gray-500">{label}</div><div className={`mt-1 text-xl font-bold ${tones[tone]}`}>{value}</div></div>;
}
