import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Mail, MailQuestion, RefreshCw, RotateCcw, Send, Server, Inbox } from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage } from './Users';

const statusIcons = {
  SENT: [CheckCircle2, 'text-green-600'],
  FAILED: [AlertCircle, 'text-red-600'],
  PENDING: [Clock, 'text-amber-600'],
  PROCESSING: [RefreshCw, 'text-blue-600'],
  PROCESSED: [CheckCircle2, 'text-green-600']
};

export default function MailLog() {
  const [tab, setTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('');
  const [smtpStatus, setSmtpStatus] = useState(null);
  const [imapStatus, setImapStatus] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState('');
  const [verifyResult, setVerifyResult] = useState('');
  const [imapTestResult, setImapTestResult] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    try {
      const params = {};
      if (filter) params.status = filter;
      const { data } = await api.get('/mail/logs', { params });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch { }
  }

  async function loadQueue() {
    try {
      const params = {};
      if (filter) params.status = filter;
      const { data } = await api.get('/mail/queue', { params });
      setJobs(data.jobs || []);
    } catch { }
  }

  async function loadStatus() {
    try {
      const { data: smtp } = await api.get('/mail/smtp/status');
      setSmtpStatus(smtp);
    } catch { }
    try {
      const { data: imap } = await api.get('/mail/imap/status');
      setImapStatus(imap);
    } catch { }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (tab === 'logs') loadLogs();
    if (tab === 'queue') loadQueue();
  }, [tab, filter]);

  async function sendTestMail() {
    if (!testEmail.trim()) return;
    setLoading(true);
    setTestResult('');
    try {
      await api.post('/mail/test', { to: testEmail.trim() });
      setTestResult('Test-Mail wurde in die Queue eingereiht.');
    } catch (error) {
      setTestResult('Fehler: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  }

  async function verifySmtp() {
    setLoading(true);
    setVerifyResult('');
    try {
      const { data } = await api.post('/mail/smtp/verify');
      setVerifyResult(data.ok ? 'SMTP-Verbindung erfolgreich.' : 'Fehler: ' + data.error);
    } catch (error) {
      setVerifyResult('Fehler: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  }

  async function testImap() {
    setLoading(true);
    setImapTestResult('');
    try {
      const { data } = await api.post('/mail/imap/test');
      setImapTestResult(data.ok ? 'IMAP-Verbindung erfolgreich.' : 'Fehler: ' + data.error);
    } catch (error) {
      setImapTestResult('Fehler: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function processImap() {
    setLoading(true);
    try {
      await api.post('/mail/imap/process');
      setImapTestResult('Postfach wurde geprüft.');
    } catch (error) {
      setImapTestResult('Fehler: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  }

  async function retryJob(jobId) {
    try {
      await api.post(`/mail/queue/${jobId}/retry`);
      loadQueue();
    } catch { }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('de-DE');
  }

  return (
    <AdminPage title="Mail-Log" subtitle="Gesendete und empfangene E-Mails, Warteschlange und Server-Status">
      <div className="mb-4 flex flex-wrap gap-2">
        <button className={tab === 'status' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('status')}><Server size={16} />Status</button>
        <button className={tab === 'logs' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('logs')}><Send size={16} />Logs ({total})</button>
        <button className={tab === 'queue' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('queue')}><Clock size={16} />Queue</button>
        <button className={tab === 'test' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('test')}><Mail size={16} />Test</button>
      </div>

      {tab === 'status' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card overflow-hidden">
            <div className="border-b border-black/5 p-4 font-semibold text-gray-800">SMTP-Status</div>
            <div className="space-y-3 p-4 text-sm">
              {smtpStatus ? (
                <>
                  <div className="flex items-center gap-2"><span className="font-medium">Konfiguriert:</span> {smtpStatus.configured ? <span className="text-green-600">Ja</span> : <span className="text-red-600">Nein</span>}</div>
                  {smtpStatus.host && <div className="flex items-center gap-2"><span className="font-medium">Host:</span> {smtpStatus.host}:{smtpStatus.port}</div>}
                  {smtpStatus.from && <div className="flex items-center gap-2"><span className="font-medium">Absender:</span> {smtpStatus.from}</div>}
                  <button className="btn-secondary mt-2" onClick={verifySmtp} disabled={loading}><RefreshCw size={15} />Verbindung testen</button>
                  {verifyResult && <div className={verifyResult.startsWith('Fehler') ? 'text-red-600' : 'text-green-600'}>{verifyResult}</div>}
                </>
              ) : <span className="text-gray-500">Lade...</span>}
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-black/5 p-4 font-semibold text-gray-800">IMAP-Status</div>
            <div className="space-y-3 p-4 text-sm">
              {imapStatus ? (
                <>
                  <div className="flex items-center gap-2"><span className="font-medium">Konfiguriert:</span> {imapStatus.configured ? <span className="text-green-600">Ja</span> : <span className="text-red-600">Nein</span>}</div>
                  {imapStatus.host && <div className="flex items-center gap-2"><span className="font-medium">Host:</span> {imapStatus.host}:{imapStatus.port}</div>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button className="btn-secondary" onClick={testImap} disabled={loading}><Inbox size={15} />IMAP testen</button>
                    <button className="btn-secondary" onClick={processImap} disabled={loading}><RefreshCw size={15} />Postfach prüfen</button>
                  </div>
                  {imapTestResult && <div className={imapTestResult.startsWith('Fehler') ? 'text-red-600' : 'text-green-600'}>{imapTestResult}</div>}
                </>
              ) : <span className="text-gray-500">Lade...</span>}
            </div>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select className="field w-44" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Alle Status</option>
              <option value="SENT">Gesendet</option>
              <option value="FAILED">Fehlgeschlagen</option>
              <option value="PENDING">Ausstehend</option>
              <option value="PROCESSED">Verarbeitet</option>
            </select>
            <span className="text-sm text-gray-500">{total} Einträge</span>
          </div>
          <div className="card overflow-hidden">
            {/* Mobil: Kartenliste – Log-Zeilen passen sonst nicht aufs Display */}
            <div className="divide-y divide-black/5 md:hidden">
              {logs.map((log) => {
                const [Icon, colorClass] = statusIcons[log.status] || [MailQuestion, 'text-gray-500'];
                return (
                  <div key={log.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${log.direction === 'OUTBOUND' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {log.direction === 'OUTBOUND' ? 'AUS' : 'EIN'}
                      </span>
                      <span className="whitespace-nowrap text-xs text-gray-500">{formatDate(log.createdAt)}</span>
                    </div>
                    <div className="mt-1 font-medium text-gray-800 dark:text-zinc-100">{log.subject}</div>
                    <div className="truncate text-xs text-gray-500 dark:text-zinc-400">{log.fromAddr} → {log.toAddr}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                      <Icon size={14} className={colorClass} /> {log.status}
                    </div>
                    {log.error && <div className="mt-1 break-words text-xs text-red-600">{log.error}</div>}
                  </div>
                );
              })}
              {!logs.length && <div className="p-5 text-center text-sm text-gray-500">Keine E-Mail-Logs vorhanden.</div>}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-left text-xs uppercase text-gray-500">
                    <th className="p-3 font-medium">Zeit</th>
                    <th className="p-3 font-medium">Richtung</th>
                    <th className="p-3 font-medium">Von</th>
                    <th className="p-3 font-medium">An</th>
                    <th className="p-3 font-medium">Betreff</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Fehler</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const [Icon, colorClass] = statusIcons[log.status] || [MailQuestion, 'text-gray-500'];
                    return (
                      <tr key={log.id} className="border-b border-black/5 hover:bg-[#fafafa]">
                        <td className="whitespace-nowrap p-3 text-gray-500">{formatDate(log.createdAt)}</td>
                        <td className="p-3">
                          <span className={log.direction === 'OUTBOUND' ? 'rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700' : 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700'}>
                            {log.direction === 'OUTBOUND' ? 'AUS' : 'EIN'}
                          </span>
                        </td>
                        <td className="max-w-[160px] truncate p-3">{log.fromAddr}</td>
                        <td className="max-w-[160px] truncate p-3">{log.toAddr}</td>
                        <td className="max-w-[240px] truncate p-3 font-medium">{log.subject}</td>
                        <td className="p-3"><Icon size={16} className={colorClass} /></td>
                        <td className="max-w-[200px] truncate p-3 text-red-600">{log.error || ''}</td>
                      </tr>
                    );
                  })}
                  {!logs.length && <tr><td colSpan={7} className="p-8 text-center text-gray-500">Keine E-Mail-Logs vorhanden.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'queue' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select className="field w-44" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Alle Status</option>
              <option value="PENDING">Ausstehend</option>
              <option value="PROCESSING">In Bearbeitung</option>
              <option value="SENT">Gesendet</option>
              <option value="FAILED">Fehlgeschlagen</option>
            </select>
          </div>
          <div className="card overflow-hidden">
            {/* Mobil: Kartenliste der Warteschlange */}
            <div className="divide-y divide-black/5 md:hidden">
              {jobs.map((job) => {
                const [Icon, colorClass] = statusIcons[job.status] || [MailQuestion, 'text-gray-500'];
                return (
                  <div key={job.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-gray-800 dark:text-zinc-100">{job.subject}</span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
                        <Icon size={14} className={colorClass} /> {job.status}
                      </span>
                    </div>
                    <div className="truncate text-xs text-gray-500 dark:text-zinc-400">{job.to}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {formatDate(job.createdAt)} · Versuche {job.attempts}/{job.maxAttempts}
                    </div>
                    {job.status === 'FAILED' && (
                      <button className="btn-secondary mt-3 w-full" onClick={() => retryJob(job.id)}>
                        <RotateCcw size={16} /> Wiederholen
                      </button>
                    )}
                  </div>
                );
              })}
              {!jobs.length && <div className="p-5 text-center text-sm text-gray-500">Keine E-Mails in der Warteschlange.</div>}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-left text-xs uppercase text-gray-500">
                    <th className="p-3 font-medium">Erstellt</th>
                    <th className="p-3 font-medium">An</th>
                    <th className="p-3 font-medium">Betreff</th>
                    <th className="p-3 font-medium">Versuche</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const [Icon, colorClass] = statusIcons[job.status] || [MailQuestion, 'text-gray-500'];
                    return (
                      <tr key={job.id} className="border-b border-black/5 hover:bg-[#fafafa]">
                        <td className="whitespace-nowrap p-3 text-gray-500">{formatDate(job.createdAt)}</td>
                        <td className="max-w-[160px] truncate p-3">{job.to}</td>
                        <td className="max-w-[240px] truncate p-3 font-medium">{job.subject}</td>
                        <td className="p-3">{job.attempts}/{job.maxAttempts}</td>
                        <td className="p-3"><Icon size={16} className={colorClass} /></td>
                        <td className="p-3">
                          {job.status === 'FAILED' && (
                            <button className="btn-secondary text-xs px-2 py-1" onClick={() => retryJob(job.id)}><RotateCcw size={13} /> Wiederholen</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!jobs.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">Keine E-Mails in der Warteschlange.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'test' && (
        <div className="card overflow-hidden max-w-lg">
          <div className="border-b border-black/5 p-4 font-semibold text-gray-800">Test-Mail senden</div>
          <div className="space-y-4 p-4">
            <p className="text-sm text-gray-500">Eine Test-Mail über die Mail-Queue an eine beliebige Adresse senden.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="field flex-1" type="email" placeholder="empfaenger@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
              <button className="btn-primary w-full sm:w-auto" onClick={sendTestMail} disabled={loading || !testEmail.trim()}><Send size={16} />Senden</button>
            </div>
            {testResult && <div className={testResult.startsWith('Fehler') ? 'text-sm text-red-600' : 'text-sm text-green-600'}>{testResult}</div>}
          </div>
        </div>
      )}
    </AdminPage>
  );
}
