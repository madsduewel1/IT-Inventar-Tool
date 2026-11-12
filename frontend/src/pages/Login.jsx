import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, LockKeyhole, LogIn, Mail, Loader2, Info as InfoIcon } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import logo from '../assets/mz-inventory-logo.png';
import mobileLogo from '../assets/mz-inventory-mobile-logo.png';
import Modal from '../components/Modal';

export default function Login() {
  const { user, login, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [settings, setSettings] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLocal, setShowLocal] = useState(false);

  const isNoSsoFallback = location.pathname === '/login/no-sso-login' || location.pathname === '/login/no-sso-sign-in';
  const forcedSso = settings['sso.enabled'] === 'true' && settings['sso.force'] === 'true';

  useEffect(() => {
    if (authLoading) return;
    api.get('/settings/public').then(({ data }) => {
      const s = data.settings || {};
      setSettings(s);
      const favicon = s['org.favicon'];
      if (favicon) {
        const link = document.querySelector("link[rel~='icon']");
        if (link) link.href = favicon;
        else { const nl = document.createElement('link'); nl.rel = 'icon'; nl.href = favicon; document.head.appendChild(nl); }
      }
    }).catch(() => setSettings({}));
  }, [authLoading]);

  useEffect(() => {
    document.body.classList.add('theme-dark');
    document.documentElement.classList.add('theme-dark');
    localStorage.setItem('theme', 'dark');
  }, []);

  useEffect(() => { document.title = `${settings['org.name'] || 'MZ-Inventory'} - Login`; }, [settings]);

  useEffect(() => {
    if (user && !authLoading) {
      const from = location.state?.from;
      navigate(from ? `${from.pathname}${from.search || ''}` : '/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate, location]);

  useEffect(() => {
    if (authLoading || user || isNoSsoFallback) return;
    if (settings['sso.enabled'] !== 'true' || settings['sso.force'] !== 'true') return;
    handleSsoRedirect();
  }, [authLoading, user, isNoSsoFallback, settings, location]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try { await login(form.username, form.password); }
    catch { setError('Anmeldung fehlgeschlagen. Prüfe Benutzername und Passwort.'); setSubmitting(false); }
  }

  function handleSsoRedirect() {
    const basePath = import.meta.env.BASE_URL || '/';
    const fromState = location.state?.from;
    const fromPath = fromState ? `${fromState.pathname}${fromState.search || ''}` : '';
    window.location.href = `${basePath.endsWith('/') ? basePath.slice(0, -1) : basePath}/api/auth/sso/redirect${fromPath ? `?redirect=${encodeURIComponent(fromPath)}` : ''}`;
  }

  return (
    <div className="relative grid min-h-dvh bg-background lg:grid-cols-[1fr_520px]">
      <section className="login-hero-panel hidden min-h-dvh flex-col justify-center p-10 text-white lg:flex">
        <div className="max-w-xl">
          <h1 className="text-5xl font-bold leading-tight">Alles im Blick, bevor etwas gesucht wird.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/70">Verwalte Assets, Räume, Etiketten und Rückgaben in einem ruhigen Arbeitsbereich für Schule und Medienzentrum.</p>
        </div>
      </section>

      <main className="mobile-login-shell flex min-h-dvh items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))] md:p-8">
        <form onSubmit={submit} className="mobile-login-card w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <div className="mb-5 flex flex-col items-center gap-4">
              <img className="h-auto w-24 max-h-16 border border-outline-variant object-contain" src={settings['org.logo'] || mobileLogo} alt="MZ-Inventory" />
              <div className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-on-surface">Inventar mobil</div>
            </div>
            <h1 className="text-center text-3xl font-bold leading-tight text-on-surface">Willkommen zurück</h1>
            <p className="mt-2 text-center text-sm leading-6 text-on-surface-variant">{settings['org.name'] || 'MZ-Inventory'} für Geräte, Etiketten und Ausleihe.</p>
          </div>
          <div className="hidden lg:block">
            <img className="mx-auto mb-5 h-auto max-h-20 max-w-[240px] object-contain" src={settings['org.logo'] || logo} alt="MZ-Inventory" />
            <h1 className="text-center text-3xl font-bold text-on-surface">Anmelden</h1>
            <p className="mt-2 text-center text-sm text-on-surface-variant">Willkommen zurück bei {settings['org.name'] || 'MZ-Inventory'}.</p>
          </div>

          {error && <div className="rounded-xl bg-badge-red px-3 py-2 text-sm font-medium text-text-badge-red">{error}</div>}

          {forcedSso && !isNoSsoFallback ? (
            <div className="space-y-4 text-center">
              <Loader2 className="mx-auto animate-spin text-on-surface-variant" size={28} />
              <p className="text-sm text-on-surface-variant">Wird zum SSO-Provider weitergeleitet...</p>
              <Link to="/login/no-sso-login" className="block text-xs font-semibold text-outline hover:text-on-surface underline">SSO nicht erreichbar? Lokale Anmeldung</Link>
            </div>
          ) : settings['sso.enabled'] === 'true' && settings['sso.promoteSso'] === 'true' && !showLocal && !isNoSsoFallback ? (
            <div className="space-y-4">
              <button type="button" className="btn-primary w-full min-h-12 flex justify-center gap-2" onClick={handleSsoRedirect}>
                {settings['sso.buttonLabel'] || 'Mit SSO anmelden'} <ArrowRight size={17} />
              </button>
              <div className="text-center pt-2">
                <button type="button" onClick={() => setShowLocal(true)} className="text-xs text-on-surface-variant hover:text-on-surface font-semibold underline">
                  Lokale Anmeldung (Einfache Anmeldung) →
                </button>
              </div>
            </div>
          ) : (
            <>
              {isNoSsoFallback && (
                <div className="rounded-xl bg-badge-yellow px-3 py-2 text-sm font-medium text-text-badge-yellow">
                  Notzugang: Lokale Anmeldung. Dieser Zugang bleibt auch bei erzwungenem SSO verfügbar.
                </div>
              )}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-on-surface-variant">Benutzername oder E-Mail
                  <div className="login-input-wrap group relative mt-1">
                    <Mail className="login-field-icon absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={17} />
                    <input className="field min-h-12 pl-10" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                  </div>
                </label>
                <label className="block text-sm font-medium text-on-surface-variant">Passwort
                  <div className="login-input-wrap group relative mt-1">
                    <LockKeyhole className="login-field-icon absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={17} />
                    <input className="field min-h-12 pl-10" autoComplete="current-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </div>
                </label>
              </div>
              <button className="btn-primary w-full min-h-12" type="submit" disabled={submitting}>
                <LogIn size={17} />{submitting ? 'Melde an...' : 'Anmelden'}
              </button>
              {isNoSsoFallback ? (
                <div className="text-center pt-2 border-t border-outline-variant">
                  <Link to="/login" className="text-xs font-semibold text-on-surface-variant hover:text-on-surface underline">Zur SSO-Anmeldung →</Link>
                </div>
              ) : (
                <>
                  {settings['sso.enabled'] === 'true' && settings['sso.promoteSso'] !== 'true' && (
                    <button type="button" className="btn-secondary w-full min-h-12" onClick={handleSsoRedirect}>
                      {settings['sso.buttonLabel'] || 'Mit SSO anmelden'} <ArrowRight size={17} />
                    </button>
                  )}
                  {settings['sso.enabled'] === 'true' && settings['sso.promoteSso'] === 'true' && showLocal && (
                    <div className="text-center pt-2 border-t border-outline-variant">
                      <button type="button" onClick={() => setShowLocal(false)} className="text-xs text-on-surface-variant hover:text-on-surface font-semibold underline">← Zurück zur SSO-Anmeldung</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="pt-4 border-t border-outline-variant text-center space-y-2">
            <div className="text-xs text-outline font-medium">Entwickelt von Mads Düwel</div>
            <button type="button" onClick={() => setShowInfo(true)} className="text-xs font-semibold text-on-surface-variant hover:text-on-surface underline inline-flex items-center gap-1.5 justify-center">
              <InfoIcon size={13} /> System-Infos
            </button>
          </div>
        </form>
      </main>

      <Modal open={showInfo} title="System-Informationen" onClose={() => setShowInfo(false)}>
        <div className="space-y-4">
          {settings['login.infoText'] ? (
            <p className="text-sm leading-6 text-on-surface-variant whitespace-pre-wrap">{settings['login.infoText']}</p>
          ) : (
            <div className="text-center p-6 text-on-surface-variant text-sm">Keine zusätzlichen Informationen hinterlegt.</div>
          )}
          <div className="flex justify-end pt-4 border-t border-outline-variant">
            <button type="button" className="btn-secondary" onClick={() => setShowInfo(false)}>Schließen</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
