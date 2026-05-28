import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, MessageCircle, AlertCircle, Save, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../hooks/useAuth';

const priorities = {
  LOW: ['Niedrig', 'bg-gray-100 text-gray-600'],
  NORMAL: ['Normal', 'bg-gray-100 text-gray-700'],
  HIGH: ['Hoch', 'bg-orange-100 text-orange-700'],
  CRITICAL: ['Kritisch', 'bg-red-100 text-red-700']
};

const statuses = {
  OPEN: ['Offen', 'border-red-500 text-red-700 bg-red-50'],
  IN_PROGRESS: ['In Arbeit', 'border-orange-500 text-orange-700 bg-orange-50'],
  DONE: ['Erledigt', 'border-green-500 text-green-700 bg-green-50'],
  REJECTED: ['Abgelehnt', 'border-gray-400 text-gray-600 bg-gray-50']
};

export default function Issues() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  
  useEffect(() => {
    load();
  }, []);

  async function load() {
    const issueResult = await api.get('/issues');
    setIssues(issueResult.data.issues || []);
  }





  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Meine Tickets</h1>
          <p className="mt-1 text-sm text-gray-500">Übersicht deiner gemeldeten Fehler und Support-Anfragen.</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/issues/new')}>
          <Plus size={17} /> Neues Ticket erstellen
        </button>
      </div>

      {issues.length === 0 ? (
        <div className="card p-10 text-center flex flex-col items-center">
          <div className="h-16 w-16 bg-gray-800 text-gray-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-800">Alles in Ordnung!</h2>
          <p className="text-gray-500 mt-2">Du hast aktuell keine Fehler gemeldet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {['OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED'].map(statusId => {
            const statusIssues = issues.filter(i => i.status === statusId);
            if (statusIssues.length === 0) return null;
            return (
              <div key={statusId} className="card overflow-hidden">
                <div className={`p-4 border-l-4 ${statuses[statusId][1]} bg-white flex justify-between items-center`}>
                  <h3 className="font-bold">{statuses[statusId][0]}</h3>
                  <span className="badge bg-white text-gray-700 shadow-sm">{statusIssues.length} Ticket(s)</span>
                </div>
                <div className="divide-y divide-black/5">
                  {statusIssues.map(issue => (
                    <div 
                      key={issue.id} 
                      onClick={() => navigate(`/issues/${issue.id}`)}
                      className="p-4 hover:bg-[#fafafa] cursor-pointer transition flex flex-col md:flex-row gap-4 justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-gray-800 truncate">{issue.title}</h4>
                          <span className={`badge shrink-0 ${priorities[issue.priority]?.[1]}`}>{priorities[issue.priority]?.[0]}</span>
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-1">{issue.description}</p>
                      </div>
                      <div className="flex flex-col items-end shrink-0 text-xs text-gray-400 gap-1">
                        <span className="font-medium text-gray-600">{issue.device?.inventoryId}</span>
                        <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
                        {issue.comments?.length > 0 && (
                          <span className="flex items-center gap-1 text-gray-300 mt-1">
                            <MessageCircle size={14} /> {issue.comments.length} Nachricht(en)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
