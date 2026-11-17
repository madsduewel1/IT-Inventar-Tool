import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, MessageCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { ISSUE_TYPES, ISSUE_STATUSES, issueTypeMeta, issueContext, issueDisplayTitle } from '../components/issueMeta';

const STATUS_TABS = [
  { value: '', label: 'Alle' },
  { value: 'OPEN', label: 'Offen' },
  { value: 'IN_PROGRESS', label: 'In Bearbeitung' },
  { value: 'WAITING', label: 'Warten auf Rückmeldung' },
  { value: 'CLOSED', label: 'Geschlossen' }
];

export default function Issues() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const permissions = user?.effectivePermissions || [];
  const canCreate = permissions.includes('ISSUE_CREATE') || permissions.includes('ADMIN');
  const [searchParams, setSearchParams] = useSearchParams();
  const [issues, setIssues] = useState([]);
  const initialTab = STATUS_TABS.some((t) => t.value === searchParams.get('status')) ? searchParams.get('status') : '';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [typeFilter, setTypeFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const issueResult = await api.get('/issues');
      setIssues(issueResult.data.issues || []);
    } catch {
      setIssues([]);
    }
  }

  function selectTab(value) {
    setActiveTab(value);
    setSearchParams(value ? { status: value } : {}, { replace: true });
  }

  const filteredIssues = useMemo(() => {
    const cutoff = timeFilter === 'all' ? null : Date.now() - Number(timeFilter) * 24 * 60 * 60 * 1000;
    const list = issues.filter((issue) => {
      if (activeTab && issue.status !== activeTab) return false;
      if (typeFilter && issue.type !== typeFilter) return false;
      if (cutoff && new Date(issue.createdAt).getTime() < cutoff) return false;
      return true;
    });
    return [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [issues, activeTab, typeFilter, timeFilter]);

  const counts = useMemo(() => {
    const c = { OPEN: 0, IN_PROGRESS: 0, WAITING: 0, CLOSED: 0 };
    issues.forEach((i) => { if (i.status in c) c[i.status]++; });
    return c;
  }, [issues]);

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-zinc-100">Meine Tickets</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">Übersicht deiner gemeldeten Probleme und Support-Anfragen.</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => navigate('/issues/new')}>
            <Plus size={17} /> Neues Ticket erstellen
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-black/10 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1 text-sm shadow-sm w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            onClick={() => selectTab(tab.value)}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${activeTab === tab.value ? 'bg-gray-800 text-white' : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200'}`}
          >
            {tab.label}
            {tab.value && counts[tab.value] > 0 && <span className="ml-1.5 text-xs opacity-70">({counts[tab.value]})</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="field w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Alle Ticketarten</option>
          {ISSUE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <select className="field w-auto" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
          <option value="all">Gesamter Zeitraum</option>
          <option value="7">Letzte 7 Tage</option>
          <option value="30">Letzte 30 Tage</option>
          <option value="90">Letzte 90 Tage</option>
        </select>
        {(typeFilter || timeFilter !== 'all') && (
          <button type="button" className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200" onClick={() => { setTypeFilter(''); setTimeFilter('all'); }}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      {filteredIssues.length === 0 ? (
        <div className="card p-10 text-center flex flex-col items-center dark:bg-zinc-900 dark:border-zinc-800">
          <div className="h-16 w-16 bg-gray-800 text-gray-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-zinc-100">{activeTab ? 'Keine Tickets in dieser Kategorie' : 'Alles in Ordnung!'}</h2>
          <p className="text-gray-500 dark:text-zinc-400 mt-2">
            {activeTab ? 'Tickets mit diesem Status werden hier erscheinen.' : 'Du hast aktuell keine Tickets gemeldet.'}
          </p>
          {!activeTab && canCreate && (
            <button className="btn-primary mt-6" onClick={() => navigate('/issues/new')}>
              <Plus size={17} /> Ticket erstellen
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
          <div className="divide-y divide-black/5 dark:divide-zinc-700">
            {filteredIssues.map((issue) => {
              const typeMeta = issueTypeMeta(issue.type);
              const statusMeta = ISSUE_STATUSES[issue.status] || ISSUE_STATUSES.OPEN;
              const context = issueContext(issue);
              return (
                <div
                  key={issue.id}
                  onClick={() => navigate(`/issues?id=${issue.id}`)}
                  className="group p-4 hover:bg-[#fafafa] dark:hover:bg-zinc-800/50 cursor-pointer transition flex flex-col md:flex-row gap-3 md:items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge shrink-0 ${typeMeta.badge}`}>{typeMeta.label}</span>
                      <h4 className="font-semibold text-gray-800 dark:text-zinc-200 truncate">{issueDisplayTitle(issue)}</h4>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 line-clamp-1 mt-1">
                      {context ? <span className="font-medium text-gray-600 dark:text-zinc-300">{context}</span> : null}
                      {context ? ' · ' : ''}
                      {issue.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex flex-col items-end text-xs text-gray-400 dark:text-zinc-500 gap-0.5">
                      <span className={`badge shrink-0 border ${statusMeta.badge}`}>{statusMeta.label}</span>
                      <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
                      {issue.comments?.length > 0 && (
                        <span className="flex items-center gap-1 text-gray-300 dark:text-zinc-600">
                          <MessageCircle size={13} /> {issue.comments.length}
                        </span>
                      )}
                    </div>
                    <ArrowRight size={16} className="text-gray-300 dark:text-zinc-600 group-hover:text-gray-500 dark:group-hover:text-zinc-400 transition" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}