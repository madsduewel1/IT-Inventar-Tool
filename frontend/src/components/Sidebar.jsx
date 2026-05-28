import { NavLink } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  Cpu,
  DoorOpen,
  Mail,
  MessageSquareWarning,
  PanelLeftClose,
  PanelLeftOpen,
  Wrench,
  Home,
  QrCode,
  Settings,
  Shield,
  Users
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getInitials } from '../utils/format';
import logo from '../assets/mz-inventory-logo.png';
import mobileLogo from '../assets/mz-inventory-mobile-logo.png';

const icons = { Home, Cpu, DoorOpen, ArrowLeftRight, QrCode, Settings, Shield, Users, Activity, MessageSquareWarning, Wrench, Mail };
const navGroups = [
  {
    title: 'Übersicht',
    items: [{ path: '/dashboard', label: 'Dashboard', icon: 'Home', roles: ['VIEWER', 'STAFF', 'ADMIN'] }]
  },
  {
    title: 'Inventar',
    items: [
      { path: '/devices', label: 'Geräte', icon: 'Cpu', roles: ['VIEWER', 'STAFF', 'ADMIN'] },
      { path: '/rooms', label: 'Räume', icon: 'DoorOpen', roles: ['VIEWER', 'STAFF', 'ADMIN'] },
      { path: '/loans', label: 'Ausleihe', icon: 'ArrowLeftRight', roles: ['VIEWER', 'STAFF', 'ADMIN'] },
      { path: '/scanner', label: 'QR-Scanner', icon: 'QrCode', roles: ['VIEWER', 'STAFF', 'ADMIN'] }
    ]
  },
  {
    title: 'Service',
    items: [
      { path: '/issues', label: 'Fehler melden', icon: 'MessageSquareWarning', permissions: ['ISSUE_REPORT'] },
      { path: '/issues/manage', label: 'Fehler bearbeiten', icon: 'Wrench', permissions: ['ISSUE_MANAGE'] }
    ]
  },
  {
    title: 'Administration',
    items: [
      { path: '/admin/users', label: 'Benutzer', icon: 'Users', roles: ['ADMIN'] },
      { path: '/admin/roles', label: 'Rechte', icon: 'Shield', roles: ['ADMIN'] },
      { path: '/admin/monitoring', label: 'Monitoring', icon: 'Activity', roles: ['ADMIN'] },
      { path: '/admin/settings', label: 'Einstellungen', icon: 'Settings', roles: ['ADMIN'] },
      { path: '/admin/mail', label: 'Mail-Log', icon: 'Mail', roles: ['ADMIN'] }
    ]
  }
];

export default function Sidebar({ mobile = false, onNavigate, collapsed = false, onToggleCollapse }) {
  const { user } = useAuth();
  const role = user?.effectiveRole || user?.role;
  const permissions = user?.permissions || [];
  const desktopCollapsed = collapsed && !mobile;

  return (
    <aside className={`${mobile ? 'flex h-dvh w-72 overflow-hidden' : desktopCollapsed ? 'hidden h-dvh w-[88px] md:flex' : 'hidden h-dvh w-[260px] md:flex'} sidebar-shell shrink-0 flex-col text-white transition-[width] duration-200`}>
      <div className={`flex border-b border-white/10 p-5 ${desktopCollapsed ? 'justify-center px-3' : 'justify-center'}`}>
        <img className={mobile || desktopCollapsed ? "h-auto w-16 rounded-2xl shadow-md border border-white/10" : "h-auto w-36 max-w-full"} src={mobile || desktopCollapsed ? mobileLogo : logo} alt="MZ-Inventory" />
      </div>

      <div className={`border-b border-white/10 p-4 ${desktopCollapsed ? 'px-3' : ''}`}>
        <div className={`flex items-center rounded-xl bg-white/5 p-3 ${desktopCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700 font-bold text-white shadow-inner border border-white/10">
            {getInitials(user?.username || 'AD')}
          </div>
          <div className={desktopCollapsed ? 'hidden' : ''}>
            <div className="text-sm font-medium">{user?.username || 'Administrator'}</div>
            <div className="text-xs text-white/40">{user?.role || 'Systemadmin'}</div>
          </div>
        </div>
      </div>

      <nav className={`min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 pb-8 ${desktopCollapsed ? 'px-3' : ''}`}>
        {navGroups.map((group) => {
          const items = group.items.filter((item) => {
            const roleAllowed = !item.roles || item.roles.includes(role);
            const permissionAllowed = !item.permissions || item.permissions.some((permission) => permissions.includes(permission) || permissions.includes('ADMIN'));
            return roleAllowed && permissionAllowed;
          });
          if (!items.length) return null;
          return (
            <div key={group.title}>
              <div className={`px-3 pb-1 pt-5 text-[10px] uppercase tracking-wider text-white/30 first:pt-3 ${desktopCollapsed ? 'sr-only' : ''}`}>
                {group.title}
              </div>
              {items.map((item) => {
                const Icon = icons[item.icon];
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    title={desktopCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `sidebar-item relative flex min-h-12 w-full items-center rounded-xl text-left text-sm ${desktopCollapsed ? 'justify-center px-0' : 'justify-between px-4'} ${
                        isActive ? 'active' : 'text-white/80'
                      }`
                    }
                  >
                    <span className={`flex items-center ${desktopCollapsed ? 'justify-center' : 'gap-3'}`}>
                      <Icon size={18} />
                      <span className={desktopCollapsed ? 'sr-only' : ''}>{item.label}</span>
                    </span>
                    {item.badge && !desktopCollapsed && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">{item.badge}</span>}
                    {item.badge && desktopCollapsed && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500" />}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      {!mobile && (
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            className={`sidebar-collapse-btn flex min-h-11 w-full items-center text-sm font-semibold text-white/80 hover:text-white ${desktopCollapsed ? 'justify-center px-0' : 'justify-between px-4'}`}
            onClick={onToggleCollapse}
            title={desktopCollapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          >
            {!desktopCollapsed && <span>Sidebar</span>}
            {desktopCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      )}
    </aside>
  );
}
