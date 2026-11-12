import { useEffect, useState } from 'react';
import { ExternalLink, Save } from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage } from './Users';

const defaults = {
  'sso.enabled': 'false',
  'sso.provider': 'oidc',
  'sso.clientId': '',
  'sso.clientSecret': '',
  'sso.issuerUrl': '',
  'sso.redirectUri': `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/api/auth/sso/callback`,
  'sso.buttonLabel': 'Mit SSO anmelden'
};

export default function Sso() {
  const [settings, setSettings] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/settings')
      .then(({ data }) => setSettings({ ...defaults, ...(data.settings || {}) }))
      .catch(() => setError('SSO-Einstellungen konnten nicht geladen werden.'));
  }, []);

  function setValue(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    try {
      const { data } = await api.patch('/settings', settings);
      setSettings({ ...defaults, ...(data.settings || {}) });
      setSaved(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'SSO-Einstellungen konnten nicht gespeichert werden.');
    }
  }

  return (
    <AdminPage title="SSO-Konfiguration" subtitle="OpenID Connect, Keycloak, Authentik oder Microsoft vorbereiten">
      <form onSubmit={save} className="space-y-6">
        {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

        <section className="card overflow-hidden">
          <Header title="Verbindung" text="Diese Werte übernimmst du aus deinem Identity Provider." />
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm font-medium text-gray-700 md:col-span-2">
              <input type="checkbox" checked={settings['sso.enabled'] === 'true'} onChange={(event) => setValue('sso.enabled', String(event.target.checked))} />
              SSO auf dem Login-Screen anzeigen
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
        </section>

        <section className="card overflow-hidden">
          <Header title="Anleitung" text="So richtest du den Identity Provider ein." />
          <div className="grid gap-4 p-5 text-sm text-gray-600 lg:grid-cols-3">
            <Guide title="1. Client erstellen" text="Lege im Provider einen OIDC-Client für diese Anwendung an. Verwende Authorization Code Flow und vertraulichen Client, falls ein Secret verfügbar ist." />
            <Guide title="2. Redirect eintragen" text={`Trage exakt diese Redirect-URI ein: ${settings['sso.redirectUri'] || defaults['sso.redirectUri']}`} />
            <Guide title="3. Claims prüfen" text="Benötigt werden mindestens E-Mail und Anzeigename. Rollen können später über Gruppen oder Claims gemappt werden." />
          </div>
          <div className="border-t border-black/5 p-5 text-sm text-gray-600">
            Nach dem Speichern ist die Konfiguration im System hinterlegt. Die eigentliche SSO-Anmeldung ist als Backend-Strategie vorbereitet und kann an diese Werte angebunden werden.
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {saved && <span className="text-sm text-green-700">Gespeichert.</span>}
          <button className="btn-primary w-full sm:w-auto"><Save size={17} />SSO speichern</button>
        </div>
      </form>
    </AdminPage>
  );
}

function Header({ title, text }) {
  return <div className="border-b border-black/5 p-5"><div className="font-semibold text-gray-800">{title}</div><div className="mt-1 text-sm text-gray-500">{text}</div></div>;
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return <label className="text-sm font-medium text-gray-700">{label}<input className="field mt-1" type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Guide({ title, text }) {
  return <div className="rounded-xl bg-[#fafafa] p-4"><div className="mb-2 flex items-center gap-2 font-semibold text-gray-800"><ExternalLink size={15} />{title}</div><p>{text}</p></div>;
}
