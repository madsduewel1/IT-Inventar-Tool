import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import i18n from 'i18next';
import { ArrowLeftRight, Bell, Cpu, Gauge, KeyRound, LogOut, Menu, QrCode, Save, Search, UserRound, X } from 'lucide-react';
import Sidebar from './Sidebar';
import Modal from './Modal';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

const titles = {
  '/dashboard': 'Dashboard',
  '/devices': 'Geräte',
  '/rooms': 'Räume',
  '/loans': 'Ausleihe',
  '/loans/my': 'Meine Ausleihen',
  '/issues': 'Fehler melden',
  '/scanner': 'QR-Scanner',
  '/admin/users': 'Benutzer',
  '/admin/roles': 'Rollen',
  '/admin/api-keys': 'API-Keys',
  '/admin/monitoring': 'Monitoring',
  '/admin/settings': 'Einstellungen',
  '/admin/settings/sso': 'SSO',
  '/admin/settings/roles': 'Rechte & Gruppen',
  '/admin/settings/system': 'Systemübersicht',
  '/admin/sso': 'SSO',
  '/admin/logs': 'Logs'
};

export default function Layout() {
  const { user, logout, updatePreferences } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(localStorage.getItem('sidebarCollapsed') === 'true');
  const [searchOpen, setSearchOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [language, setLanguage] = useState(localStorage.getItem('locale') || user?.preferences?.locale || 'de');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [accountMessage, setAccountMessage] = useState('');
  const title = useMemo(() => titles[location.pathname] || (location.pathname.startsWith('/devices/') ? 'Gerätedetail' : 'Dashboard'), [location.pathname]);

  useEffect(() => {
    document.body.classList.add('theme-dark');
    document.documentElement.classList.add('theme-dark');
    localStorage.setItem('theme', 'dark');
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('locale', language);
    i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => {
    if (user?.preferences?.locale && user.preferences.locale !== language) {
      setLanguage(user.preferences.locale);
    }
  }, [user?.id, user?.preferences?.locale]);

  useEffect(() => {
    loadNotifications();
  }, [user?.effectiveRole, user?.role, location.pathname]);

  async function loadNotifications() {
    try {
      const [devicesResult, loansResult] = await Promise.allSettled([api.get('/devices'), api.get('/loans')]);
      const next = [];

      if (loansResult.status === 'fulfilled') {
        const overdue = (loansResult.value.data.loans || []).filter((loan) => loan.status === 'OVERDUE');
        if (overdue.length) {
          next.push({ tone: 'red', title: 'Überfällige Ausleihen', text: `${overdue.length} Vorgänge sind über dem Rückgabedatum.`, to: '/loans' });
        }
      }

      if (devicesResult.status === 'fulfilled') {
        const defect = (devicesResult.value.data.devices || []).filter((device) => device.status === 'DEFECT');
        if (defect.length) {
          next.push({ tone: 'orange', title: 'Defekte Assets', text: `${defect.length} Assets sind als defekt markiert.`, to: '/devices' });
        }
      }

      if ((user?.effectiveRole || user?.role) === 'ADMIN') {
        const monitoringResult = await api.get('/monitoring').catch(() => null);
        const offline = (monitoringResult?.data.monitoring || []).filter((row) => !row.online);
        if (offline.length) {
          next.push({ tone: 'green', title: 'Monitoring', text: `${offline.length} Agenten melden offline.`, to: '/admin/monitoring' });
        }
      }

      if (['STAFF', 'ADMIN'].includes(user?.effectiveRole || user?.role) && loansResult.status === 'fulfilled') {
        const requested = (loansResult.value.data.loans || []).filter((loan) => loan.status === 'REQUESTED');
        if (requested.length) {
          next.push({ tone: 'orange', title: 'Ausleihe-Anfragen', text: `${requested.length} offene Anfragen warten auf Entscheidung.`, to: '/loans' });
        }
      }

      if (!['STAFF', 'ADMIN'].includes(user?.effectiveRole || user?.role) && loansResult.status === 'fulfilled') {
        const discussion = (loansResult.value.data.loans || []).filter((loan) => loan.status === 'DISCUSSION_REQUESTED');
        if (discussion.length) {
          next.push({ tone: 'orange', title: 'Gespraech erbeten', text: 'Die IT hat eine Rueckfrage zu deiner Ausleihe.', to: '/loans/my' });
        }
      }

      setNotifications(next);
    } catch {
      setNotifications([]);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    setSearchOpen(false);
    navigate(query.trim() ? `/devices?search=${encodeURIComponent(query.trim())}` : '/devices');
  }

  async function saveAccountSettings(event) {
    event.preventDefault();
    setAccountMessage('');

    if (passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword) {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setAccountMessage('Die neuen Passwörter stimmen nicht überein.');
        return;
      }
      if (passwordForm.newPassword.length < 8) {
        setAccountMessage('Das neue Passwort muss mindestens 8 Zeichen haben.');
        return;
      }
      try {
        await api.post('/auth/change-password', {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } catch {
        setAccountMessage('Passwort konnte nicht geändert werden. Prüfe das aktuelle Passwort.');
        return;
      }
    }

    try {
      await updatePreferences({ theme: 'dark', locale: language });
      setAccountMessage('Einstellungen gespeichert.');
    } catch {
      setAccountMessage('Anzeigeeinstellungen konnten nicht gespeichert werden.');
    }
  }

  return (
    <div className="flex h-screen h-dvh overflow-hidden bg-[#0a0f14]">
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((value) => !value)} />

      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <div className="relative h-full w-72" onClick={(event) => event.stopPropagation()}>
            <button className="absolute right-4 top-5 z-50 text-white" onClick={() => setOpen(false)} title="Schließen">
              <X size={22} />
            </button>
            <Sidebar mobile onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="top-bar-shell relative flex min-h-16 shrink-0 items-center justify-between border-b border-white/10 px-3 py-2 text-white md:h-16 md:px-6 md:py-0 shadow-sm">
          <div className="flex items-center gap-4">
            <button className="flex h-11 w-11 items-center justify-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white md:hidden transition" onClick={() => setOpen(true)} title="Menü öffnen">
              <Menu size={24} />
            </button>
            <div className="min-w-0">
              <div className="hidden text-sm text-white/70 sm:block">Startseite / {title}</div>
              <div className="truncate font-semibold text-white">{title}</div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 transition" title="Suche" onClick={() => { setSearchOpen((value) => !value); setAlertsOpen(false); setAccountOpen(false); }}>
              <Search size={19} className="text-white" />
            </button>
            <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 transition" title="Benachrichtigungen" onClick={() => { setAlertsOpen((value) => !value); setSearchOpen(false); setAccountOpen(false); }}>
              <Bell size={19} className="text-white" />
              {notifications.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-400" />}
            </button>
            <button className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/20 transition" onClick={() => { setAccountOpen((value) => !value); setSearchOpen(false); setAlertsOpen(false); }}>
              <UserRound size={17} className="mr-0 sm:mr-2" />
              <span className="hidden sm:inline">{user?.username || 'Profil'}</span>
            </button>
          </div>

          {searchOpen && (
            <form onSubmit={submitSearch} className="absolute right-4 top-14 z-30 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-black/5 bg-white p-3 shadow-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                <input className="field pl-9" autoFocus placeholder="Inventarnummer, Modell oder Hersteller suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setSearchOpen(false)}>Abbrechen</button>
                <button className="btn-primary">Suchen</button>
              </div>
            </form>
          )}

          {alertsOpen && (
            <div className="absolute right-4 top-14 z-30 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-black/5 bg-white p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold text-gray-800">Benachrichtigungen</div>
                {notifications.length > 0 && <span className="badge bg-red-100 text-red-700">{notifications.length} offen</span>}
              </div>
              {notifications.length ? notifications.map((notification) => <Alert key={notification.title} {...notification} />) : (
                <div className="rounded-2xl bg-[#fafafa] p-4 text-sm text-gray-500">Keine aktuellen Benachrichtigungen.</div>
              )}
            </div>
          )}

          {accountOpen && (
            <div className="absolute right-4 top-14 z-30 w-64 rounded-2xl border border-black/5 bg-white p-2 shadow-xl">
              <div className="border-b border-black/5 p-3">
                <div className="font-semibold text-gray-800">{user?.username}</div>
                <div className="text-sm text-gray-500">{user?.effectiveRole || user?.role}</div>
              </div>
              <Link className="block rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-[#fafafa]" to="/loans/my" onClick={() => setAccountOpen(false)}>Meine Ausleihen</Link>
              <button className="block w-full rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-[#fafafa]" onClick={() => { setAccountOpen(false); setAccountSettingsOpen(true); }}>Account-Einstellungen</button>
              {(user?.effectiveRole || user?.role) === 'ADMIN' && <Link className="block rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-[#fafafa]" to="/admin/settings" onClick={() => setAccountOpen(false)}>Systemeinstellungen</Link>}
              <button className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={logout}>
                <LogOut size={16} className="mr-2" />
                Abmelden
              </button>
            </div>
          )}
        </header>

        <div className="app-scroll-shell flex-1 overflow-y-auto p-3 pb-24 sm:p-4 md:p-6 md:pb-6">
          <div className="page-enter mx-auto max-w-7xl" key={location.pathname}>
            <Outlet />
          </div>
        </div>
      </main>

      <BottomNav role={user?.effectiveRole || user?.role} permissions={user?.permissions || []} pathname={location.pathname} />

      <Modal open={accountSettingsOpen} title="Account-Einstellungen" subtitle="Persönliche Anzeige, Sprache und Passwort" onClose={() => setAccountSettingsOpen(false)}>
        <form onSubmit={saveAccountSettings} className="space-y-6">
          <section className="grid gap-3">
            <label className="text-sm font-medium text-gray-700">Sprache
              <select className="field mt-2" value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </label>
          </section>

          <section className="rounded-2xl bg-[#fafafa] p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-gray-800"><KeyRound size={17} />Passwort ändern</div>
            <div className="grid gap-3">
              <input className="field" type="password" placeholder="Aktuelles Passwort" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} />
              <input className="field" type="password" placeholder="Neues Passwort" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} />
              <input className="field" type="password" placeholder="Neues Passwort bestätigen" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} />
            </div>
          </section>

          <div className="flex items-center justify-end gap-3">
            {accountMessage && <span className="text-sm text-gray-600">{accountMessage}</span>}
            <button className="btn-primary"><Save size={17} />Speichern</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Alert({ title, text, tone, to }) {
  const tones = {
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    green: 'bg-green-50 text-green-700'
  };
  return (
    <Link to={to} className="mb-2 block rounded-2xl bg-[#fafafa] p-3 last:mb-0">
      <div className={`mb-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{title}</div>
      <div className="text-sm text-gray-600">{text}</div>
    </Link>
  );
}

function BottomNav({ role, permissions = [], pathname }) {
  const items = [
    { to: '/dashboard', label: 'Start', icon: Gauge, roles: ['VIEWER', 'STAFF', 'ADMIN'] },
    { to: '/devices', label: 'Geräte', icon: Cpu, roles: ['VIEWER', 'STAFF', 'ADMIN'] },
    { to: role === 'VIEWER' ? '/loans/my' : '/loans', label: 'Ausleihe', icon: ArrowLeftRight, roles: ['VIEWER', 'STAFF', 'ADMIN'] },
    { to: '/scanner', label: 'QR-Code', icon: QrCode, roles: ['VIEWER', 'STAFF', 'ADMIN'] }
  ].filter((item) => item.roles.includes(role) || item.permissions?.some((permission) => permissions.includes(permission)));

  return (
    <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 px-3 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`) || (item.to.startsWith('/loans') && pathname.startsWith('/loans'));
          return (
            <Link key={item.to} to={item.to} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold ${active ? 'active bg-gray-800 text-gray-100' : 'text-gray-500'}`}>
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
