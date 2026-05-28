import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Search, Save, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import Modal from '../components/Modal';

const priorities = {
  LOW: ['Niedrig', 'bg-gray-100 text-gray-600'],
  NORMAL: ['Normal', 'bg-gray-100 text-gray-700'],
  HIGH: ['Hoch', 'bg-orange-100 text-orange-700'],
  CRITICAL: ['Kritisch', 'bg-red-100 text-red-700']
};

const columns = [
  { id: 'OPEN', label: 'Offen', color: 'border-red-500' },
  { id: 'IN_PROGRESS', label: 'In Arbeit', color: 'border-orange-500' },
  { id: 'DONE', label: 'Erledigt', color: 'border-green-500' },
  { id: 'REJECTED', label: 'Abgelehnt', color: 'border-gray-400' }
];

export default function ManageIssues() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  
  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await api.get('/issues?all=true');
    setIssues(data.issues || []);
  }



  const filteredIssues = useMemo(() => issues.filter((issue) => {
    // Wenn Archiv NICHT angezeigt werden soll, filtern wir erledigte/abgelehnte Tickets raus (außer man filtert explizit danach)
    if (!showArchive && !statusFilter && (issue.status === 'DONE' || issue.status === 'REJECTED')) {
      return false;
    }

    const haystack = [issue.title, issue.description, issue.device?.inventoryId, issue.device?.model, issue.reporter?.username, issue.status].join(' ').toLowerCase();
    const matchesQuery = haystack.includes(query.toLowerCase());
    const matchesStatus = statusFilter ? issue.status === statusFilter : true;
    const matchesPriority = priorityFilter ? issue.priority === priorityFilter : true;
    
    return matchesQuery && matchesStatus && matchesPriority;
  }), [issues, query, statusFilter, priorityFilter, showArchive]);

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Fehler bearbeiten</h1>
          <p className="mt-1 text-sm text-gray-500">Ticket-Board für die IT-Verwaltung.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="field w-full sm:w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Alle Status</option>
            <option value="OPEN">Offen</option>
            <option value="IN_PROGRESS">In Arbeit</option>
            <option value="DONE">Erledigt</option>
            <option value="REJECTED">Abgelehnt</option>
          </select>
          <select className="field w-full sm:w-auto" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">Alle Prioritäten</option>
            <option value="LOW">Niedrig</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">Hoch</option>
            <option value="CRITICAL">Kritisch</option>
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input className="field pl-9 w-full sm:w-64" placeholder="Suchen..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer pl-2">
            <input type="checkbox" className="rounded border-gray-300 text-gray-600 focus:ring-gray-500" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} />
            Archiv einblenden
          </label>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-black/5 bg-[#fafafa] flex items-center justify-between">
          <div className="font-semibold text-gray-800">Alle Tickets</div>
          <span className="badge bg-white shadow-sm border border-black/5 text-gray-600">{filteredIssues.length} Ticket(s)</span>
        </div>
        <div className="divide-y divide-black/5">
          {filteredIssues.map(issue => {
            const statusLabel = columns.find(c => c.id === issue.status)?.label || 'Unbekannt';
            const statusColor = columns.find(c => c.id === issue.status)?.color || '';
            
            return (
              <div 
                key={issue.id} 
                onClick={() => navigate(`/issues/${issue.id}`)}
                className="p-4 hover:bg-gray-800/50 cursor-pointer transition flex flex-col md:flex-row gap-4 justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900">{issue.title}</h4>
                    <span className={`badge shrink-0 ${priorities[issue.priority]?.[1]}`}>{priorities[issue.priority]?.[0]}</span>
                    <span className={`badge bg-white border ${statusColor} shrink-0`}>{statusLabel}</span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-1">{issue.description}</p>
                </div>
                <div className="flex flex-col items-end shrink-0 text-xs text-gray-400 gap-1">
                  <span className="font-medium text-gray-700">{issue.device?.inventoryId}</span>
                  <span>Gemeldet von {issue.reporter?.username || 'Unbekannt'} am {new Date(issue.createdAt).toLocaleDateString()}</span>
                  {issue.comments?.length > 0 && (
                    <span className="flex items-center gap-1 text-gray-300 font-medium mt-1">
                      <MessageCircle size={14} /> {issue.comments.length} Nachricht(en)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredIssues.length === 0 && (
            <div className="p-10 text-center text-gray-500">Keine Tickets gefunden.</div>
          )}
        </div>
      </div>
    </div>
  );
}
