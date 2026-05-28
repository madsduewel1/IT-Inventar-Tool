import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, LogIn } from 'lucide-react';
import { api } from '../../api/client';

const steps = ['Sprache', 'Organisation', 'Datenbank', 'Administrator', 'Authentifizierung', 'Abschluss'];

export default function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [setupDone, setSetupDone] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [data, setData] = useState({
    locale: 'de',
    organization: { name: '', email: '', appUrl: '' },
    database: { provider: 'mysql', url: 'mysql://mzinventory:Password@localhost:3306/mzinventory' },
    admin: { username: '', email: '', password: '' },
    auth: { type: 'local', provider: '', clientId: '', clientSecret: '', issuerUrl: '' }
  });

  useEffect(() => {
    api.get('/setup/status')
      .then(({ data: status }) => {
        if (status.setupDone) setSetupDone(true);
      })
      .catch(() => {
        setError('Setup-Status konnte nicht geladen werden. Prüfe, ob das Backend läuft.');
      });
  }, []);

  useEffect(() => {
    if (!setupDone) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/login', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [setupDone, navigate]);

  async function complete() {
    setError('');
    setSaving(true);
    try {
      await api.post('/setup/complete', data);
      navigate('/login', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Setup konnte nicht abgeschlossen werden.');
    } finally {
      setSaving(false);
    }
  }

  if (setupDone) {
    return (
      <div className="relative min-h-screen bg-gray-50 p-4 md:p-8">
          <div className="mx-auto max-w-md text-center">
          <div className="card p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
              <LogIn className="text-gray-100" size={28} />
            </div>
            <h1 className="mb-2 text-xl font-semibold text-gray-900">Bereits eingerichtet</h1>
            <p className="mb-6 text-sm text-gray-500">MZ-Inventory Lite wurde bereits konfiguriert. Du wirst in {countdown} Sekunden zur Anmeldeseite weitergeleitet.</p>
            <button className="btn-primary" onClick={() => navigate('/login', { replace: true })}>
              <LogIn size={17} />Jetzt anmelden
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Setup-Assistent</h1>
          <p className="text-sm text-gray-500">MZ-Inventory Lite einrichten</p>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {steps.map((label, index) => <div key={label} className={`h-2 rounded-full ${index <= step ? 'bg-gray-500' : 'bg-gray-800'}`} title={label} />)}
        </div>
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-gray-900">{steps[step]}</h2>
          {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
          <div className="mt-5">{renderStep(step, data, setData)}</div>
        </section>
        <div className="flex justify-between">
          <button className="btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={17} />Zurück</button>
          {step < steps.length - 1 ? (
            <button className="btn-primary" onClick={() => setStep(step + 1)}>Weiter<ChevronRight size={17} /></button>
          ) : (
            <button className="btn-primary" disabled={saving} onClick={complete}><Check size={17} />Setup abschließen</button>
          )}
        </div>
      </div>
    </div>
  );
}

function renderStep(step, data, setData) {
  if (step === 0) {
    return <div className="grid gap-3 sm:grid-cols-2">{['de', 'en'].map((locale) => <button key={locale} className={data.locale === locale ? 'btn-primary' : 'btn-secondary'} onClick={() => setData({ ...data, locale })}>{locale === 'de' ? 'Deutsch' : 'English'}</button>)}</div>;
  }
  if (step === 1) {
    return <div className="grid gap-3"><Field label="Organisationsname" value={data.organization.name} onChange={(name) => setData({ ...data, organization: { ...data.organization, name } })} /><Field label="E-Mail" value={data.organization.email} onChange={(email) => setData({ ...data, organization: { ...data.organization, email } })} /><Field label="App-URL" value={data.organization.appUrl} onChange={(appUrl) => setData({ ...data, organization: { ...data.organization, appUrl } })} /></div>;
  }
  if (step === 2) {
    return (
      <div className="grid gap-3">
        <label className="block text-sm font-medium text-gray-700">Datenbank-Typ
          <select className="field mt-1" disabled value={data.database.provider}>
            <option value="mysql">MySQL</option>
          </select>
        </label>
        <Field label="DATABASE_URL" value={data.database.url} onChange={(url) => setData({ ...data, database: { ...data.database, url } })} />
      </div>
    );
  }
  if (step === 3) {
    return <div className="grid gap-3"><Field label="Benutzername" value={data.admin.username} onChange={(username) => setData({ ...data, admin: { ...data.admin, username } })} /><Field label="E-Mail" value={data.admin.email} onChange={(email) => setData({ ...data, admin: { ...data.admin, email } })} /><Field label="Passwort" type="password" value={data.admin.password} onChange={(password) => setData({ ...data, admin: { ...data.admin, password } })} /></div>;
  }
  if (step === 4) {
    return <div className="grid gap-3"><select className="field" value={data.auth.type} onChange={(e) => setData({ ...data, auth: { ...data.auth, type: e.target.value, provider: e.target.value === 'local' ? '' : e.target.value } })}><option value="local">Nur lokale Benutzer</option><option value="oidc">OpenID Connect</option><option value="keycloak">Keycloak</option><option value="authentik">Authentik</option><option value="microsoft">Microsoft Login</option></select>{data.auth.type !== 'local' && <><Field label="Client-ID" value={data.auth.clientId} onChange={(clientId) => setData({ ...data, auth: { ...data.auth, clientId } })} /><Field label="Client-Secret" value={data.auth.clientSecret} onChange={(clientSecret) => setData({ ...data, auth: { ...data.auth, clientSecret } })} /><Field label="Issuer-URL" value={data.auth.issuerUrl} onChange={(issuerUrl) => setData({ ...data, auth: { ...data.auth, issuerUrl } })} /></>}</div>;
  }
  return <div className="space-y-3 text-sm text-gray-700"><p>Der Assistent erstellt die Grundeinstellungen und den ersten Administrator.</p><p>Prisma-Migrationen werden im produktiven Setup über das Installationsskript bzw. <code>npm run prisma:deploy</code> ausgeführt.</p></div>;
}

function Field({ label, value, onChange, type = 'text' }) {
  return <label className="block text-sm font-medium text-gray-700">{label}<input className="field mt-1" type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
