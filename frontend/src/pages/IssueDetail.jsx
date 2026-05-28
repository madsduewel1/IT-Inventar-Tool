import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MessageCircle, Save, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
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

export default function IssueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [issue, setIssue] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Forms
  const [commentText, setCommentText] = useState('');
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    try {
      const { data } = await api.get(`/issues/${id}`);
      setIssue(data.issue);
      setCanManage(data.canManage);
      if (data.canManage) {
        api.get('/issues/assignees').then(res => setAssignees(res.data.assignees || [])).catch(() => {});
      }
      setEditForm({
        status: data.issue.status,
        priority: data.issue.priority,
        resolution: data.issue.resolution || '',
        assigneeId: data.issue.assigneeId || ''
      });
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Laden des Tickets.');
      setLoading(false);
    }
  }

  async function submitComment(event) {
    if (event) event.preventDefault();
    if (!commentText.trim() || !issue) return;
    try {
      const { data } = await api.post(`/issues/${issue.id}/comments`, { text: commentText });
      setIssue(prev => ({ ...prev, comments: [...(prev.comments || []), data.comment] }));
      setCommentText('');
    } catch (error) {
      console.error(error);
    }
  }

  async function updateIssue(event) {
    if (event) event.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/issues/${issue.id}`, editForm);
      await load();
      setSaving(false);
    } catch (error) {
      console.error(error);
      setSaving(false);
    }
  }

  async function deleteIssue() {
    if (!window.confirm(canManage ? 'Bist du sicher, dass du dieses Ticket vollständig löschen möchtest?' : 'Möchtest du dieses Ticket wirklich zurücknehmen?')) return;
    try {
      await api.delete(`/issues/${issue.id}`);
      navigate(canManage ? '/issues/manage' : '/issues', { replace: true });
    } catch (error) {
      console.error(error);
      alert('Fehler beim Löschen des Tickets.');
    }
  }

  async function assignToMe() {
    setSaving(true);
    try {
      await api.patch(`/issues/${issue.id}`, { assigneeId: user.id });
      await load();
      setSaving(false);
    } catch (error) {
      console.error(error);
      setSaving(false);
    }
  }

  async function updateIssue(event) {
    if (event) event.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/issues/${issue.id}`, editForm);
      await load();
      setSaving(false);
    } catch (error) {
      console.error(error);
      setSaving(false);
    }
  }

  if (loading) return <div className="p-10 text-center text-gray-500">Lade Ticket...</div>;
  if (error) return (
    <div className="card p-10 text-center flex flex-col items-center">
      <AlertCircle size={32} className="text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-800">Fehler</h2>
      <p className="text-gray-500 mt-2">{error}</p>
      <button className="btn-secondary mt-6" onClick={() => navigate(-1)}>Zurück</button>
    </div>
  );

  return (
    <div className="page-enter max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <button className="btn-secondary hidden shrink-0 md:inline-flex" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`badge ${priorities[issue.priority]?.[1]}`}>{priorities[issue.priority]?.[0]}</span>
              <span className={`badge border ${statuses[issue.status]?.[1]}`}>{statuses[issue.status]?.[0]}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{issue.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Ticket ID: {issue.id.slice(-8).toUpperCase()} · Gemeldet von {issue.reporter?.username || 'Unbekannt'} am {new Date(issue.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Left Column: Details & Chat */}
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-5 md:p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Fehlerbeschreibung</h2>
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{issue.description}</p>
            
            {issue.resolution && (
              <div className="mt-6 rounded-2xl bg-green-50/50 p-5 border border-green-100 flex gap-3">
                <CheckCircle2 size={24} className="text-green-600 shrink-0" />
                <div>
                  <h3 className="font-bold text-green-900">Lösung der IT</h3>
                  <div className="mt-1 text-sm text-green-800">{issue.resolution}</div>
                </div>
              </div>
            )}
          </section>

          <section className="card p-0 shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div className="bg-[#fafafa] p-4 border-b border-black/5 flex items-center gap-2 font-semibold text-gray-800 shrink-0">
              <MessageCircle size={18} className="text-gray-300" /> Ticket-Verlauf & Chat
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
              {issue.comments?.map(comment => {
                const isMe = comment.userId === user.id;
                const isIT = comment.user?.role === 'STAFF' || comment.user?.role === 'ADMIN';
                return (
                  <div key={comment.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline gap-2 mb-1 px-1">
                      <span className="text-xs font-semibold text-gray-700">{isMe ? 'Du' : comment.user?.username}</span>
                      {isIT && !isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-100 font-bold">IT</span>}
                      <span className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleString()}</span>
                    </div>
                    <div className={`p-3.5 rounded-2xl max-w-[85%] text-sm ${isMe ? 'bg-gray-700 text-white rounded-tr-sm shadow-sm' : 'bg-[#f4f4f5] text-gray-800 rounded-tl-sm border border-black/5'}`}>
                      {comment.text}
                    </div>
                  </div>
                );
              })}
              {!issue.comments?.length && (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                  Noch keine Nachrichten vorhanden.
                </div>
              )}
            </div>

            <form onSubmit={submitComment} className="p-4 bg-white border-t border-black/5 shrink-0 flex gap-3">
              <input 
                className="field flex-1 bg-[#f4f4f5] border-transparent focus:bg-white" 
                placeholder="Nachricht schreiben..." 
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
              />
              <button type="submit" className="btn-primary shrink-0" disabled={!commentText.trim()}>Senden</button>
            </form>
          </section>
        </div>

        {/* Right Column: Metadata & Controls */}
        <div className="space-y-6">
          <section className="card p-5 shadow-sm">
            <h2 className="font-bold text-gray-800 mb-4">Geräte-Infos</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-black/5 pb-2">
                <span className="text-gray-500">Inventar-Nr.</span>
                <Link to={`/devices/${issue.deviceId}`} className="font-semibold text-gray-200 hover:underline">{issue.device?.inventoryId}</Link>
              </div>
              {issue.device?.model && (
                <div className="flex justify-between border-b border-black/5 pb-2">
                  <span className="text-gray-500">Modell</span>
                  <span className="font-medium text-gray-800">{issue.device.model}</span>
                </div>
              )}
              {issue.device?.room && (
                <div className="flex justify-between border-b border-black/5 pb-2">
                  <span className="text-gray-500">Raum</span>
                  <span className="font-medium text-gray-800">{issue.device.room.name}</span>
                </div>
              )}
              <div className="flex justify-between pb-1">
                <span className="text-gray-500">Zuständiger ITler</span>
                <span className="font-medium text-gray-800">{issue.assignee?.username || 'Nicht zugewiesen'}</span>
              </div>
            </div>
          </section>

          {canManage ? (
            <section className="card p-5 shadow-sm bg-gray-900/30 border border-gray-700">
              <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Save size={18} className="text-gray-300" /> IT-Bearbeitung
              </h2>
              <form onSubmit={updateIssue} className="space-y-4">
                <label className="text-sm font-medium text-gray-700 block">Status
                  <select className="field mt-1 bg-white" value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                    <option value="OPEN">Offen</option>
                    <option value="IN_PROGRESS">In Arbeit</option>
                    <option value="DONE">Erledigt</option>
                    <option value="REJECTED">Abgelehnt</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700 block">Priorität
                  <select className="field mt-1 bg-white" value={editForm.priority} onChange={(event) => setEditForm({ ...editForm, priority: event.target.value })}>
                    <option value="LOW">Niedrig</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">Hoch</option>
                    <option value="CRITICAL">Kritisch</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700 block">Ticket übernehmen / zuweisen
                  <select className="field mt-1 bg-white" value={editForm.assigneeId || ''} onChange={(event) => setEditForm({ ...editForm, assigneeId: event.target.value })}>
                    <option value="">Niemand (Unzugewiesen)</option>
                    {assignees.map(a => <option key={a.id} value={a.id}>{a.username} ({a.role})</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700 block">Offizielle Lösungsnotiz
                  <textarea className="field mt-1 min-h-24 bg-white" placeholder="Wird für den Nutzer grün hervorgehoben..." value={editForm.resolution} onChange={(event) => setEditForm({ ...editForm, resolution: event.target.value })} />
                </label>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary flex-1 border-gray-600 text-gray-100 hover:bg-gray-800" onClick={assignToMe} disabled={saving}>
                    Mir zuweisen
                  </button>
                  <button className="btn-primary flex-1" type="submit" disabled={saving}>
                    {saving ? 'Speichert...' : 'Änderungen speichern'}
                  </button>
                </div>
              </form>
              <button type="button" onClick={deleteIssue} className="btn-secondary text-red-600 w-full mt-4 border-red-200 hover:bg-red-50">
                Ticket vollständig löschen
              </button>
            </section>
          ) : (
            <>
              <div className="p-4 rounded-xl bg-[#fafafa] border border-black/5 text-xs text-gray-500 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 text-gray-300" />
                Du kannst Status und Priorität nicht bearbeiten. Bitte nutze den Chat für Rückfragen an die IT.
              </div>
              {issue.reporterId === user.id && (
                <button onClick={deleteIssue} className="btn-secondary text-red-600 w-full mt-4 border-red-200 hover:bg-red-50">
                  Ticket zurücknehmen
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
