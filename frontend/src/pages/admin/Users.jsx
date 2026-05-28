import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { getInitials } from '../../utils/format';

const roles = {
  ADMIN: ['Admin', 'bg-red-100 text-red-700'],
  STAFF: ['Staff', 'bg-orange-100 text-orange-700'],
  VIEWER: ['Viewer', 'bg-gray-100 text-gray-600']
};



export default function Users() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/users');
    setUsers(data.users || []);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => users.filter((user) => {
    if (user.ssoId) return false;
    const haystack = [user.username, user.email, user.role].join(' ').toLowerCase();
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
    if (!window.confirm('Benutzer wirklich löschen?')) return;
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
          <Metric label="Admins" value={users.filter((user) => user.role === 'ADMIN').length} tone="red" />
          <Metric label="Staff" value={users.filter((user) => user.role === 'STAFF').length} tone="orange" />
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
              <option value="ADMIN">Admin</option>
              <option value="STAFF">Staff</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>

        <div className="overflow-x-auto">
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
            {getInitials(user.username)}
          </div>
          <div className="font-semibold text-gray-800">
            {user.username}
          </div>
        </div>
      </td>
      <td className="p-4 text-gray-600">{user.email}</td>
      <td className="p-4">
        <div className="flex items-center gap-2">
          <span className={`badge ${classes}`}>{label}</span>
          <select className="rounded-xl border border-black/10 bg-white px-2 py-1 text-xs" value={user.role} onChange={(event) => onRole(user.id, event.target.value)}>
            <option value="VIEWER">Viewer</option>
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
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

export function AdminPage({ title, subtitle, children }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Metric({ label, value, tone = 'neutral' }) {
  const tones = { neutral: 'text-gray-200', red: 'text-red-500', orange: 'text-orange-500', green: 'text-green-600' };
  return <div className="card min-w-28 p-4"><div className="text-sm text-gray-500">{label}</div><div className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</div></div>;
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
