import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import i18n from 'i18next';
import { ArrowLeftRight, Bell, Cpu, Gauge, KeyRound, LogOut, Menu, MessageSquareWarning, Save, X, HelpCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Sidebar from './Sidebar';
import Modal from './Modal';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

// Die App nutzt ausschließlich das dunkle Farbschema. Ein gespeicherter
// Light-Mode-Wert aus älteren Versionen wird bewusst ignoriert, damit keine
// Reste des hellen Layouts mehr auftauchen.
const APP_THEME = 'dark';

const titles = {
  '/dashboard': 'Dashboard',
  '/my-device': 'Mein Gerät',
  '/help': 'Hilfe',
  '/devices': 'Geräte',
  '/devices/edit': 'Gerät bearbeiten',
  '/devices/import': 'CSV-Import',
  '/devices/new': 'Gerät anlegen',
  '/rooms': 'Räume',
  '/rooms/edit': 'Raum bearbeiten',
  '/rooms/new': 'Raum anlegen',
  '/loans': 'Ausleihe',
  '/loans/detail': 'Ausleihdetail',
  '/loans/my': 'Meine Ausleihen',
  '/loans/new': 'Ausleihe anlegen',
  '/loans/request': 'Ausleihe beantragen',
  '/issues': 'Fehler melden',
  '/issues/new': 'Fehler melden',
  '/issues/capture': 'Ticket aufnehmen',
  '/updates': 'Geräte-Updates',
  '/updates/new': 'Update durchführen',
  '/admin/areas': 'Gerätebereiche',
  '/admin/ticket-responsibilities': 'Ticket-Zuständigkeiten',
  '/admin/ticket-templates': 'Ticket-Vorlagen',
  '/admin/ticket-priorities': 'Ticket-Prioritäten',
  '/admin/ticket-notifications': 'Ticket-Benachrichtigungen',
  '/admin/users': 'Benutzer',
  '/admin/roles': 'Rechte',
  '/admin/roles/edit': 'Rechte bearbeiten',
  '/admin/api-keys': 'API-Keys',
  '/admin/settings': 'Einstellungen',
  '/admin/dashboard': 'Administration',
  '/admin/settings/sso': 'SSO',
  '/admin/settings/roles': 'Rechte & Gruppen',
  '/admin/settings/system': 'Systemübersicht',
  '/admin/settings/support': 'Support',
  '/admin/sso': 'SSO',
  '/admin/logs': 'Logs',
  '/email-support': 'E-Mail-Support',
  '/email-support/new': 'Ticket per E-Mail beantworten',
  '/email-support/convert': 'E-Mail in Ticket umwandeln'
};

export default function Layout() {
  const { user, loading, logout, updatePreferences } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sidebarClosed, setSidebarClosed] = useState(() => localStorage.getItem('sidebarClosed') === 'true');
  const autoCollapsedRef = useRef(false);
  const [publicSettings, setPublicSettings] = useState({});
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [language, setLanguage] = useState(localStorage.getItem('locale') || user?.preferences?.locale || 'de');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [accountMessage, setAccountMessage] = useState('');
  const [counts, setCounts] = useState({ loans: 0, issues: 0, inboxMails: 0, myDevices: 0 });

  useEffect(() => {
    api.get('/settings/public').then(({ data }) => {
      const s = data.settings || {};
      setPublicSettings(s);
      const favicon = s['org.favicon'];
      if (favicon) {
        const link = document.querySelector("link[rel~='icon']");
        if (link) link.href = favicon;
        else {
          const newLink = document.createElement('link');
          newLink.rel = 'icon';
          newLink.href = favicon;
          document.head.appendChild(newLink);
        }
      }
    }).catch(() => {});
  }, []);

  const title = useMemo(() => {
    if (titles[location.pathname]) return titles[location.pathname];
    if (location.pathname === '/devices' && new URLSearchParams(location.search).has('id')) return 'Gerätedetail';
    if (location.pathname === '/issues' && new URLSearchParams(location.search).has('id')) return 'Ticket';
    if (location.pathname === '/loans/detail' && new URLSearchParams(location.search).has('id')) return 'Ausleihdetail';
    if (location.pathname === '/updates' && new URLSearchParams(location.search).has('id')) return 'Geräte-Update';
    if (location.pathname.startsWith('/devices/')) return 'Gerätedetail';
    return 'Dashboard';
  }, [location.pathname, location.search]);

  useEffect(() => {
    const orgName = publicSettings['org.name'] || 'MZ-Inventory';
    document.title = `${orgName} - ${title}`;
  }, [publicSettings, title]);

  const initials = useMemo(() => {
    const name = user?.displayName || user?.username;
    if (!name) return 'AK';
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [user?.displayName, user?.username]);

  // Dark Mode ist fest eingestellt: Theme-Klassen werden bei jedem Rendern
  // gesetzt und ein eventuell gespeicherter Light-Mode wird überschrieben.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove('theme-light', 'light');
    body.classList.remove('theme-light', 'light');
    root.classList.add(`theme-${APP_THEME}`, APP_THEME);
    body.classList.add(`theme-${APP_THEME}`, APP_THEME);
    localStorage.setItem('theme', APP_THEME);
    if (user?.preferences?.theme && user.preferences.theme !== APP_THEME) {
      updatePreferences({ theme: APP_THEME }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem('sidebarClosed', String(sidebarClosed));
  }, [sidebarClosed]);

  useEffect(() => {
    localStorage.setItem('locale', language);
    i18n.changeLanguage(language);
  }, [language]);

  const SYNC_SIDEBAR_W = 270;
  const SYNC_MIN_CONTENT = 1024;
  function syncSidebarWidth() {
    if (window.innerWidth < 768) return;
    const fits = window.innerWidth - SYNC_SIDEBAR_W >= SYNC_MIN_CONTENT;
    if (!fits) {
      if (!autoCollapsedRef.current) {
        autoCollapsedRef.current = true;
        setSidebarClosed(true);
      }
    } else if (fits && autoCollapsedRef.current) {
      autoCollapsedRef.current = false;
      setSidebarClosed(false);
    }
  }

  useEffect(() => {
    syncSidebarWidth();
    window.addEventListener('resize', syncSidebarWidth);
    return () => window.removeEventListener('resize', syncSidebarWidth);
  }, []);

  function toggleSidebar() {
    const next = !sidebarClosed;
    if (next && window.innerWidth >= 768 && window.innerWidth - SYNC_SIDEBAR_W < SYNC_MIN_CONTENT) {
      autoCollapsedRef.current = true;
      setSidebarClosed(true);
      return;
    }
    autoCollapsedRef.current = false;
    setSidebarClosed(next);
  }

  useEffect(() => {
    if (user?.preferences?.locale && user.preferences.locale !== language) setLanguage(user.preferences.locale);
  }, [user?.id, user?.preferences?.locale]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30 * 1000);
    return () => clearInterval(interval);
  }, [user?.id, user?.effectiveRole, user?.role]);

  async function loadNotifications() {
    try {
      const role = user?.effectiveRole || user?.role;
      const isStaff = ['STAFF', 'ADMIN'].includes(role);
      // Der rote Kreis am Ticket-Board zählt alle offenen Tickets. Dafür werden
      // für IT-Anwender alle Tickets (/issues/all) geladen, nicht nur die selbst
      // gemeldeten.
      // „Mein Gerät" in der Sidebar wird nur bei aktiver Gerätezuweisung
      // angezeigt – deshalb die eigene Zuordnung mitladen.
      const promises = [api.get('/devices'), api.get('/loans'), api.get('/issues'), api.get('/my-devices')];
      if (isStaff) promises.push(api.get('/inbound-mail/count'), api.get('/issues/all'));
      const results = await Promise.allSettled(promises);
      const [devicesResult, loansResult, issuesResult, myDevicesResult, inboxResult, boardResult] = results;
      const next = [];
      const devList = devicesResult.status === 'fulfilled' ? devicesResult.value.data.devices || [] : [];
      const loanList = loansResult.status === 'fulfilled' ? loansResult.value.data.loans || [] : [];
      const boardList = boardResult?.status === 'fulfilled' ? boardResult.value.data.issues || [] : null;
      // Ohne Board-Zugriff (z. B. Betrachter) zählen die selbst gemeldeten Tickets.
      const issueList = boardList || (issuesResult.status === 'fulfilled' ? issuesResult.value.data.issues || [] : []);
      // Rotes Badge: nur Tickets mit Status OPEN (wirklich unberührt).
      const openIssues = issueList.filter((i) => i.status === 'OPEN').length;
      const pendingLoans = loanList.filter((l) => ['REQUESTED', 'DISCUSSION_REQUESTED'].includes(l.status)).length;
      const inboxCount = isStaff && inboxResult?.status === 'fulfilled' ? (inboxResult.value.data.count || 0) : 0;
      const myDevicesCount = myDevicesResult?.status === 'fulfilled' ? (myDevicesResult.value.data.devices || []).length : 0;
      setCounts({ loans: pendingLoans, issues: openIssues, inboxMails: inboxCount, myDevices: myDevicesCount });
      if (loansResult.status === 'fulfilled') {
        const overdue = loanList.filter((l) => l.status === 'OVERDUE');
        if (overdue.length) next.push({ tone: 'red', title: 'Überfällige Ausleihen', text: `${overdue.length} Vorgänge sind über dem Rückgabedatum.`, to: '/loans' });
      }
      if (devicesResult.status === 'fulfilled') {
        const defect = devList.filter((d) => d.status === 'DEFECT');
        if (defect.length) next.push({ tone: 'orange', title: 'Defekte Assets', text: `${defect.length} Assets sind als defekt markiert.`, to: '/devices' });
      }
      if (['STAFF', 'ADMIN'].includes(user?.effectiveRole || user?.role) && loansResult.status === 'fulfilled') {
        const requested = loanList.filter((l) => l.status === 'REQUESTED');
        if (requested.length) next.push({ tone: 'orange', title: 'Ausleihe-Anfragen', text: `${requested.length} offene Anfragen warten auf Entscheidung.`, to: '/loans' });
      }
      if (!['STAFF', 'ADMIN'].includes(user?.effectiveRole || user?.role) && loansResult.status === 'fulfilled') {
        const discussion = loanList.filter((l) => l.status === 'DISCUSSION_REQUESTED');
        if (discussion.length) next.push({ tone: 'orange', title: 'Gespräch erbeten', text: 'Die IT hat eine Rückfrage zu deiner Ausleihe.', to: '/loans/my' });
      }
      setNotifications(next);
    } catch { setNotifications([]); }
  }

  async function saveAccountSettings(event) {
    event.preventDefault();
    setAccountMessage('');
    if (passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword) {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) { setAccountMessage('Die neuen Passwörter stimmen nicht überein.'); return; }
      if (passwordForm.newPassword.length < 8) { setAccountMessage('Das neue Passwort muss mindestens 8 Zeichen haben.'); return; }
      try {
        await api.post('/auth/change-password', { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } catch { setAccountMessage('Passwort konnte nicht geändert werden. Prüfe das aktuelle Passwort.'); return; }
    }
    try { await updatePreferences({ locale: language }); setAccountMessage('Einstellungen gespeichert.'); }
    catch { setAccountMessage('Anzeigeeinstellungen konnten nicht gespeichert werden.'); }
  }

  return (
    <div className="flex overflow-hidden bg-app" style={{ height: 'var(--app-vh, 100dvh)' }}>
      {!sidebarClosed && (
        <Sidebar
          counts={counts}
          publicSettings={publicSettings}
          onLogout={logout}
          accountSettingsOpen={accountSettingsOpen}
          setAccountSettingsOpen={setAccountSettingsOpen}
        />
      )}

      {open && (
        <div className="mobile-overlay fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <div className="mobile-drawer relative h-full min-h-0 w-72" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-4 top-5 z-50 text-main" onClick={() => setOpen(false)} title="Schließen">
              <X size={22} />
            </button>
            <Sidebar mobile onNavigate={() => setOpen(false)} counts={counts} publicSettings={publicSettings} onLogout={logout} accountSettingsOpen={accountSettingsOpen} setAccountSettingsOpen={setAccountSettingsOpen} />
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {publicSettings['embed.hideHeader'] !== 'true' && (
        <header className="top-bar-shell relative flex min-h-[56px] shrink-0 items-center justify-between border-b px-3 py-2 md:h-[56px] md:px-4 md:py-0">
          <RouteProgress pathname={location.pathname + location.search} />
          <div className="flex min-w-0 items-center gap-3">
            <button className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-header-btn-hover md:hidden transition" onClick={() => setOpen(true)} title="Menü">
              <Menu size={20} />
            </button>
            <button
              className="hidden h-11 w-11 items-center justify-center rounded-lg hover:bg-header-btn-hover transition md:flex"
              onClick={toggleSidebar}
              title={sidebarClosed ? 'Sidebar anzeigen' : 'Sidebar ausblenden'}
            >
              {sidebarClosed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <nav className="flex min-w-0 items-center gap-1.5 text-[12px] text-outline">
              <span className="hidden sm:inline shrink-0">Startseite</span>
              <span className="hidden sm:inline shrink-0 text-outline/50">&rsaquo;</span>
              <span className="truncate font-medium text-on-surface">{title}</span>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="relative header-btn" title="Benachrichtigungen" onClick={() => setAlertsOpen((v) => !v)}>
              <Bell size={17} />
              {notifications.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-primary" />}
            </button>
            <button className="header-btn" title="Hilfe zu diesem Modul" onClick={() => navigate('/help', { state: { from: location.pathname + location.search } })}>
              <HelpCircle size={17} />
            </button>
          </div>

          {alertsOpen && (
            <div className="animate-fade-in absolute right-4 top-[52px] z-30 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-outline-variant bg-surface-container p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold text-on-surface text-sm">Benachrichtigungen</div>
                {notifications.length > 0 && <span className="rounded-full bg-badge-red text-text-badge-red px-2 py-0.5 text-[10px] font-bold">{notifications.length} offen</span>}
              </div>
              {notifications.length ? notifications.map((n) => <Alert key={n.title} {...n} />) : (
                <div className="rounded-lg bg-surface-container-low p-4 text-sm text-outline">Keine aktuellen Benachrichtigungen.</div>
              )}
            </div>
          )}
        </header>
        )}

        <div className="app-scroll-shell flex-1 overflow-y-auto p-3 sm:p-4 md:p-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-8">
          <div className="page-enter" key={location.pathname}>
            <Outlet />
          </div>
        </div>
      </main>

      <BottomNav role={user?.effectiveRole || user?.role} permissions={user?.effectivePermissions || []} revoked={user?.revokedPermissions || []} pathname={location.pathname} />

      <Modal open={accountSettingsOpen} title="Account-Einstellungen" subtitle="Sprache und Passwort" onClose={() => setAccountSettingsOpen(false)}>
        <form onSubmit={saveAccountSettings} className="space-y-6">
          <section className="grid gap-3">
            <label className="text-sm font-medium text-on-surface-variant">Sprache
              <select className="field mt-2" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </label>
          </section>
          {!user?.ssoId && (
            <section className="rounded-xl bg-surface-container-low border border-outline-variant p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold text-on-surface"><KeyRound size={17} />Passwort ändern</div>
              <div className="grid gap-3">
                <input className="field" type="password" placeholder="Aktuelles Passwort" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
                <input className="field" type="password" placeholder="Neues Passwort" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
                <input className="field" type="password" placeholder="Neues Passwort bestätigen" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
              </div>
            </section>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {accountMessage && <span className="text-sm text-outline">{accountMessage}</span>}
            <button className="btn-primary w-full sm:w-auto"><Save size={17} />Speichern</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function RouteProgress({ pathname }) {
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    setSpinning(true);
    const t = setTimeout(() => setSpinning(false), 900);
    return () => clearTimeout(t);
  }, [pathname]);
  if (!spinning) return null;
  return <div className="route-progress" aria-hidden="true" />;
}

function Alert({ title, text, tone, to }) {
  const tones = {
    red: 'bg-badge-red text-text-badge-red',
    orange: 'bg-badge-orange text-text-badge-orange',
    green: 'bg-badge-green text-text-badge-green'
  };
  return (
    <Link to={to} className="mb-2 block rounded-lg bg-surface-container-low p-3 last:mb-0 border border-outline-variant">
      <div className={`mb-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{title}</div>
      <div className="text-xs text-on-surface-variant">{text}</div>
    </Link>
  );
}

function BottomNav({ role, permissions = [], revoked = [], pathname }) {
  const items = [
    { to: '/dashboard', label: 'Start', icon: Gauge, roles: ['VIEWER', 'STAFF', 'ADMIN'] },
    { to: '/devices', label: 'Geräte', icon: Cpu, roles: ['VIEWER', 'STAFF', 'ADMIN'], permissions: ['DEVICE_VIEW'] },
    { to: role === 'VIEWER' ? '/loans/my' : '/loans', label: 'Ausleihe', icon: ArrowLeftRight, roles: ['VIEWER', 'STAFF', 'ADMIN'], permissions: ['LOAN_VIEW'] },
    { to: '/issues', label: 'Service', icon: MessageSquareWarning, roles: ['VIEWER', 'STAFF', 'ADMIN'], permissions: ['ISSUE_VIEW'] }
  ].filter((item) => {
    if (!item.permissions?.length) return item.roles.includes(role);
    if (item.permissions.some((p) => revoked.includes(p))) return false;
    return item.roles.includes(role) || item.permissions.some((p) => permissions.includes(p) || permissions.includes('ADMIN'));
  });
  return (
    <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-surface-container-lowest/95 px-3 pt-2 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`) || (item.to.startsWith('/loans') && pathname.startsWith('/loans'));
          return (
            <Link key={item.to} to={item.to} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition ${active ? 'active bg-primary/10 text-primary' : 'text-outline'}`}>
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
