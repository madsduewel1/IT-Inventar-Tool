import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, Download, Save, CheckCircle2, AlertTriangle, XCircle,
  Clock, Server, Rocket, ShieldCheck, Settings2, FileText, Info, Loader2, Power
} from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage } from './Users';

const STATUS_TONE = {
  latest: 'ok',
  update: 'warn',
  signature_invalid: 'error',
  key_missing: 'error',
  not_configured: 'error',
  error: 'error',
  busy: 'neutral',
  disabled: 'neutral',
  never: 'neutral'
};

export default function SystemUpdates() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ enabled: false, serverUrl: '', channel: 'stable', publicKey: '', autoInstall: false, telemetry: true, checkHour: 2 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: response } = await api.get('/system/updates');
      setData(response);
      const db = response.dbSettings || {};
      setForm({
        enabled: db.enabled !== '' ? db.enabled === 'true' : !!(response.defaults?.enabled),
        serverUrl: db.serverUrl !== '' ? db.serverUrl : (response.defaults?.serverUrl || ''),
        channel: db.channel !== '' ? db.channel : (response.defaults?.channel || 'stable'),
        publicKey: db.publicKey || '',
        autoInstall: db.autoInstall !== '' ? db.autoInstall === 'true' : !!(response.defaults?.autoInstall),
        telemetry: db.telemetry !== '' ? db.telemetry === 'true' : !!(response.defaults?.telemetry),
        checkHour: db.checkHour !== '' ? Number(db.checkHour) : Number(response.defaults?.checkHour ?? 2)
      });
    } catch {
      setMessage({ tone: 'error', text: 'Status konnte nicht geladen werden.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runCheck() {
    if (!form.enabled) return;
    setChecking(true);
    setMessage(null);
    try {
      const { data: response } = await api.post('/system/updates/check');
      setData(response.status);
      setMessage(mapCheckMessage(response.result));
    } catch (error) {
      setMessage({ tone: 'error', text: error.response?.data?.error || 'Update-Check fehlgeschlagen.' });
    } finally {
      setChecking(false);
    }
  }

  async function runInstall() {
    if (!form.enabled) return;
    setInstalling(true);
    setMessage(null);
    try {
      const { data: response } = await api.post('/system/updates/install');
      setData(response.status);
      setMessage({ tone: 'ok', text: 'Installation wurde gestartet. Der Service startet sich automatisch neu.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.response?.data?.error || 'Installation konnte nicht gestartet werden.' });
    } finally {
      setInstalling(false);
    }
  }

  async function toggleEnabled(next) {
    setToggling(true);
    setMessage(null);
    try {
      const { data: response } = await api.patch('/system/updates/settings', { enabled: next ? 'true' : 'false' });
      setData(response.status);
      setForm((prev) => ({ ...prev, enabled: next }));
      setMessage({ tone: 'ok', text: next ? 'Update-Funktion aktiviert.' : 'Update-Funktion deaktiviert.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.response?.data?.error || 'Konnte Status nicht aendern.' });
    } finally {
      setToggling(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setMessage(null);
    try {
      const { data: response } = await api.patch('/system/updates/settings', {
        serverUrl: form.serverUrl,
        channel: form.channel,
        publicKey: form.publicKey,
        autoInstall: form.autoInstall ? 'true' : 'false',
        telemetry: form.telemetry ? 'true' : 'false',
        checkHour: String(form.checkHour)
      });
      setData(response.status);
      setMessage({ tone: 'ok', text: 'Einstellungen gespeichert.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.response?.data?.error || 'Einstellungen konnten nicht gespeichert werden.' });
    } finally {
      setSaving(false);
    }
  }

  const lastCheck = data?.lastCheckAt ? new Date(data.lastCheckAt).toLocaleString('de-DE') : '–';
  const installStatus = data?.installStatus || 'idle';
  const available = data?.available;

  return (
    <AdminPage title="System-Updates (Beta)" subtitle="Update-System konfigurieren, Updates pruefen und installieren">
      {message && (
        <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
          message.tone === 'ok' ? 'border-green-300 bg-green-50 text-green-800' :
          message.tone === 'error' ? 'border-red-300 bg-red-50 text-red-800' :
          'border-amber-300 bg-amber-50 text-amber-800'
        }`}>
          {message.tone === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : message.tone === 'error' ? <XCircle size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        {/* Linke Spalte: Status + Verlauf */}
        <div className="space-y-5">
          {/* Aktivierung */}
          <div className={`card p-5 ${form.enabled ? 'border-green-200 bg-green-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 ${form.enabled ? 'text-green-600' : 'text-amber-600'}`}><Power size={20} /></span>
                <div>
                  <div className="text-sm font-bold text-on-surface">
                    {form.enabled ? 'Automatische Updates sind aktiviert' : 'Automatische Updates sind deaktiviert'}
                  </div>
                  <div className="mt-0.5 max-w-xl text-xs leading-5 text-on-surface-variant">
                    {form.enabled
                      ? 'Der tägliche Check läuft aktiv. Neue Updates werden gefunden und (je nach Einstellung) automatisch installiert.'
                      : 'Testmodus: Das Update-System ist aus. Sie können die Verbindung zum Update-Server weiterhin unten vorbereiten – aktiviert bleibt es nur zum Testen und Sie schalten es hier jederzeit wieder aus.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={form.enabled ? 'btn-secondary' : 'btn-primary'}
                onClick={() => toggleEnabled(!form.enabled)}
                disabled={toggling || loading}
              >
                {toggling ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                {form.enabled ? 'Deaktivieren' : 'Aktivieren'}
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline">
              <Rocket size={14} /> Status
            </div>

            {loading ? (
              <div className="text-sm text-on-surface-variant">Lade Status...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatusRow icon={<Server size={15} />} label="Installierte Version" value={data?.currentVersion || '–'} />
                  <StatusRow icon={<Settings2 size={15} />} label="Aktiver Kanal" value={form.channel} />
                  <StatusRow
                    icon={<ShieldCheck size={15} />}
                    label="Öffentlicher Schlüssel"
                    value={data?.settings?.publicKeyConfigured ? 'Hinterlegt' : 'Fehlt'}
                    tone={data?.settings?.publicKeyConfigured ? 'ok' : 'error'}
                  />
                  <StatusRow
                    icon={<Power size={15} />}
                    label="Funktion"
                    value={form.enabled ? 'Aktiviert' : 'Deaktiviert'}
                    tone={form.enabled ? 'ok' : 'neutral'}
                  />
                  <StatusRow
                    icon={<Clock size={15} />}
                    label="Letzter Check"
                    value={lastCheck}
                    sub={statusLabel(data?.lastCheckStatus)}
                    tone={STATUS_TONE[data?.lastCheckStatus] || 'neutral'}
                  />
                </div>

                {data?.lastCheckError && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>{data.lastCheckError}</span>
                  </div>
                )}

                {installStatus === 'installing' && (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    <Loader2 size={13} className="animate-spin shrink-0" />
                    Installation läuft – der Dienst wird kurz neu gestartet.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={runCheck} disabled={checking || loading || !form.enabled}>
                    <span className={checking ? 'animate-spin' : ''}><RefreshCw size={16} /></span>
                    {checking ? 'Prüfe...' : 'Jetzt prüfen'}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={runInstall}
                    disabled={installing || loading || !available || installStatus === 'installing' || !form.enabled}
                    title={!form.enabled ? 'Update-Funktion zuerst aktivieren' : (available ? `Version ${available.manifest?.version} installieren` : 'Kein überprüftes Update vorhanden')}
                  >
                    {installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {available ? `Version ${available.manifest?.version} installieren` : 'Installieren'}
                  </button>
                </div>
                {!form.enabled && (
                  <div className="flex items-start gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface-variant">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    Die Prüf- und Installationsfunktionen sind deaktiviert. Schalten Sie die Update-Funktion oben ein, um zu testen.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Verfügbares Update */}
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline">
              <FileText size={14} /> Verfügbares Update
            </div>
            {available ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                    {available.manifest?.version}
                  </span>
                  <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs text-on-surface-variant">
                    Kanal: {available.manifest?.channel}
                  </span>
                  <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs text-on-surface-variant">
                    SHA-256: {(available.manifest?.sha256 || '').slice(0, 16)}…
                  </span>
                </div>
                {(available.releaseNotes || []).length > 0 && (
                  <ul className="list-inside list-disc space-y-1 text-sm text-on-surface-variant">
                    {available.releaseNotes.map((note, index) => <li key={index}>{note}</li>)}
                  </ul>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <CheckCircle2 size={15} className="text-badge-green" />
                Kein überprüftes Update verfügbar. (Letzter Check: {lastCheck})
              </div>
            )}
          </div>

          {/* Installationsprotokoll */}
          {(data?.installLog || []).length > 0 && (
            <div className="card p-5">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline">
                <FileText size={14} /> Installationsprotokoll
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-surface-container px-3 py-2 font-mono text-[11px] leading-5 text-on-surface-variant">
                {data.installLog.slice(-100).map((entry, index) => (
                  <div key={index}>{entry.ts?.replace('T', ' ').slice(0, 19)}  {entry.message}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rechte Spalte: Konfiguration */}
        <div className="card h-fit p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline">
            <Settings2 size={14} /> Update-Einstellungen
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Update-Server URL</span>
              <input
                type="url"
                className="field"
                placeholder="https://update-inventar-tool.schnikdu.com"
                value={form.serverUrl}
                onChange={(event) => setForm({ ...form, serverUrl: event.target.value })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Kanal</span>
              <select className="field" value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>
                <option value="stable">stable</option>
                <option value="beta">beta</option>
              </select>
              <span className="mt-1 block text-[11px] text-outline">Beta enthält auch alle Stable-Versionen.</span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Öffentlicher Schlüssel (PEM)</span>
              <textarea
                className="field min-h-24 font-mono text-[11px]"
                placeholder="-----BEGIN PUBLIC KEY-----..."
                value={form.publicKey}
                onChange={(event) => setForm({ ...form, publicKey: event.target.value })}
              />
              <span className="mt-1 block text-[11px] text-outline">Der Schlüssel wird auf dem Update-Server unter „Öffentlicher Schlüssel" angezeigt und muss hier identisch hinterlegt werden.</span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Automatischer Check (Uhrzeit, 0-23)</span>
              <input
                type="number"
                min="0"
                max="23"
                className="field"
                value={form.checkHour}
                onChange={(event) => setForm({ ...form, checkHour: Number(event.target.value) })}
              />
            </label>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-on-surface">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.autoInstall}
                  onChange={(event) => setForm({ ...form, autoInstall: event.target.checked })}
                />
                Automatisch installieren (Achtung: Server wird neu gestartet)
              </label>
              <label className="flex items-center gap-2 text-sm text-on-surface">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.telemetry}
                  onChange={(event) => setForm({ ...form, telemetry: event.target.checked })}
                />
                Anonyme Installation-ID an Update-Server senden
              </label>
            </div>

            <button type="button" className="btn-primary w-full" onClick={saveSettings} disabled={saving}>
              <Save size={16} /> {saving ? 'Speichert...' : 'Einstellungen speichern'}
            </button>

            <div className="rounded-lg bg-surface-container px-3 py-2.5 text-[11px] leading-5 text-on-surface-variant">
              <span className="font-semibold">Benötigt:</span> Das Client-Skript muss als Root eingerichtet sein
              (installer/register-autoupdater.sh). Installationspfad: {data?.machine?.installDir || '/opt/inventar-tool'}
              {data?.machine?.autoreflect && ' · update.conf gefunden'}
            </div>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}

function StatusRow({ icon, label, value, sub, tone }) {
  const dotTone = tone === 'ok' ? 'bg-green-500' : tone === 'error' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface px-3 py-2.5">
      <span className="mt-0.5 text-on-surface-variant">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-outline">{label}</div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
          <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
          <span className="truncate">{value}</span>
        </div>
        {sub && <div className="text-[11px] text-on-surface-variant">{sub}</div>}
      </div>
    </div>
  );
}

function statusLabel(status) {
  const labels = {
    latest: 'Aktuell',
    update: 'Update verfügbar',
    signature_invalid: 'Signatur ungültig',
    key_missing: 'Schlüssel fehlt',
    not_configured: 'Nicht konfiguriert',
    error: 'Fehler',
    busy: 'Läuft bereits',
    disabled: 'Deaktiviert',
    never: 'Noch nie geprüft'
  };
  return labels[status] || status || 'Unknown';
}

function mapCheckMessage(result) {
  if (!result) return null;
  switch (result.status) {
    case 'latest': return { tone: 'ok', text: 'Alle Versionen sind aktuell.' };
    case 'update': return { tone: 'ok', text: `Update ${result.version} (${result.channel}) ist verfügbar und signiert.` };
    case 'signature_invalid': return { tone: 'error', text: 'Die Signatur des Updates ist ungültig – Update wurde verworfen.' };
    case 'key_missing': return { tone: 'error', text: 'Der öffentliche Schlüssel des Update-Servers ist nicht hinterlegt.' };
    case 'not_configured': return { tone: 'error', text: 'Es ist kein Update-Server konfiguriert.' };
    case 'disabled': return { tone: 'neutral', text: 'Die Update-Funktion ist deaktiviert.' };
    case 'error': return { tone: 'error', text: result.message || 'Update-Check fehlgeschlagen.' };
    default: return null;
  }
}