import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, Search, Trash2, ChevronDown, LayoutDashboard } from 'lucide-react';
import { api } from '../../api/client';
import { getInitials } from '../../utils/format';
import { useConfirm } from '../../components/ConfirmDialog';

const roles = {
  ADMIN: ['Administrator', 'bg-red-100 text-red-700'],
  STAFF: ['IT', 'bg-orange-100 text-orange-700'],
  VIEWER: ['Benutzer', 'bg-gray-100 text-gray-600']
};



export default function Users() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [error, setError] = useState('');
  const confirm = useConfirm();

  async function load() {
    try {
      const { data } = await api.get('/users');
      setUsers(data.users || []);
    } catch {
      setError('Benutzer konnten nicht geladen werden.');
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => users.filter((user) => {
    if (user.ssoId) return false;
    const haystack = [user.username, user.displayName, user.email, user.role].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase()) && (!roleFilter || user.role === roleFilter);
  }), [users, query, roleFilter]);

  async function changeRole(userId, role) {
    setError('');
    try {
      await api.patch(`/users/${userId}/role`, { role });
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Rolle konnte nicht gespeichert werden.');
    }
  }

  async function deleteUser(userId) {
    const ok = await confirm({
      title: 'Benutzer löschen',
      message: 'Benutzer wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.',
      tone: 'danger',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    setError('');
    try {
      await api.delete(`/users/${userId}`);
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Benutzer konnte nicht gelöscht werden.');
    }
  }

  return (
    <AdminPage title="Benutzerverwaltung" subtitle="Konten, Rollen und Zugriffsrechte verwalten">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-3 gap-3">
          <Metric label="Benutzer" value={users.length} />
          <Metric label="Administratoren" value={users.filter((user) => user.role === 'ADMIN').length} tone="red" />
          <Metric label="IT" value={users.filter((user) => user.role === 'STAFF').length} tone="orange" />
        </div>
        <Link className="btn-primary" to="/admin/users/new"><Plus size={17} />Neu hinzufügen</Link>
      </div>

      <section className="card overflow-hidden">
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{error}</div>}
          <div className="grid gap-3 border-b border-black/5 p-5 md:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
              <input className="field pl-9" placeholder="Benutzername, E-Mail oder Rolle suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <select className="field" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">Alle Rollen</option>
              <option value="ADMIN">Administrator</option>
              <option value="STAFF">IT</option>
              <option value="VIEWER">Benutzer</option>
            </select>
          </div>

        {/* Mobil: Kartenliste – Rolle, E-Mail und Aktion ohne Querscrollen */}
        <div className="divide-y divide-black/5 md:hidden">
          {filtered.map((entry) => {
            const [label, classes] = roles[entry.role] || roles.VIEWER;
            return (
              <div key={entry.id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#afa9ec] font-bold text-[#26215c]">
                    {getInitials(entry.displayName || entry.username)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-gray-800 dark:text-zinc-100">{entry.displayName || entry.username}</div>
                    <div className="truncate text-xs text-gray-500 dark:text-zinc-400">{entry.email}</div>
                  </div>
                  <span className={`badge shrink-0 ${classes}`}>{label}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <select
                    className="field h-11 flex-1 py-0"
                    value={entry.role}
                    onChange={(event) => changeRole(entry.id, event.target.value)}
                    aria-label="Rolle ändern"
                  >
                    <option value="VIEWER">Benutzer</option>
                    <option value="STAFF">IT</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                  <button className="btn-secondary min-h-11 shrink-0 border-badge-red px-3 text-text-badge-red" onClick={() => deleteUser(entry.id)}>
                    <Trash2 size={16} />Löschen
                  </button>
                </div>
              </div>
            );
          })}
          {!filtered.length && <div className="p-5 text-sm text-gray-500 dark:text-zinc-400">Keine Benutzer gefunden.</div>}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Benutzer</th>
                <th className="p-4 text-left font-medium">E-Mail</th>
                <th className="p-4 text-left font-medium">Rolle</th>
                <th className="p-4 text-left font-medium">Erstellt</th>
                <th className="p-4 text-left font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => <UserRow key={entry.id} user={entry} onRole={changeRole} onDelete={deleteUser} />)}
              {!filtered.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="5">Keine Benutzer gefunden.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPage>
  );
}

function UserRow({ user, onRole, onDelete }) {
  const [label, classes] = roles[user.role] || roles.VIEWER;
  return (
    <tr className="table-row">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#afa9ec] font-bold text-[#26215c]">
            {getInitials(user.displayName || user.username)}
          </div>
          <div className="font-semibold text-gray-800">
            {user.displayName || user.username}
          </div>
        </div>
      </td>
      <td className="p-4 text-gray-600">{user.email}</td>
      <td className="p-4">
        <div className="flex items-center gap-2">
          <span className={`badge ${classes}`}>{label}</span>
          <select className="rounded-xl border border-black/10 bg-white px-2 py-1 text-xs" value={user.role} onChange={(event) => onRole(user.id, event.target.value)}>
            <option value="VIEWER">Benutzer</option>
            <option value="STAFF">IT</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </div>
      </td>
      <td className="p-4 text-gray-600">{user.createdAt?.slice(0, 10)}</td>
      <td className="p-4">
        <button className="font-medium text-red-600" onClick={() => onDelete(user.id)}><Trash2 className="mr-1 inline" size={16} />Löschen</button>
      </td>
    </tr>
  );
}

const ADMIN_NAV = [
  {
    label: 'Benutzer',
    items: [
      { path: '/admin/users', label: 'Benutzer', exact: false },
      { path: '/admin/roles', label: 'Benutzerrechte', exact: false },
    ],
  },
  {
    label: 'Ticket-System',
    items: [
      { path: '/admin/areas', label: 'Bereiche', exact: false },
      { path: '/admin/ticket-responsibilities', label: 'Ticket-Zuständigkeiten', exact: true },
      { path: '/admin/ticket-templates', label: 'Ticket-Vorlagen', exact: true },
      { path: '/admin/ticket-priorities', label: 'Ticket-Prioritäten', exact: true },
      { path: '/admin/ticket-notifications', label: 'Ticket-Benachrichtigungen', exact: true },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/admin/settings', label: 'Organisation', exact: true },
      { path: '/admin/settings/usage', label: 'Bedienung', exact: true },
      { path: '/admin/settings/system', label: 'Systemübersicht', exact: true },
      { path: '/admin/settings/support', label: 'Support', exact: true },
      { path: '/admin/settings/embed', label: 'Einbettung', exact: true },
      { path: '/admin/system/updates', label: 'Updates', exact: true },
    ],
  },
  {
    label: 'Mail',
    items: [
      { path: '/admin/settings/mail', label: 'Mail', exact: true },
      { path: '/admin/mail', label: 'Mail-Log', exact: false },
    ],
  },
  {
    label: 'SSO',
    items: [
      { path: '/admin/settings/sso', label: 'SSO', exact: true },
      { path: '/admin/settings/roles', label: 'Rechte & Gruppen', exact: true },
    ],
  },
  {
    label: 'Labels',
    items: [
      { path: '/admin/settings/labels', label: 'Labeldruck-Einstellungen', exact: true },
    ],
  },
];

function isPathActive(item, currentPath) {
  if (item.exact) return currentPath === item.path;
  return currentPath === item.path || currentPath.startsWith(item.path + '/');
}

export function AdminPage({ title, subtitle, children }) {
  const location = useLocation();
  const currentPath = location.pathname;
  const [openMenu, setOpenMenu] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    function onDocMouseDown(event) {
      if (navRef.current && !navRef.current.contains(event.target)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => { setOpenMenu(null); }, [currentPath]);

  return (
    <div className="space-y-5">
      <nav ref={navRef} className="admin-nav-shell">
        <div className="admin-nav-list">
          <Link
            to="/admin/dashboard"
            className={`admin-nav-trigger ${currentPath === '/admin/dashboard' ? 'active' : ''}`}
          >
            <LayoutDashboard size={15} />
            Dashboard
          </Link>
          {ADMIN_NAV.map((group) => {
            const anyActive = group.items.some((item) => isPathActive(item, currentPath));
            const open = openMenu === group.label;
            return (
              <div key={group.label} className={`admin-nav-item ${open ? 'open' : ''}`}>
                <button
                  type="button"
                  className={`admin-nav-trigger ${anyActive ? 'active' : ''}`}
                  onClick={() => setOpenMenu(open ? null : group.label)}
                  aria-expanded={open}
                  aria-haspopup="menu"
                >
                  {group.label}
                  <ChevronDown size={14} className="chevron" />
                </button>
                <div className="admin-nav-dropdown" role="menu">
                  {group.items.map((item) => (
                    <Link
                      key={item.path + item.label}
                      to={item.path}
                      role="menuitem"
                      onClick={() => setOpenMenu(null)}
                      className={`admin-nav-link ${isPathActive(item, currentPath) ? 'active' : ''}`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-main">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>

        <div className="space-y-6 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Metric({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-gray-800 dark:text-gray-200',
    red: 'text-red-500 dark:text-red-400',
    orange: 'text-orange-500 dark:text-orange-400',
    green: 'text-green-600 dark:text-green-400'
  };
  return (
    <div className="card min-w-28 p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

export function List({ rows, columns }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#fafafa] text-gray-500">
            <tr>{columns.map((column) => <th key={column} className="p-4 text-left font-medium">{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id || row.key} className="table-row">
                {columns.map((column) => <td key={column} className="p-4 font-medium text-gray-800">{String(row[column] ?? '-')}</td>)}
              </tr>
            ))}
            {!rows.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan={columns.length}>Keine Einträge vorhanden.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
