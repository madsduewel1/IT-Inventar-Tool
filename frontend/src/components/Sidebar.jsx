import { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  Box,
  ClipboardCheck,
  Cpu,
  DoorOpen,
  FolderTree,
  Laptop,
  LayoutGrid,
  Mail,
  MailOpen,
  MapPin,
  MessageSquareWarning,
  Wrench,
  Home,
  Settings,
  Shield,
  Users,
  ExternalLink,
  Tag,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { LogOut } from 'lucide-react';
import logo from '../assets/mz-inventory-logo.png';

const icons = { Home, Cpu, DoorOpen, ArrowLeftRight, Settings, Shield, Users, Activity, MessageSquareWarning, Wrench, Mail, MailOpen, MapPin, LayoutGrid, Box, Tag, ClipboardCheck, Laptop, FolderTree };

const navGroups = [
  {
    title: 'Übersicht',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'Home', roles: ['VIEWER', 'STAFF', 'ADMIN'] },
      // „Mein Gerät" erscheint nur, wenn dem Benutzer aktuell ein Gerät
      // zugewiesen ist (Counts kommen aus GET /my-devices).
      { path: '/my-device', label: 'Mein Gerät', icon: 'Laptop', roles: ['VIEWER', 'STAFF', 'ADMIN'], showOnlyIfCount: 'myDevices' }
    ]
  },
  {
    title: 'Inventar',
    items: [
      { path: '/devices', label: 'Geräte', icon: 'Cpu', roles: ['VIEWER', 'STAFF', 'ADMIN'], permissions: ['DEVICE_VIEW'] },
      { path: '/loans', label: 'Ausleihe', icon: 'ArrowLeftRight', roles: ['VIEWER', 'STAFF', 'ADMIN'], permissions: ['LOAN_VIEW'], badgeKey: 'loans', badgeTitle: 'Offene Ausleihe-Anfragen' },
      { path: '/rooms', label: 'Räume', icon: 'DoorOpen', roles: ['STAFF', 'ADMIN'], permissions: ['ROOM_VIEW'] },
      { path: '/updates', label: 'Geräte-Updates', icon: 'ClipboardCheck', roles: ['STAFF', 'ADMIN'], permissions: ['UPDATE_VIEW'] }
    ]
  },
  {
    title: 'Support',
    items: [
      // Badge am Ticket-Board: ein roter Kreis mit der Zahl der offenen Tickets
      // (Status OPEN). Eigene Tickets sind darin bereits enthalten, ein zweites
      // (gelbes/oranges) Badge gibt es nicht mehr.
      { path: '/issues/manage', label: 'Ticket-Board', icon: 'MessageSquareWarning', roles: ['STAFF', 'ADMIN'], permissions: ['ISSUE_MANAGE'], badgeKey: 'issues', badgeTitle: 'Offene Tickets (Status: Offen)' },
      { path: '/issues', label: 'Tickets', icon: 'Wrench', roles: ['VIEWER', 'STAFF', 'ADMIN'], permissions: ['ISSUE_VIEW'] },
      { path: '/email-support', label: 'E-Mail-Support', icon: 'MailOpen', roles: ['STAFF', 'ADMIN'], permissions: ['MAIL_MANAGE'], badgeKey: 'inboxMails', badgeTitle: 'Ungelesene Support-Mails' }
    ]
  },
  {
    title: 'System',
    items: [
      { path: '/admin/dashboard', label: 'Administration', icon: 'Settings', roles: ['ADMIN'], permissions: ['SETTINGS_MANAGE'] }
    ]
  }
];

const iconColors = {
  Home: 'text-indigo-500',
  Cpu: 'text-blue-500',
  Laptop: 'text-sky-500',
  ArrowLeftRight: 'text-orange-500',
  DoorOpen: 'text-emerald-500',
  ClipboardCheck: 'text-teal-500',
  MessageSquareWarning: 'text-red-500',
  Wrench: 'text-amber-500',
  MailOpen: 'text-violet-500',
  Mail: 'text-violet-500',
  MapPin: 'text-sky-500',
  FolderTree: 'text-amber-500',
  LayoutGrid: 'text-indigo-500',
  Box: 'text-blue-500',
  Tag: 'text-pink-500',
  Settings: 'text-slate-500',
  Shield: 'text-purple-500',
  Users: 'text-cyan-500',
  Activity: 'text-green-500'
};

export default function Sidebar({ mobile = false, onNavigate, counts = {}, publicSettings = {}, onLogout, accountSettingsOpen, setAccountSettingsOpen }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const role = user?.effectiveRole || user?.role;
  const permissions = user?.effectivePermissions || [];

  const roleLabel = {
    VIEWER: 'Betrachter',
    STAFF: 'Mitarbeiter',
    ADMIN: 'Administrator'
  }[user?.effectiveRole || user?.role] || 'Benutzer';

  return (
    <aside className={`${mobile ? 'flex h-dvh w-[270px] overflow-hidden' : 'hidden h-dvh w-[270px] md:flex'} sidebar-shell min-h-0 shrink-0 flex-col`}>
      {/* Branding – Klick führt zurück zum Dashboard */}
      <div className="flex min-h-[76px] items-center justify-center px-5 py-4">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          title="Zum Dashboard"
          aria-label="Zum Dashboard"
          className="block rounded-lg p-1 transition duration-150 hover:scale-[1.03] hover:opacity-80 active:scale-95"
        >
          <img
            src={publicSettings['org.logo'] || logo}
            alt="MZ-Inventory"
            className="h-11 max-w-[210px] w-auto object-contain pointer-events-none"
          />
        </Link>
      </div>

      {/* Profil oben */}
      <div className="relative px-3 py-3">
        <button
          type="button"
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex w-full items-center gap-2.5 rounded-lg bg-surface-container-high px-3 py-2.5 text-left ring-1 ring-outline-variant transition hover:ring-outline"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-on-surface">{user?.displayName || user?.username || 'Benutzer'}</div>
            <div className="truncate text-[11px] text-on-surface-variant">{roleLabel}</div>
          </div>
          <ChevronDown size={14} className={`text-on-surface-variant shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {userMenuOpen && (
          <div className="animate-fade-in absolute left-3 right-3 top-full z-50 mt-1 rounded-xl border border-outline-variant bg-surface-container p-2 shadow-2xl">
            <button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-on-surface-variant hover:text-on-surface hover:bg-sidebar-item-hover transition" onClick={() => { setUserMenuOpen(false); setAccountSettingsOpen?.(true); }}>Account-Einstellungen</button>
            {((user?.effectiveRole || user?.role) === 'ADMIN' || user?.effectivePermissions?.includes('SETTINGS_MANAGE')) && (
              <button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-on-surface-variant hover:text-on-surface hover:bg-sidebar-item-hover transition" onClick={() => { setUserMenuOpen(false); navigate('/admin/dashboard'); }}>Systemeinstellungen</button>
            )}
            <button className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-error hover:bg-error-container hover:text-on-error-container transition" onClick={() => { setUserMenuOpen(false); onLogout?.(); }}>
              <LogOut size={16} className="mr-2" />
              Abmelden
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => {
            // Einträge, die nur bei einer konkreten Zahl erscheinen
            // (z. B. „Mein Gerät" nur bei aktiver Gerätezuweisung).
            if (item.showOnlyIfCount && !(counts[item.showOnlyIfCount] > 0)) return false;
            const roleAllowed = !item.roles || item.roles.includes(role);
            const permissionAllowed = !item.permissions || item.permissions.some((permission) => permissions.includes(permission) || permissions.includes('ADMIN'));
            if (!item.permissions?.length) return roleAllowed;
            const revoked = user?.revokedPermissions || [];
            if (item.permissions.some((permission) => revoked.includes(permission))) return false;
            return roleAllowed || permissionAllowed;
          });
          if (!items.length) return null;
          return (
            <div key={group.title}>
              <div className="px-3 pb-1 pt-5 text-[10px] uppercase font-bold tracking-wider text-outline first:pt-3">
                {group.title}
              </div>
              {items.map((item) => {
                const Icon = icons[item.icon];
                // Notification-Zahl als roter Kreis direkt am Icon – nur ein
                // Badge je Eintrag (z. B. offene Tickets am Ticket-Board).
                const badgeValue = item.badgeKey ? counts[item.badgeKey] || 0 : 0;
                return (<NavLink key={item.path} to={item.path} onClick={onNavigate} className={({ isActive }) =>
                      `sidebar-item relative flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm mb-0.5 ${
                        isActive ? 'active' : ''
                      }`
                    }>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                        <Icon size={18} className={iconColors[item.icon]} />
                        {badgeValue > 0 && (
                          <span
                            title={item.badgeTitle || item.label}
                            className="absolute -bottom-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white tabular-nums ring-2 ring-[color:var(--bg-sidebar)]"
                          >
                            {badgeValue > 99 ? '99+' : badgeValue}
                          </span>
                        )}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </span>
                  </NavLink>
                );
              })}
            </div>
          );
        })}

        {publicSettings['customModule.enabled'] === 'true' && publicSettings['customModule.url'] && (
          <div>
            <div className="px-3 pb-1 pt-5 text-[10px] uppercase font-bold tracking-wider text-outline">
              Externe Links
            </div>
            <a
              href={publicSettings['customModule.url']}
              target="_blank"
              rel="noopener noreferrer"
              className={`sidebar-item relative flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm text-on-surface-variant hover:bg-sidebar-item-hover transition`}
            >
              <span className="flex items-center gap-3">
                <ExternalLink size={18} />
                <span>{publicSettings['customModule.label'] || 'Externer Link'}</span>
              </span>
              <ExternalLink size={14} className="opacity-40" />
            </a>
          </div>
        )}
      </nav>
    </aside>
  );
}
