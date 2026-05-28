import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, LockKeyhole, LogIn, Mail } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import logo from '../assets/mz-inventory-logo.png';
import mobileLogo from '../assets/mz-inventory-mobile-logo.png';
import Modal from '../components/Modal';
import { Info as InfoIcon } from 'lucide-react';

export default function Login() {
  const { login, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [settings, setSettings] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    api.get('/settings/public').then(({ data }) => {
      setSettings(data.settings || {});
    }).catch(() => setSettings({}));
  }, [authLoading]);

  useEffect(() => {
    document.body.classList.add('theme-dark');
    document.documentElement.classList.add('theme-dark');
    localStorage.setItem('theme', 'dark');
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.username, form.password);
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch {
      setError('Anmeldung fehlgeschlagen. Prüfe Benutzername und Passwort.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh bg-[#0a0f14] lg:grid-cols-[1fr_520px]">
      <section className="login-hero-panel hidden min-h-dvh flex-col justify-center p-10 text-white lg:flex">
        <div className="max-w-xl">
          <h1 className="text-5xl font-bold leading-tight">Alles im Blick, bevor etwas gesucht wird.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/70">Verwalte Assets, Räume, QR-Codes und Rückgaben in einem ruhigen Arbeitsbereich für Schule und Medienzentrum.</p>
        </div>
      </section>

      <main className="mobile-login-shell flex min-h-dvh items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))] md:p-8">
        <form onSubmit={submit} className="mobile-login-card w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <div className="mb-5 flex flex-col items-center gap-4">
              <img className="h-auto w-24 rounded-3xl shadow-md border border-black/5" src={mobileLogo} alt="MZ-Inventory" />
              <div className="rounded-full bg-[#27272a] px-3 py-1 text-xs font-semibold text-[#e5e7eb]">Inventar mobil</div>
            </div>
            <h1 className="text-center text-3xl font-bold leading-tight text-gray-900">Willkommen zurück</h1>
            <p className="mt-2 text-center text-sm leading-6 text-gray-500">{settings['org.name'] || 'MZ-Inventory'} für QR-Scans, Geräte und Ausleihe.</p>
          </div>

          <div className="hidden lg:block">
            <img className="mx-auto mb-5 h-auto w-56" src={logo} alt="MZ-Inventory" />
            <h1 className="text-center text-3xl font-bold text-gray-900">Anmelden</h1>
            <p className="mt-2 text-center text-sm text-gray-500">Willkommen zurück bei {settings['org.name'] || 'MZ-Inventory'}.</p>
          </div>

          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}

          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Benutzername oder E-Mail
              <div className="login-input-wrap group relative mt-1">
                <Mail className="login-field-icon absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                <input className="field min-h-12 pl-10" autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
              </div>
            </label>
            <label className="block text-sm font-medium text-gray-700">Passwort
              <div className="login-input-wrap group relative mt-1">
                <LockKeyhole className="login-field-icon absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                <input className="field min-h-12 pl-10" autoComplete="current-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              </div>
            </label>
          </div>

          <button className="btn-primary w-full min-h-12" type="submit" disabled={submitting}>
            <LogIn size={17} />
            {submitting ? 'Melde an...' : 'Anmelden'}
          </button>

          {settings['sso.enabled'] === 'true' && (() => {
            const basePath = import.meta.env.BASE_URL || '/';
            const fromPath = location.state?.from?.pathname || '';
            const ssoRedirectUrl = `${basePath.endsWith('/') ? basePath.slice(0, -1) : basePath}/api/auth/sso/redirect${fromPath ? `?redirect=${encodeURIComponent(fromPath)}` : ''}`;
            return (
              <a className="btn-secondary w-full min-h-12" href={ssoRedirectUrl}>
                {settings['sso.buttonLabel'] || 'Mit SSO anmelden'}
                <ArrowRight size={17} />
              </a>
            );
          })()}

          <div className="pt-4 border-t border-black/5 text-center space-y-2">
            <div className="text-xs text-gray-400 font-medium">
              Entwickelt von Mads Düwel
            </div>
            <button
              type="button"
              onClick={() => setShowInfo(true)}
              className="text-xs font-semibold text-[#e5e7eb] hover:underline inline-flex items-center gap-1.5 justify-center"
            >
              <InfoIcon size={13} /> System-Infos
            </button>
          </div>
        </form>
      </main>

      <Modal open={showInfo} title="System-Informationen" onClose={() => setShowInfo(false)}>
        <div className="space-y-4">
          {settings['login.infoText'] ? (
            <p className="text-sm leading-6 text-gray-700 whitespace-pre-wrap">
              {settings['login.infoText']}
            </p>
          ) : (
            <div className="text-center p-6 text-gray-400 text-sm">
              Keine zusätzlichen Informationen hinterlegt.
            </div>
          )}
          <div className="flex justify-end pt-4 border-t border-black/5">
            <button type="button" className="btn-secondary" onClick={() => setShowInfo(false)}>
              Schließen
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
