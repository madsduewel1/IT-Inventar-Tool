import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, ExternalLink, KeyRound, Mail, Monitor, Save, ShieldCheck, SlidersHorizontal, Tag, UsersRound } from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage } from './Users';
import { AssetLabel } from '../../components/AssetLabel';

const defaults = {
  'org.name': '',
  'org.email': '',
  'org.logo': '',
  'label.widthMm': '70',
  'label.heightMm': '35',
  'app.url': '',
  'app.locale': 'de',
  'ui.defaultView': 'list',
  'loans.defaultDueDays': '14',
  'notifications.overdueEnabled': 'true',
  'sso.enabled': 'false',
  'sso.provider': 'oidc',
  'sso.clientId': '',
  'sso.clientSecret': '',
  'sso.issuerUrl': '',
  'sso.redirectUri': `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/auth/sso/callback`,
  'sso.buttonLabel': 'Mit SSO anmelden',
  'sso.force': 'false',
  'sso.groupSource': 'claim',
  'sso.adminApiUrl': '',
  'sso.adminApiToken': '',
  'sso.groupClaim': 'groups',
  'sso.availableGroups': '[]',
  'sso.groupMappings': '[]',
  'login.infoText': ''
};

const sections = [
  { id: 'general', label: 'Organisation', icon: Building2 },
  { id: 'usage', label: 'Bedienung', icon: SlidersHorizontal },
  { id: 'labels', label: 'Labeldruck', icon: Tag },
  { id: 'mail', label: 'Mail', icon: Mail },
  { id: 'sso', label: 'SSO', icon: KeyRound },
  { id: 'roles', label: 'Rechte & Gruppen', icon: ShieldCheck },
  { id: 'system', label: 'Systemübersicht', icon: Monitor }
];

const roles = [
  ['VIEWER', 'Viewer'],
  ['STAFF', 'Staff'],
  ['ADMIN', 'Admin']
];

const permissions = [
  ['ISSUE_REPORT', 'Fehler melden'],
  ['ISSUE_MANAGE', 'Fehler bearbeiten']
];

export default function Settings() {
  const params = useParams();
  const navigate = useNavigate();
  const activeSection = sections.some((entry) => entry.id === params.section) ? params.section : 'general';
  const [settings, setSettings] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const [systemLoading, setSystemLoading] = useState(false);

  useEffect(() => {
    api.get('/settings')
      .then(({ data }) => setSettings({ ...defaults, ...(data.settings || {}) }))
      .catch(() => setError('Einstellungen konnten nicht geladen werden.'));
  }, []);

  const availableGroups = useMemo(() => parseJson(settings['sso.availableGroups'], []), [settings]);
  const groupMappings = useMemo(() => parseJson(settings['sso.groupMappings'], []), [settings]);

  function setValue(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError('');
  }

  function setMappings(nextMappings) {
    setValue('sso.groupMappings', JSON.stringify(nextMappings));
  }

  async function save(event) {
    event.preventDefault();
    try {
      const { data } = await api.patch('/settings', settings);
      setSettings({ ...defaults, ...(data.settings || {}) });
      setSaved(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Einstellungen konnten nicht gespeichert werden.');
    }
  }

  async function syncGroups() {
    setSyncing(true);
    setError('');
    try {
      const { data } = await api.post('/settings/sso/groups/sync', {
        adminApiUrl: settings['sso.adminApiUrl'],
        adminApiToken: settings['sso.adminApiToken']
      });
      setValue('sso.availableGroups', JSON.stringify(data.groups || []));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'SSO-Gruppen konnten nicht geladen werden.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AdminPage title="Systemeinstellungen" subtitle="Rubriken für Organisation, SSO, Gruppenmapping und Systemverhalten">
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="card h-fit overflow-hidden p-2">
          {sections.map((entry) => {
            const Icon = entry.icon;
            const active = entry.id === activeSection;
            return (
              <Link
                key={entry.id}
                to={entry.id === 'general' ? '/admin/settings' : `/admin/settings/${entry.id}`}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active ? 'bg-[#27272a] text-[#e5e7eb]' : 'text-gray-600 hover:bg-[#fafafa]'}`}
              >
                <Icon size={18} />
                {entry.label}
              </Link>
            );
          })}
        </nav>

        <form onSubmit={save} className="page-enter space-y-6">
          {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

          {activeSection === 'general' && (
            <section className="card overflow-hidden">
              <Header title="Organisation" text="Diese Daten erscheinen in Setup, QR-URLs und Systemkontext." />
              <div className="grid gap-3 p-5 md:grid-cols-2">
                <Field label="Organisationsname" value={settings['org.name']} onChange={(value) => setValue('org.name', value)} />
                <Field label="Kontakt-E-Mail" type="email" value={settings['org.email']} onChange={(value) => setValue('org.email', value)} />
                <Field label="Logo-Pfad" value={settings['org.logo']} onChange={(value) => setValue('org.logo', value)} />
                <Field label="App-URL" value={settings['app.url']} onChange={(value) => setValue('app.url', value)} placeholder="https://mz.example.de" />
                <label className="text-sm font-medium text-gray-700 md:col-span-2 block">Info-Text auf dem Login-Screen
                  <textarea className="field mt-1 min-h-24 bg-white" placeholder="Hier können z.B. Kontaktdaten der IT oder Öffnungszeiten stehen..." value={settings['login.infoText'] || ''} onChange={(event) => setValue('login.infoText', event.target.value)} />
                </label>
              </div>
            </section>
          )}

          {activeSection === 'usage' && (
            <section className="card overflow-hidden">
              <Header title="Bedienung" text="Standardansichten, Sprache und Benachrichtigungen steuern." />
              <div className="grid gap-3 p-5 md:grid-cols-3">
                <label className="text-sm font-medium text-gray-700">Sprache
                  <select className="field mt-1" value={settings['app.locale']} onChange={(event) => setValue('app.locale', event.target.value)}>
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">Standardansicht
                  <select className="field mt-1" value={settings['ui.defaultView']} onChange={(event) => setValue('ui.defaultView', event.target.value)}>
                    <option value="list">Liste</option>
                    <option value="cards">Karten</option>
                  </select>
                </label>
                <Field label="Standard-Leihdauer Tage" type="number" value={settings['loans.defaultDueDays']} onChange={(value) => setValue('loans.defaultDueDays', value)} />
                <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm font-medium text-gray-700 md:col-span-3">
                  <input type="checkbox" checked={settings['notifications.overdueEnabled'] === 'true'} onChange={(event) => setValue('notifications.overdueEnabled', String(event.target.checked))} />
                  Überfällige Ausleihen in Benachrichtigungen anzeigen
                </label>
              </div>
            </section>
          )}

          {activeSection === 'labels' && (
            <section className="card overflow-hidden">
              <Header title="Labeldruck" text="Größe für Geräteetiketten mit QR-Code, Organisation, Gerätename und Standort." />
              <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Label-Breite in mm" type="number" min="30" max="160" value={settings['label.widthMm']} onChange={(value) => setValue('label.widthMm', value)} />
                  <Field label="Label-Höhe in mm" type="number" min="20" max="100" value={settings['label.heightMm']} onChange={(value) => setValue('label.heightMm', value)} />
                </div>
                <div className="rounded-xl bg-[#fafafa] p-4">
                  <div className="mb-3 text-sm font-semibold text-gray-800">Vorschau</div>
                  <div className="flex min-h-40 items-start justify-center overflow-hidden rounded-xl bg-white p-4">
                    <AssetLabel preview settings={settings} device={{ inventoryId: 'INV-042', model: 'Beispielgerät', room: { name: 'Medienraum 1' } }} qrValue={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/devices/INV-042`} />
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'mail' && (
            <section className="card overflow-hidden">
              <Header title="Mail-Konfiguration" text="SMTP für ausgehende Mails, IMAP für eingehende Mails und DKIM-Signatur." />
              <div className="border-b border-black/5 p-5">
                <div className="mb-3 font-semibold text-gray-800">SMTP (Ausgehend)</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="SMTP-Host" value={settings['mail.smtp.host']} onChange={(value) => setValue('mail.smtp.host', value)} placeholder="smtp.example.com" />
                  <Field label="SMTP-Port" type="number" value={settings['mail.smtp.port']} onChange={(value) => setValue('mail.smtp.port', value)} placeholder="587" />
                  <Field label="SMTP-Benutzer" value={settings['mail.smtp.user']} onChange={(value) => setValue('mail.smtp.user', value)} />
                  <Field label="SMTP-Passwort" type="password" value={settings['mail.smtp.pass']} onChange={(value) => setValue('mail.smtp.pass', value)} />
                  <Field label="Absender-Adresse" type="email" value={settings['mail.smtp.from']} onChange={(value) => setValue('mail.smtp.from', value)} placeholder="noreply@example.com" />
                  <label className="text-sm font-medium text-gray-700">Verschlüsselung
                    <select className="field mt-1" value={settings['mail.smtp.secure'] || 'false'} onChange={(event) => setValue('mail.smtp.secure', event.target.value)}>
                      <option value="false">STARTTLS (Port 587)</option>
                      <option value="true">SSL/TLS (Port 465)</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="border-b border-black/5 p-5">
                <div className="mb-3 font-semibold text-gray-800">IMAP (Eingehend)</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="IMAP-Host" value={settings['mail.imap.host']} onChange={(value) => setValue('mail.imap.host', value)} placeholder="imap.example.com" />
                  <Field label="IMAP-Port" type="number" value={settings['mail.imap.port']} onChange={(value) => setValue('mail.imap.port', value)} placeholder="993" />
                  <Field label="IMAP-Benutzer" value={settings['mail.imap.user']} onChange={(value) => setValue('mail.imap.user', value)} />
                  <Field label="IMAP-Passwort" type="password" value={settings['mail.imap.pass']} onChange={(value) => setValue('mail.imap.pass', value)} />
                </div>
              </div>
              <div className="p-5">
                <div className="mb-3 font-semibold text-gray-800">DKIM (E-Mail-Signatur)</div>
                <p className="mb-3 text-sm text-gray-500">DKIM-Signatur verbessert die Zustellbarkeit und verhindert Spam-Einstufung. Ergänze auch SPF- und DMARC-Einträge in deiner DNS-Zone.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="DKIM-Domain" value={settings['mail.dkim.domain']} onChange={(value) => setValue('mail.dkim.domain', value)} placeholder="example.com" />
                  <Field label="DKIM-Selector" value={settings['mail.dkim.selector']} onChange={(value) => setValue('mail.dkim.selector', value)} placeholder="default" />
                  <label className="text-sm font-medium text-gray-700 md:col-span-2">DKIM-Private-Key
                    <textarea className="field mt-1 min-h-24 font-mono text-xs" placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..." value={settings['mail.dkim.privateKey'] || ''} onChange={(event) => setValue('mail.dkim.privateKey', event.target.value)} />
                  </label>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'sso' && (
            <section className="card overflow-hidden">
              <Header title="SSO" text="OpenID Connect, Keycloak, Authentik oder Microsoft Login konfigurieren." />
              <div className="grid gap-3 p-5 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm font-medium text-gray-700 md:col-span-2">
                  <input type="checkbox" checked={settings['sso.enabled'] === 'true'} onChange={(event) => setValue('sso.enabled', String(event.target.checked))} />
                  SSO auf dem Login-Screen anzeigen
                </label>
                <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm font-medium text-gray-700 md:col-span-2">
                  <input type="checkbox" checked={settings['sso.force'] === 'true'} onChange={(event) => setValue('sso.force', String(event.target.checked))} />
                  Benutzer direkt zum SSO-Provider weiterleiten (Login-Seite überspringen)
                </label>
                <label className="text-sm font-medium text-gray-700">Provider
                  <select className="field mt-1" value={settings['sso.provider']} onChange={(event) => setValue('sso.provider', event.target.value)}>
                    <option value="oidc">Generisches OpenID Connect</option>
                    <option value="keycloak">Keycloak</option>
                    <option value="authentik">Authentik</option>
                    <option value="microsoft">Microsoft Entra ID</option>
                  </select>
                </label>
                <Field label="Button-Text" value={settings['sso.buttonLabel']} onChange={(value) => setValue('sso.buttonLabel', value)} />
                <Field label="Issuer-URL" value={settings['sso.issuerUrl']} onChange={(value) => setValue('sso.issuerUrl', value)} placeholder="https://id.example.de/realms/mz" />
                <Field label="Redirect-URI" value={settings['sso.redirectUri']} onChange={(value) => setValue('sso.redirectUri', value)} />
                <Field label="Client-ID" value={settings['sso.clientId']} onChange={(value) => setValue('sso.clientId', value)} />
                <Field label="Client-Secret" type="password" value={settings['sso.clientSecret']} onChange={(value) => setValue('sso.clientSecret', value)} />
              </div>
              <div className="grid gap-4 border-t border-black/5 p-5 text-sm text-gray-600 lg:grid-cols-3">
                <Guide title="1. Client erstellen" text="Im Identity Provider einen OIDC-Client für MZ-Inventory anlegen. Authorization Code Flow aktivieren." />
                <Guide title="2. Redirect eintragen" text={`Diese Redirect-URI beim Provider hinterlegen: ${settings['sso.redirectUri'] || defaults['sso.redirectUri']}`} />
                <Guide title="3. Gruppen liefern" text={`Gruppen per Claim "${settings['sso.groupClaim']}" oder über die Admin-API in Rechte & Gruppen importieren.`} />
              </div>
            </section>
          )}

          {activeSection === 'system' && (
            <section className="card overflow-hidden">
              <Header title="Systemübersicht" text="Server- und Datenbank-Informationen des Hostsystems." />
              <div className="p-5">
                {!systemInfo && !systemLoading && (
                  <button type="button" className="btn-primary" onClick={async () => {
                    setSystemLoading(true);
                    try {
                      const { data } = await api.get('/system/overview');
                      setSystemInfo(data);
                    } catch {
                      setError('Systemdaten konnten nicht geladen werden.');
                    } finally {
                      setSystemLoading(false);
                    }
                  }}><Monitor size={17} />Systemdaten laden</button>
                )}
                {systemLoading && <div className="text-sm text-gray-500">Lade Systemdaten...</div>}
                {systemInfo && (
                  <div className="grid gap-6">
                    <SysCard title="Betriebssystem" items={[
                      ['Hostname', systemInfo.os.hostname],
                      ['Distribution', systemInfo.os.distro],
                      ['Kernel', systemInfo.os.release],
                      ['Architektur', systemInfo.os.arch],
                      ['Betriebszeit', formatUptime(systemInfo.os.uptime)]
                    ]} />
                    <SysCard title="Prozessor" items={[
                      ['Modell', systemInfo.cpu.model],
                      ['Kerne', String(systemInfo.cpu.cores)],
                      ['Auslastung (1m)', String(systemInfo.cpu.loadAvg?.[0]?.toFixed(2) || 'N/A')]
                    ]} />
                    <SysCard title="Arbeitsspeicher" items={[
                      ['Gesamt', formatBytes(systemInfo.memory.total)],
                      ['Belegt', formatBytes(systemInfo.memory.used)],
                      ['Frei', formatBytes(systemInfo.memory.free)]
                    ]} />
                    {systemInfo.disk && (
                      <SysCard title="Festplatte (/)"
                        items={[
                          ['Gesamt', formatBytes(systemInfo.disk.total)],
                          ['Belegt', formatBytes(systemInfo.disk.used)],
                          ['Frei', formatBytes(systemInfo.disk.free)]
                        ]}
                        bar={{ used: systemInfo.disk.used, total: systemInfo.disk.total }}
                      />
                    )}
                    <SysCard title="Datenbank" items={[
                      ['Typ', systemInfo.database.type],
                      ['Version', systemInfo.database.version || 'N/A'],
                      ['Größe', systemInfo.database.size ? formatBytes(systemInfo.database.size) : 'N/A']
                    ]} />
                    <SysCard title="Installierte Pakete" items={[
                      ['Node.js', systemInfo.packages.node || 'N/A'],
                      ['npm', systemInfo.packages.npm || 'N/A'],
                      ['MySQL', systemInfo.packages.mysql || 'N/A'],
                      ['Prisma', systemInfo.packages.prisma || 'N/A']
                    ]} />
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === 'roles' && (
            <section className="card overflow-hidden">
              <Header title="Rechte & Gruppen" text="SSO-Gruppen aus Claims oder Admin-APIs laden und auf lokale Rollen/Rechte mappen." />
              <div className="grid gap-3 p-5 md:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">Gruppenquelle
                  <select className="field mt-1" value={settings['sso.groupSource']} onChange={(event) => setValue('sso.groupSource', event.target.value)}>
                    <option value="claim">OIDC Claim</option>
                    <option value="adminApi">Admin-API</option>
                  </select>
                </label>
                <Field label="Gruppen-Claim" value={settings['sso.groupClaim']} onChange={(value) => setValue('sso.groupClaim', value)} placeholder="groups" />
                <Field label="Admin-API Gruppen-URL" value={settings['sso.adminApiUrl']} onChange={(value) => setValue('sso.adminApiUrl', value)} placeholder="https://id.example.de/api/v3/core/groups/" />
                <Field label="Admin-API Token" type="password" value={settings['sso.adminApiToken']} onChange={(value) => setValue('sso.adminApiToken', value)} />
                <div className="flex items-center gap-3 md:col-span-2">
                  <button type="button" className="btn-secondary" onClick={syncGroups} disabled={syncing}><UsersRound size={17} />{syncing ? 'Lade Gruppen...' : 'Gruppen aus SSO laden'}</button>
                  <span className="text-sm text-gray-500">{availableGroups.length} Gruppen gespeichert</span>
                </div>
              </div>

              <div className="border-t border-black/5 p-5">
                <GroupMappings groups={availableGroups} mappings={groupMappings} onChange={setMappings} />
              </div>
            </section>
          )}

          <div className="flex items-center justify-between gap-3">
            <button type="button" className="btn-secondary" onClick={() => navigate('/admin/settings')}>Zur Start-Rubrik</button>
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm text-green-700">Gespeichert.</span>}
              <button className="btn-primary"><Save size={17} />Einstellungen speichern</button>
            </div>
          </div>
        </form>
      </div>
    </AdminPage>
  );
}

function GroupMappings({ groups, mappings, onChange }) {
  function update(index, patch) {
    onChange(mappings.map((entry, currentIndex) => currentIndex === index ? { ...entry, ...patch } : entry));
  }

  function togglePermission(index, permission) {
    const current = mappings[index]?.permissions || [];
    const next = current.includes(permission) ? current.filter((entry) => entry !== permission) : [...current, permission];
    update(index, { permissions: next });
  }

  function addMapping() {
    onChange([...mappings, { group: groups[0] || '', role: 'VIEWER', permissions: ['ISSUE_REPORT'] }]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-semibold text-gray-800">Gruppenmapping</div>
          <p className="mt-1 text-sm text-gray-500">Beispiel: SSO-Gruppe "Benutzer" bekommt nur "Fehler melden"; Admin-Gruppen bekommen lokale Rollen.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={addMapping}>Mapping hinzufügen</button>
      </div>

      <div className="grid gap-3">
        {mappings.map((mapping, index) => (
          <div key={`${mapping.group}-${index}`} className="grid gap-3 rounded-xl bg-[#fafafa] p-4 lg:grid-cols-[1fr_180px_1.4fr_88px]">
            <label className="text-sm font-medium text-gray-700">SSO-Gruppe
              <input className="field mt-1" list="sso-groups" value={mapping.group || ''} onChange={(event) => update(index, { group: event.target.value })} />
            </label>
            <label className="text-sm font-medium text-gray-700">Lokale Rolle
              <select className="field mt-1" value={mapping.role || 'VIEWER'} onChange={(event) => update(index, { role: event.target.value })}>
                {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="text-sm font-medium text-gray-700">Zusatzrechte
              <div className="mt-1 flex flex-wrap gap-2">
                {permissions.map(([value, label]) => (
                  <button key={value} type="button" className={(mapping.permissions || []).includes(value) ? 'btn-primary' : 'btn-secondary'} onClick={() => togglePermission(index, value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="self-end rounded-xl px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50" onClick={() => onChange(mappings.filter((_, currentIndex) => currentIndex !== index))}>Entfernen</button>
          </div>
        ))}
        {!mappings.length && <div className="rounded-xl bg-[#fafafa] p-5 text-sm text-gray-500">Noch keine SSO-Gruppen gemappt.</div>}
      </div>

      <datalist id="sso-groups">
        {groups.map((group) => <option key={group} value={group} />)}
      </datalist>
    </div>
  );
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function Header({ title, text }) {
  return <div className="border-b border-black/5 p-5"><div className="font-semibold text-gray-800">{title}</div><div className="mt-1 text-sm text-gray-500">{text}</div></div>;
}

function Field({ label, value, onChange, type = 'text', placeholder = '', min, max }) {
  return <label className="text-sm font-medium text-gray-700">{label}<input className="field mt-1" type={type} min={min} max={max} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Guide({ title, text }) {
  return <div className="rounded-xl bg-[#fafafa] p-4"><div className="mb-2 flex items-center gap-2 font-semibold text-gray-800"><ExternalLink size={15} />{title}</div><p>{text}</p></div>;
}

function SysCard({ title, items, bar }) {
  return (
    <div className="rounded-xl border border-black/5 bg-[#fafafa] p-4">
      <div className="mb-3 text-sm font-semibold text-gray-800">{title}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="text-sm">
            <span className="text-gray-500">{label}: </span>
            <span className="font-medium text-gray-800">{value}</span>
          </div>
        ))}
      </div>
      {bar && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min((bar.used / bar.total) * 100, 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}
