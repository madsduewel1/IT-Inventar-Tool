import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail, Reply, Search, Send } from 'lucide-react';
import { api } from '../api/client';
import { issueDevices, issueDevicesLabel } from '../components/issueMeta';

export default function EmailReply() {
  const [query, setQuery] = useState('');
  const [issues, setIssues] = useState([]);
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [saveAsComment, setSaveAsComment] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/issues/all').then(({ data }) => setIssues(data.issues || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) {
      setReplyText('');
      return;
    }

    const reporter = (selected.reporter?.displayName || selected.reporter?.username || (selected.reporterEmail ? `Externer Benutzer (${selected.reporterEmail})` : 'Nutzer'));
    const device = selected.device?.inventoryId || selected.device?.model || 'das betroffene Gerät';
    setReplyText(`Hallo ${reporter},\n\nhiermit antworten wir auf Ihre Anfrage bezüglich ${device}.\n\n`);
    setSent(false);
    setError('');
  }, [selected]);

  const filtered = useMemo(() =>
    issues.filter((issue) => {
      const haystack = [
        issue.title,
        issue.description,
        ...issueDevices(issue).flatMap((device) => [device.inventoryId, device.model]),
        issue.reporter?.displayName,
        issue.reporter?.username,
        issue.reporterEmail,
        issue.id
      ].join(' ').toLowerCase();
      return haystack.includes(query.toLowerCase());
    }).slice(0, 20), [issues, query]);

  async function handleSend() {
    if (!selected) return;
    if (!replyText.trim()) {
      setError('Antworttext darf nicht leer sein.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await api.post(`/issues/${selected.id}/reply`, { text: replyText.trim(), saveAsComment });
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Senden.');
    } finally {
      setSending(false);
    }
  }

  const issueStatus = {
    OPEN: { label: 'Offen', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    IN_PROGRESS: { label: 'In Bearbeitung', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    WAITING: { label: 'Warten auf Rückmeldung', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    CLOSED: { label: 'Geschlossen', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    DONE: { label: 'Geschlossen', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    REJECTED: { label: 'Geschlossen', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
  };

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-2">
        <Link to="/email-support" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main">
          <ArrowLeft size={16} /> Zurück zum E-Mail-Support
        </Link>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800 dark:text-zinc-100">
              <Reply className="text-blue-500" size={24} />
              Ticket per E-Mail beantworten
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
              Wähle ein Ticket aus und sende eine direkte Antwort an den Reporter.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="card flex max-h-[70vh] flex-col overflow-hidden">
          <div className="border-b border-black/5 p-3 dark:border-white/5 bg-[#fafafa] dark:bg-zinc-900/50">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="field w-full pl-9 text-sm"
                placeholder="Ticket suchen..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
            {filtered.map((issue) => {
              const status = issueStatus[issue.status] || issueStatus.OPEN;
              const isSel = selected?.id === issue.id;
              return (
                <button
                  key={issue.id}
                  onClick={() => setSelected(issue)}
                  className={`w-full p-3 text-left transition hover:bg-[#fafafa] dark:hover:bg-zinc-900/60 ${isSel ? 'border-l-2 border-blue-500 bg-blue-50/60 dark:bg-blue-950/30' : ''}`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`badge px-1.5 py-0.5 text-[10px] ${status.cls}`}>{status.label}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{issueDevicesLabel(issueDevices(issue))}</span>
                  </div>
                  <div className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">{issue.title}</div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {issue.reporter?.displayName || issue.reporter?.username || (issue.reporterEmail ? `Externer Benutzer (${issue.reporterEmail})` : 'Unbekannt')} · {new Date(issue.createdAt).toLocaleDateString('de-DE')}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-400">Keine Tickets gefunden.</div>
            )}
          </div>
        </div>

        <div className="card flex min-h-[70vh] flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-gray-400">
              <Reply size={48} className="mb-4 opacity-20" />
              <div className="font-medium text-gray-700 dark:text-zinc-300">Ticket auswählen</div>
              <div className="mt-1 text-sm text-gray-400">Wähle links ein Ticket aus, um eine Antwort zu verfassen.</div>
            </div>
          ) : (
            <>
              <div className="border-b border-black/5 bg-[#fafafa] dark:bg-zinc-900/50 p-4 dark:border-white/5">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/30 shrink-0">
                    <Mail size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="grid gap-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-16 shrink-0 text-right text-gray-400">An:</span>
                        <span className="font-medium text-gray-800 dark:text-zinc-200">
                          {selected.reporter?.email || selected.reporterEmail || <span className="italic text-red-500">Keine E-Mail-Adresse hinterlegt</span>}
                        </span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="w-16 shrink-0 text-right text-gray-400">Betreff:</span>
                        <span className="break-words font-medium text-gray-800 dark:text-zinc-200">
                          Re: [TICKET-{selected.id.slice(0, 8)}] {selected.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-16 shrink-0 text-right text-gray-400">Gerät:</span>
                        <span className="text-gray-500 dark:text-zinc-400">
                          {selected.device?.inventoryId || selected.device?.model || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-4 p-5">
                {error && (
                  <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>
                )}
                {sent && (
                  <div className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800/30">
                    <CheckCircle2 size={16} /> E-Mail wurde erfolgreich in die Versand-Queue gelegt.
                  </div>
                )}

                <textarea
                  className="field min-h-64 flex-1 font-sans text-sm leading-relaxed"
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder="Antworttext eingeben..."
                />

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-black/5 dark:border-white/5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={saveAsComment}
                      onChange={(event) => setSaveAsComment(event.target.checked)}
                    />
                    Als Kommentar im Ticket erfassen
                  </label>

                  <button
                    className="btn-primary flex items-center gap-2 text-sm"
                    onClick={handleSend}
                    disabled={sending || !(selected.reporter?.email || selected.reporterEmail)}
                  >
                    <Send size={15} />
                    {sending ? 'Wird gesendet...' : 'E-Mail absenden'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
