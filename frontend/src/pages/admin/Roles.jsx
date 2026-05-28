import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage } from './Users';
import { getInitials } from '../../utils/format';

const roles = {
  ADMIN: ['Admin', 'bg-red-100 text-red-700'],
  STAFF: ['Staff', 'bg-orange-100 text-orange-700'],
  VIEWER: ['Viewer', 'bg-gray-100 text-gray-600']
};

export default function Roles() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/users');
    setUsers(data.users || []);
  }

  useEffect(() => { load(); }, []);

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
    if (!window.confirm('SSO-Benutzer wirklich löschen?')) return;
    setError('');
    try {
      await api.delete(`/users/${userId}`);
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Benutzer konnte nicht gelöscht werden.');
    }
  }

  const ssoUsers = users.filter((user) => user.ssoId);

  return (
    <AdminPage title="Rechte" subtitle="SSO-Benutzern Rollen zuweisen">
      <section className="card overflow-hidden">
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Benutzer</th>
                <th className="p-4 text-left font-medium">SSO-ID</th>
                <th className="p-4 text-left font-medium">Rolle</th>
                <th className="p-4 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {ssoUsers.map((user) => {
                const [label, classes] = roles[user.role] || roles.VIEWER;
                return (
                  <tr key={user.id} className="table-row">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 font-bold text-gray-100">
                          {getInitials(user.username)}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-800">{user.username}</div>
                          {user.email && <div className="text-sm text-gray-500">{user.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs text-gray-600">{user.ssoId}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${classes}`}>{label}</span>
                        <select className="rounded-xl border border-black/10 bg-white px-2 py-1 text-xs" value={user.role} onChange={(event) => changeRole(user.id, event.target.value)}>
                          <option value="VIEWER">Viewer</option>
                          <option value="STAFF">Staff</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </div>
                    </td>
                    <td className="p-4">
                      <button className="font-medium text-red-600" onClick={() => deleteUser(user.id)}><Trash2 className="mr-1 inline" size={16} />Löschen</button>
                    </td>
                  </tr>
                );
              })}
              {!ssoUsers.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="4">Keine SSO-Benutzer vorhanden.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPage>
  );
}
