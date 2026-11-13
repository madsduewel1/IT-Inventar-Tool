import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Download, ExternalLink, FileText, GitBranch,
  History, Info, Loader2, Power, RefreshCw, Rocket, Save, Server, Settings2,
  ShieldCheck, Terminal, Wrench, XCircle
} from 'lucide-react';
import { api } from '../../api/client';
import { useConfirm } from '../../components/ConfirmDialog';
import { AdminPage } from './Users';

const STATUS_TONE = {
  latest: 'ok',
  update: 'warn',
  no_releases: 'neutral',
  error: 'error',
  disabled: 'neutral',
  never: 'neutral',
  busy: 'neutral'
};

const INSTALL_TONE = {
  idle: 'neutral',
  running: 'warn',
  success: 'ok',
  failed: 'error',
  rollback: 'warn'
};

const STEP_LABELS = {
  queued: 'In Warteschlange',
  backup: 'Backup wird erstellt',
  download: 'Release wird geladen',
  verify: 'Release wird geprüft',
  dependencies: 'Abhängigkeiten & Build',
  activate: 'Neue Version wird aktiviert',
  healthcheck: 'Healthcheck läuft',
  done: 'Abgeschlossen',
  rollback: 'Rollback läuft',
  rollback_done: 'Rollback abgeschlossen',
  rollback_failed: 'Rollback fehlgeschlagen'
};

function formatDate(value) {
  if (!value) return '–';
  try {
    return new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function statusLabel(status) {
  return {
    latest: 'Aktuell',
    update: 'Update verfügbar',
    no_releases: 'Keine Releases',
    error: 'Fehler',
    disabled: 'Deaktiviert',
    never: 'Noch nicht geprüft',
    busy: 'Prüfung läuft'
  }[status] || status || '–';
}

function Tone({ tone = 'neutral', children }) {
  const styles = {
    ok: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900',
    warn: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900',
    error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900',
    neutral: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[tone] || styles.neutral}`}>
      {children}
    </span>
  );
}

function StatusRow({ icon, label, value, sub, tone }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-black/5 bg-white/60 p-3 dark:border-white/10 dark:bg-zinc-900/40">
      <span className="mt-0.5 text-outline">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-outline">{label}</div>
        <div className="mt-0.5 truncate text-sm font-semibold text-on-surface">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-on-surface-variant">{sub}</div>}
        {tone}
      </div>
    </div>
  );
}

export default function SystemUpdates() {
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState(null);
  const [form, setForm] = useState({
    enabled: true,
    repo: '',
    channel: 'stable',
    token: '',
    autoCheck: true,
    checkHours: 24,
    notify: true,
    autoInstall: false
  });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: response } = await api.get('/system/updates/status');
      setData(response);
      const settings = response.settings || {};
      setForm((prev) => ({
        enabled: settings.enabled ?? prev.enabled,
        repo: settings.repo ?? prev.repo,
        channel: settings.channel ?? prev.channel,
        token: '',
        autoCheck: settings.autoCheck ?? prev.autoCheck,
        checkHours: settings.checkHours ?? prev.checkHours,
        notify: settings.notify ?? prev.notify,
        autoInstall: settings.autoInstall ?? prev.autoInstall
      }));
    } catch (error) {
      if (!silent) setMessage({ tone: 'error', text: error.response?.data?.error || 'Update-Status konnte nicht geladen werden.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const running = data?.installStatus === 'running';
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => load(true), 4000);
    return () => clearInterval(timer);
  }, [running, load]);

  async function runCheck() {
    setChecking(true);
    setMessage(null);
    try {
      const { data: response } = await api.post('/system/updates/check');
      setData(response.status);
      const result = response.result || {};
      if (result.status === 'update') {
        setMessage({ tone: 'warn', text: `Neue Version ${result.available?.version} verfügbar.` });
      } else if (result.status === 'latest') {
        setMessage({ tone: 'ok', text: 'Das System ist bereits auf dem neuesten Stand.' });
      } else if (result.status === 'no_releases') {
        setMessage({ tone: 'neutral', text: 'Es wurden noch keine GitHub-Releases veröffentlicht.' });
      } else {
        setMessage({ tone: result.status === 'error' ? 'error' : 'neutral', text: result.message || 'Prüfung abgeschlossen.' });
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error.response?.data?.error || 'Versionsprüfung fehlgeschlagen.' });
    } finally {
      setChecking(false);
    }
  }

  async function runInstall() {
    const available = data?.available;
    if (!available) return;
    const ok = await confirm({
      title: 'Update installieren?',
      message: `Installierte Version: ${data.currentVersion}\nNeue Version: ${available.version}\n\nVor der Installation werden Backups erstellt. Das System ist währenddessen kurzzeitig nicht erreichbar.`,
      confirmLabel: 'Update jetzt installieren',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;

    setInstalling(true);
    setMessage(null);
    try {
      const { data: response } = await api.post('/system/updates/install', { version: available.version });
      setData(response.status);
      sessionStorage.setItem('maintenanceExpected', '1');
      setMessage({ tone: 'ok', text: 'Installation wurde gestartet. Das System wechselt in den Wartungsmodus.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.response?.data?.error || 'Installation konnte nicht gestartet werden.' });
    } finally {
      setInstalling(false);
    }
  }

  async function saveSettings(event) {
    event?.preventDefault?.();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        enabled: form.enabled,
        repo: form.repo,
        channel: form.channel,
        autoCheck: form.autoCheck,
        checkHours: form.checkHours,
        notify: form.notify,
        autoInstall: form.autoInstall
      };
      if (form.token) payload.token = form.token;
      const { data: response } = await api.put('/system/updates/settings', payload);
      setData(response.status);
      setForm((prev) => ({ ...prev, token: '' }));
      setMessage({ tone: 'ok', text: 'Einstellungen gespeichert.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.response?.data?.error || 'Einstellungen konnten nicht gespeichert werden.' });
    } finally {
      setSaving(false);
    }
  }

  async function clearMaintenance() {
    try {
      await api.post('/system/updates/maintenance', { enabled: false });
      sessionStorage.removeItem('maintenanceExpected');
      setMessage({ tone: 'ok', text: 'Wartungsmodus beendet.' });
      load(true);
    } catch (error) {
      setMessage({ tone: 'error', text: error.response?.data?.error || 'Wartungsmodus konnte nicht beendet werden.' });
    }
  }

  async function loadLogs() {
    setShowLogs((value) => !value);
    if (logs) return;
    try {
      const { data: response } = await api.get('/system/updates/logs?limit=200');
      setLogs(response);
    } catch {
      setLogs({ fileLog: [], stateLog: [] });
    }
  }

  const available = data?.available;
  const currentVersion = data?.currentVersion || '–';
  const latestVersion = data?.latest?.version || '–';
  const checkStatus = data?.lastCheckStatus || 'never';
  const installStatus = data?.installStatus || 'idle';
  const maintenance = data?.maintenance;

  const releaseDate = useMemo(() => formatDate(available?.publishedAt), [available?.publishedAt]);

  return (
    <AdminPage title="System-Updates" subtitle="GitHub-Release prüfen und Updates sicher installieren">
      {message && (
        <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
          message.tone === 'ok' ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-900/20 dark:text-green-300' :
          message.tone === 'error' ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300' :
          message.tone === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300' :
          'border-gray-300 bg-gray-50 text-gray-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
        }`}>
          {message.tone === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : message.tone === 'error' ? <XCircle size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span className="whitespace-pre-wrap">{message.text}</span>
        </div>
      )}

      {maintenance?.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <Wrench size={16} />
            <span>Wartungsmodus ist aktiv{maintenance.stale ? ' (möglicherweise hängen geblieben)' : ''}.</span>
          </div>
          <button type="button" className="btn-secondary" onClick={clearMaintenance}>
            <Power size={15} /> Wartungsmodus beenden
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {/* Dashboard */}
          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline">
                <Rocket size={14} /> Update-Status
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={runCheck} disabled={checking || running}>
                  <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
                  {checking ? 'Prüfe …' : 'Jetzt prüfen'}
                </button>
                <button type="button" className="btn-primary" onClick={runInstall} disabled={!available || installing || running}>
                  <Download size={16} />
                  {running ? 'Installation läuft' : installing ? 'Starte …' : 'Update installieren'}
                </button>
              </div>
            </div>

            {loading && !data ? (
              <div className="text-sm text-on-surface-variant">Lade Status …</div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <StatusRow icon={<Server size={15} />} label="Installierte Version" value={`v${currentVersion}`} sub={data?.versionInfo?.releasedAt ? `Release ${data.versionInfo.releasedAt}` : null} />
                  <StatusRow icon={<GitBranch size={15} />} label="Neueste Version" value={latestVersion === '–' ? '–' : `v${latestVersion}`} sub={data?.latest?.name || null} />
                  <StatusRow icon={<Info size={15} />} label="Update-Status" value={statusLabel(checkStatus)} tone={<div className="mt-1"><Tone tone={STATUS_TONE[checkStatus] || 'neutral'}>{statusLabel(checkStatus)}</Tone></div>} />
                  <StatusRow icon={<Clock size={15} />} label="Letzte Prüfung" value={formatDate(data?.lastCheckAt)} sub={data?.lastCheckError || null} />
                  <StatusRow icon={<History size={15} />} label="Letztes Update" value={data?.lastUpdate?.version ? `v${data.lastUpdate.version}` : '–'} sub={data?.lastUpdate?.at ? formatDate(data.lastUpdate.at) : null} />
                  <StatusRow icon={<Settings2 size={15} />} label="Quelle / Kanal" value={data?.settings?.repo || '–'} sub={`Kanal: ${data?.settings?.channel || 'stable'}`} />
                </div>

                {data?.lastCheckError && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>{data.lastCheckError}</span>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Verfügbares Update */}
          {available && (
            <section className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-black/5 bg-amber-50/60 px-5 py-3 dark:border-white/10 dark:bg-amber-900/10">
                <Download size={16} className="text-amber-600" />
                <span className="flex-1 text-sm font-bold text-on-surface">Update verfügbar: v{available.version}</span>
                <Tone tone="warn">v{currentVersion} → v{available.version}</Tone>
              </div>
              <div className="space-y-4 p-5">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><span className="text-outline">Titel:</span> <span className="font-medium text-on-surface">{available.name || available.tag}</span></div>
                  <div><span className="text-outline">Veröffentlicht:</span> <span className="font-medium text-on-surface">{releaseDate}</span></div>
                  <div><span className="text-outline">Tag:</span> <span className="font-mono text-xs text-on-surface">{available.tag}</span></div>
                  <div><span className="text-outline">Commit:</span> <span className="font-mono text-xs text-on-surface">{available.targetCommitish || '–'}</span></div>
                </div>
                {available.body && (
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-outline"><FileText size={13} /> Release Notes</div>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-black/5 bg-gray-50 p-3 text-xs leading-relaxed text-on-surface-variant dark:border-white/10 dark:bg-zinc-900/50">{available.body}</pre>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {available.htmlUrl && (
                    <a href={available.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                      <ExternalLink size={14} /> Auf GitHub ansehen
                    </a>
                  )}
                  <span className="text-xs text-outline">Vor der Installation werden Datenbank und aktueller Stand gesichert.</span>
                </div>
              </div>
            </section>
          )}

          {/* Installationsfortschritt */}
          {installStatus !== 'idle' && (
            <section className="card p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline">
                <Terminal size={14} /> Installation
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Tone tone={INSTALL_TONE[installStatus] || 'neutral'}>
                  {installStatus === 'running' ? <Loader2 size={12} className="animate-spin" /> : installStatus === 'success' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {installStatus}
                </Tone>
                {data?.installTargetVersion && <span className="text-sm text-on-surface">Ziel: v{data.installTargetVersion}</span>}
                {data?.installStep && <span className="text-sm text-on-surface-variant">{STEP_LABELS[data.installStep] || data.installStep}</span>}
              </div>
              {data?.installError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">{data.installError}</div>
              )}
              {Array.isArray(data?.installLog) && data.installLog.length > 0 && (
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-black/5 bg-gray-50 p-3 text-[11px] leading-relaxed text-on-surface-variant dark:border-white/10 dark:bg-zinc-900/50">
                  {data.installLog.map((entry) => `[${formatDate(entry.ts)}] ${entry.message}`).join('\n')}
                </pre>
              )}
            </section>
          )}

          {/* Historie */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-black/5 px-5 py-3 dark:border-white/10">
              <div className="flex items-center gap-2 text-sm font-bold text-on-surface"><History size={15} /> Update-Historie</div>
              <button type="button" onClick={loadLogs} className="text-xs font-medium text-primary hover:underline">Protokoll anzeigen</button>
            </div>
            {Array.isArray(data?.history) && data.history.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-outline dark:bg-zinc-900/50">
                    <tr>
                      <th className="px-4 py-2">Von</th>
                      <th className="px-4 py-2">Nach</th>
                      <th className="px-4 py-2">Gestartet</th>
                      <th className="px-4 py-2">Ergebnis</th>
                      <th className="px-4 py-2">Ausgeführt von</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/10">
                    {data.history.map((entry) => (
                      <tr key={entry.id || `${entry.toVersion}-${entry.startedAt}`}>
                        <td className="px-4 py-2 font-mono text-xs">v{entry.fromVersion || '?'}</td>
                        <td className="px-4 py-2 font-mono text-xs">v{entry.toVersion || '?'}</td>
                        <td className="px-4 py-2 text-xs text-on-surface-variant">{formatDate(entry.startedAt)}</td>
                        <td className="px-4 py-2">
                          <Tone tone={entry.result === 'success' ? 'ok' : entry.result === 'failed' ? 'error' : entry.result === 'rollback' ? 'warn' : 'neutral'}>
                            {entry.result}
                          </Tone>
                        </td>
                        <td className="px-4 py-2 text-xs text-on-surface-variant">{entry.actor || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 text-sm text-on-surface-variant">Noch keine Update-Vorgänge protokolliert.</div>
            )}
            {showLogs && (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-black/5 bg-gray-50 p-4 text-[11px] leading-relaxed text-on-surface-variant dark:border-white/10 dark:bg-zinc-900/50">
                {(logs?.fileLog?.length ? logs.fileLog : (logs?.stateLog || []).map((entry) => `[${entry.ts}] ${entry.message}`)).join('\n') || 'Kein Protokoll vorhanden.'}
              </pre>
            )}
          </section>
        </div>

        {/* Einstellungen */}
        <div className="space-y-5">
          <form className="card p-5" onSubmit={saveSettings}>
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface"><Settings2 size={16} /> Einstellungen</div>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-on-surface">Update-System aktiv</span>
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} />
              </label>

              <div>
                <label className="mb-1 block text-xs font-semibold text-outline">GitHub-Repository</label>
                <input className="input w-full" value={form.repo} readOnly placeholder="owner/name" />
                <p className="mt-1 text-[11px] text-outline">Aus Sicherheitsgründen in <code>/etc/inventar-tool/update.conf</code> festgelegt. Änderungen dort vornehmen und den Helfer neu registrieren.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-outline">Release-Kanal</label>
                  <select className="input w-full" value={form.channel} onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}>
                    <option value="stable">Stable</option>
                    <option value="beta">Beta (Pre-Releases)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-outline">Prüfintervall (h)</label>
                  <input type="number" min="1" max="168" className="input w-full" value={form.checkHours} onChange={(e) => setForm((p) => ({ ...p, checkHours: e.target.value }))} />
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-on-surface">Automatische Prüfung</span>
                <input type="checkbox" checked={form.autoCheck} onChange={(e) => setForm((p) => ({ ...p, autoCheck: e.target.checked }))} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-on-surface">Benachrichtigungen</span>
                <input type="checkbox" checked={form.notify} onChange={(e) => setForm((p) => ({ ...p, notify: e.target.checked }))} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-on-surface">Automatisch installieren</span>
                <input type="checkbox" checked={form.autoInstall} onChange={(e) => setForm((p) => ({ ...p, autoInstall: e.target.checked }))} />
              </label>

              <div>
                <label className="mb-1 block text-xs font-semibold text-outline">GitHub-Token (optional, privat)</label>
                <input type="password" className="input w-full" value={form.token} onChange={(e) => setForm((p) => ({ ...p, token: e.target.value }))} placeholder={data?.settings?.tokenConfigured ? '•••••••• (gespeichert)' : 'nicht gesetzt'} autoComplete="new-password" />
                <p className="mt-1 text-[11px] text-outline">Wird nur serverseitig gespeichert und nie an das Frontend übertragen. Leer lassen, um den gespeicherten Token zu behalten.</p>
              </div>

              <button type="submit" className="btn-primary w-full" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Speichere …' : 'Einstellungen speichern'}
              </button>
            </div>
          </form>

          <div className="card p-5 text-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-on-surface"><ShieldCheck size={16} /> Systemintegration</div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-outline">Update-Helfer</dt><dd className={data?.client?.installed ? 'text-green-600' : 'text-red-500'}>{data?.client?.installed ? 'installiert' : 'fehlt'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-outline">Pfad</dt><dd className="truncate font-mono">{data?.client?.path || '–'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-outline">Installation</dt><dd className="truncate font-mono">{data?.client?.installDir || '–'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-outline">Dienst</dt><dd className="font-mono">{data?.client?.serviceName || '–'}</dd></div>
            </dl>
            {!data?.client?.installed && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
                Der Root-Helfer ist noch nicht eingerichtet. Einmalig ausführen: <code>sudo bash installer/register-updater.sh</code>
              </p>
            )}
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
