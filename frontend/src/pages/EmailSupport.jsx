import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Inbox,
  Mail,
  MailX,
  RefreshCw,
  Reply,
  Search,
  Trash2,
  User,
  CheckCircle2
} from 'lucide-react';
import { api } from '../api/client';
import { PageLoader } from '../components/Loading';
import { useConfirm } from '../components/ConfirmDialog';

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_BADGE = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  CONVERTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  IGNORED: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400'
};

const STATUS_LABEL = {
  PENDING: 'Ausstehend',
  CONVERTED: 'Umgewandelt',
  IGNORED: 'Ignoriert'
};

export default function EmailSupport() {
  const confirm = useConfirm();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.get('/inbound-mail/count').then(({ data }) => setPendingCount(data.count || 0)).catch(() => {});
  }, []);

  return (
    <div className="page-enter space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-zinc-100 flex items-center gap-2">
            <Mail className="text-blue-500" size={24} />
            E-Mail-Support
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Eingehende Support-E-Mails in Tickets umwandeln und Tickets per E-Mail beantworten.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/email-support/new" className="btn-primary w-fit flex items-center gap-2">
            <Reply size={16} />
            Ticket beantworten
          </Link>
        </div>
      </div>

      <InboxTab onCountChange={setPendingCount} pendingCount={pendingCount} />
    </div>
  );
}

function InboxTab({ onCountChange, pendingCount }) {
  const navigate = useNavigate();
  const [mails, setMails] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/inbound-mail?status=${statusFilter}&limit=100`);
      setMails(data.mails || []);
      setTotal(data.total || 0);
      onCountChange((data.mails || []).filter((m) => m.status === 'PENDING').length);
    } catch {
      setMails([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function fetchInbox() {
    setFetching(true);
    setMessage('');
    try {
      const { data } = await api.post('/inbound-mail/fetch');
      setMessage(data.message || 'Postfach wurde erfolgreich synchronisiert.');
      await load();
      setTimeout(() => setMessage(''), 4000);
    } catch {
      setMessage('Fehler beim Abrufen des Postfachs.');
      setTimeout(() => setMessage(''), 4000);
    } finally {
      setFetching(false);
    }
  }

  const filtered = useMemo(() =>
    mails.filter((m) => {
      const hay = [m.fromAddr, m.fromName, m.subject, m.body].join(' ').toLowerCase();
      return hay.includes(query.toLowerCase());
    }), [mails, query]);

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-3 text-sm font-medium text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40 flex items-center gap-2">
          <CheckCircle2 size={16} />
          {message}
        </div>
      )}

      {/* Filter & Action Bar */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="field pl-9 w-full text-sm"
              placeholder="E-Mails durchsuchen..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="field text-sm w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="PENDING">Ausstehend ({pendingCount})</option>
            <option value="CONVERTED">Umgewandelt</option>
            <option value="IGNORED">Ignoriert</option>
            <option value="">Alle Status</option>
          </select>
        </div>
        <button
          className="btn-secondary flex items-center gap-2 text-sm shrink-0"
          onClick={fetchInbox}
          disabled={fetching}
        >
          <RefreshCw size={15} className={fetching ? 'animate-spin' : ''} />
          {fetching ? 'Wird abgerufen...' : 'Postfach abrufen'}
        </button>
      </div>

      {/* Mail List */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-black/5 dark:border-white/5 bg-[#fafafa] dark:bg-zinc-900/50 flex items-center justify-between">
          <div className="font-semibold text-sm text-gray-800 dark:text-zinc-200">
            {STATUS_LABEL[statusFilter] || 'Alle'} E-Mails
          </div>
          <span className="badge bg-white dark:bg-zinc-800 shadow-sm border border-black/5 dark:border-white/5 text-gray-600 dark:text-zinc-300">
            {total} Mail(s)
          </span>
        </div>

        {loading ? (
          <PageLoader className="min-h-64 py-12" text="Lade E-Mails…" />
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Inbox size={40} className="mx-auto mb-3 opacity-30" />
            <div className="font-medium text-gray-700 dark:text-zinc-300">Keine E-Mails gefunden.</div>
            <div className="text-sm mt-1 text-gray-400">
              {statusFilter === 'PENDING' ? 'Klicke auf „Postfach abrufen", um neue E-Mails zu laden.' : 'Keine Einträge in diesem Filter.'}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {filtered.map((mail) => (
              <MailRow
                key={mail.id}
                mail={mail}
                onSelect={() => navigate(`/email-support/convert?id=${mail.id}`)}
                onIgnore={async () => { await api.post(`/inbound-mail/${mail.id}/ignore`); load(); }}
                onDelete={async () => {
                  const ok = await confirm({
                    title: 'E-Mail löschen',
                    message: 'Möchtest du diese E-Mail wirklich löschen?',
                    tone: 'danger',
                    confirmLabel: 'Löschen',
                    cancelLabel: 'Abbrechen'
                  });
                  if (ok) {
                    await api.delete(`/inbound-mail/${mail.id}`);
                    load();
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MailRow({ mail, onSelect, onIgnore, onDelete }) {
  return (
    <div className="p-4 hover:bg-[#fafafa] dark:hover:bg-zinc-900/60 transition flex flex-col sm:flex-row gap-3 justify-between group">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/30">
          <User size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-gray-900 dark:text-zinc-100">
              {mail.fromName || mail.fromAddr}
            </span>
            {mail.fromName && (
              <span className="text-xs text-gray-400">&lt;{mail.fromAddr}&gt;</span>
            )}
            <span className={`badge text-[11px] px-2 py-0.5 font-medium ${STATUS_BADGE[mail.status]}`}>
              {STATUS_LABEL[mail.status]}
            </span>
          </div>
          <div className="text-sm font-medium text-gray-800 dark:text-zinc-200 truncate">
            {mail.subject || '(Kein Betreff)'}
          </div>
          <div className="text-xs text-gray-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
            {mail.body?.slice(0, 200) || '(Kein Textinhalt)'}
          </div>
        </div>
      </div>

      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-black/5 dark:border-white/5">
        <span className="text-xs text-gray-400">{fmtDate(mail.receivedAt)}</span>
        <div className="flex items-center gap-1.5">
          {mail.status === 'PENDING' && (
            <>
              <button
                onClick={onSelect}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                <ArrowRight size={13} />
                Als Ticket
              </button>
              <button
                onClick={onIgnore}
                title="Ignorieren"
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-600 dark:hover:text-zinc-300 transition"
              >
                <MailX size={16} />
              </button>
            </>
          )}
          <button
            onClick={onDelete}
            title="Löschen"
            className="rounded-lg p-2 text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 transition"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
