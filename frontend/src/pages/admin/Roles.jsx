import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Sliders, Plus, Shield, UsersRound, Search, X } from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage, Metric } from './Users';
import { getInitials } from '../../utils/format';
import { ROLE_LABELS } from '../../components/PermissionModuleEditor';
import { useConfirm } from '../../components/ConfirmDialog';

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function OverrideBadge({ granted, revoked }) {
  const count = (granted || []).length + (revoked || []).length;
  if (!count) return null;
  return (
    <span className="ml-1 rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-bold">
      +{(granted || []).length} / -{(revoked || []).length}
    </span>
  );
}

function ActivePermissions({ permissions, catalog }) {
  const list = permissions || [];
  const names = new Map((catalog || []).map((permission) => [permission.id, permission.name]));
  return (
    <div className="flex flex-wrap gap-1 max-w-xs">
      {list.slice(0, 4).map((p) => (
        <span key={p} className="badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]">
          {names.get(p) || p.replace(/_/g, ' ')}
        </span>
      ))}
      {list.length > 4 && (
        <span className="badge bg-gray-100 text-gray-500 text-[10px]">
          +{list.length - 4}
        </span>
      )}
    </div>
  );
}

export default function Roles() {
  const [users, setUsers] = useState([]);
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [groupMappings, setGroupMappings] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [error, setError] = useState('');
  const [addedUserIds, setAddedUserIds] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const confirm = useConfirm();

  async function load() {
    try {
      const [{ data: usersData }, { data: settingsData }] = await Promise.all([
        api.get('/users'),
        api.get('/settings')
      ]);
      setUsers(usersData.users || []);
      setPermissionCatalog(usersData.availablePermissions || []);
      const withOverrides = (usersData.users || [])
        .filter((user) => (user.permissions || []).length > 0 || (user.revokedPermissions || []).length > 0)
        .map((user) => user.id);
      setAddedUserIds(withOverrides);
      setGroupMappings(parseJson(settingsData.settings?.['sso.groupMappings'], []));
      setAvailableGroups(parseJson(settingsData.settings?.['sso.availableGroups'], []));
    } catch {
      setError('Benutzer und Gruppen konnten nicht geladen werden.');
    }
  }

  useEffect(() => { load(); }, []);

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
      setAddedUserIds((current) => current.filter((id) => id !== userId));
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Benutzer konnte nicht gelöscht werden.');
    }
  }

  function updateGroup(index, patch) {
    setGroupMappings((current) => current.map((entry, currentIndex) => currentIndex === index ? { ...entry, ...patch } : entry));
  }

  async function persistGroupMappings() {
    setError('');
    try {
      const { data } = await api.patch('/settings', { 'sso.groupMappings': JSON.stringify(groupMappings) });
      const next = parseJson(data.settings?.['sso.groupMappings'], []);
      setGroupMappings(next);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Gruppen-Rechte konnten nicht gespeichert werden.');
    }
  }

  async function saveGroupRole(index, role) {
    setError('');
    const next = groupMappings.map((entry, currentIndex) => currentIndex === index ? { ...entry, role } : entry);
    setGroupMappings(next);
    try {
      const { data } = await api.patch('/settings', { 'sso.groupMappings': JSON.stringify(next) });
      setGroupMappings(parseJson(data.settings?.['sso.groupMappings'], next));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Rolle konnte nicht gespeichert werden.');
    }
  }

  function addGroupMapping() {
    const next = [...groupMappings, { group: '', role: 'VIEWER', permissions: [], revokedPermissions: [] }];
    setGroupMappings(next);
    api.patch('/settings', { 'sso.groupMappings': JSON.stringify(next) })
      .then(({ data }) => setGroupMappings(parseJson(data.settings?.['sso.groupMappings'], next)))
      .catch((requestError) => setError(requestError.response?.data?.error || 'Gruppen-Mapping konnte nicht angelegt werden.'));
  }

  async function removeGroup(index) {
    const ok = await confirm({
      title: 'Mapping entfernen',
      message: `SSO-Gruppen-Mapping wirklich entfernen? ${groupMappings[index]?.group ? `„${groupMappings[index].group}“` : ''} erhalten dann keine Rolle mehr.`,
      tone: 'danger',
      confirmLabel: 'Entfernen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    const next = groupMappings.filter((_, currentIndex) => currentIndex !== index);
    setGroupMappings(next);
    api.patch('/settings', { 'sso.groupMappings': JSON.stringify(next) })
      .then(({ data }) => setGroupMappings(parseJson(data.settings?.['sso.groupMappings'], next)))
      .catch((requestError) => setError(requestError.response?.data?.error || 'Gruppen-Mapping konnte nicht entfernt werden.'));
  }

  const addedUsers = users.filter((user) => addedUserIds.includes(user.id));
  const normalizedQuery = pickerQuery.trim().toLowerCase();
  const pickerUsers = users.filter((user) => {
    if (addedUserIds.includes(user.id)) return false;
    if (!normalizedQuery) return true;
    return [user.username, user.displayName, user.email].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedQuery));
  });

  return (
    <AdminPage title="Rechte & Gruppen" subtitle="Rollen, individuelle Einzelrechte und SSO-Gruppen-Mappings verwalten">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metric label="Benutzer" value={users.filter((user) => !user.ssoId).length} />
        <Metric label="SSO-Benutzer" value={users.filter((user) => user.ssoId).length} tone="green" />
        <Metric label="Gruppen-Mappings" value={groupMappings.length} tone="orange" />
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      {/* Individuelle Benutzerrechte */}
      <section className="card">
        <div className="flex flex-col gap-3 border-b border-black/5 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-gray-800">
              <UsersRound size={16} className="text-blue-600" />
              Individuelle Benutzerrechte
            </div>
            <p className="mt-1 text-sm text-gray-500 max-w-2xl">Einen Benutzer über das Dropdown hinzufügen und dann seine Einzelrechte bearbeiten. Benutzer mit aktiven Overrides bleiben automatisch in der Liste.</p>
          </div>
          <button className="btn-primary text-xs" onClick={() => { setPickerOpen((open) => !open); setPickerQuery(''); }}>
            <Plus size={14} className="mr-1 inline" />
            Benutzer hinzufügen
          </button>
        </div>
        {pickerOpen && (
          <div className="border-b border-black/5 bg-gray-50/60 p-3">
            <div className="relative mx-auto w-full max-w-md">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                autoFocus
                className="field pl-9"
                placeholder="Benutzer suchen..."
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
              />
              <button className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setPickerOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="mx-auto mt-2 max-h-[min(320px,45vh)] w-full max-w-md overflow-y-auto rounded-xl border border-black/10 bg-white p-1.5 shadow-xl">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{pickerUsers.length} Benutzer</div>
              {pickerUsers.map((user) => {
                const [label, classes] = ROLE_LABELS[user.effectiveRole || user.role] || ROLE_LABELS.VIEWER;
                return (
                  <button
                    key={user.id}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50 transition"
                    onClick={() => {
                      setAddedUserIds((current) => [...current, user.id]);
                      setPickerOpen(false);
                      setPickerQuery('');
                    }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#afa9ec] font-bold text-[#26215c] text-xs">
                      {getInitials(user.displayName || user.username)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-800">{user.displayName || user.username}{user.ssoId ? <span className="ml-1 text-[10px] text-gray-400">SSO</span> : null}</div>
                      {user.email && <div className="truncate text-xs text-gray-500">{user.email}</div>}
                    </div>
                    <span className={`badge ${classes}`}>{label}</span>
                  </button>
                );
              })}
              {!pickerUsers.length && <div className="p-4 text-center text-sm text-gray-400">Keine weiteren Benutzer gefunden.</div>}
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Benutzer</th>
                <th className="p-4 text-left font-medium">Aktive Rechte</th>
                <th className="p-4 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {addedUsers.map((user) => {
                const [label, classes] = ROLE_LABELS[user.effectiveRole || user.role] || ROLE_LABELS.VIEWER;
                return (
                  <tr key={user.id} className="table-row">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#afa9ec] font-bold text-[#26215c]">
                          {getInitials(user.displayName || user.username)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 font-semibold text-gray-800">
                            {user.displayName || user.username}
                            {user.ssoId && <span className="text-[10px] text-gray-400">SSO</span>}
                            <span className={`badge ${classes}`}>{label}</span>
                          </div>
                          {user.email && <div className="text-xs text-gray-500">{user.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <ActivePermissions permissions={user.effectivePermissions} catalog={permissionCatalog} />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Link
                          className="btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5"
                          to={`/admin/roles/edit?type=users&id=${user.id}`}
                        >
                          <Sliders size={14} />
                          Rechte bearbeiten
                          <OverrideBadge granted={user.permissions} revoked={user.revokedPermissions} />
                        </Link>
                        <button className="text-xs font-medium text-gray-500 hover:text-gray-700" onClick={() => setAddedUserIds((current) => current.filter((id) => id !== user.id))}>
                          Entfernen
                        </button>
                        <button className="font-medium text-red-600" onClick={() => deleteUser(user.id)}><Trash2 className="mr-1 inline" size={16} />Löschen</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!addedUsers.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="3">Noch keine Benutzer hinzugefügt. Klicke auf „Benutzer hinzufügen“, um einen Benutzer auszuwählen.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* SSO-Gruppen */}
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-black/5 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-gray-800">
              <Shield size={16} className="text-orange-500" />
              SSO-Gruppen
            </div>
            <p className="mt-1 text-sm text-gray-500 max-w-2xl">Gemappte SSO-Gruppen erhalten eine Standard-Rolle sowie individuelle Zusatzrechte (+). Änderungen am Gruppennamen oder an der Rolle werden mit „Änderungen speichern“ übernommen.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={addGroupMapping}><Plus size={14} className="inline mr-1" />Mapping hinzufügen</button>
            <button className="btn-primary text-xs" onClick={persistGroupMappings}><Sliders size={14} className="inline mr-1" />Änderungen speichern</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">SSO-Gruppe</th>
                <th className="p-4 text-left font-medium">Standard-Rolle</th>
                <th className="p-4 text-left font-medium">Zusatzrechte</th>
                <th className="p-4 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {groupMappings.map((mapping, index) => (
                <tr key={index} className="table-row">
                  <td className="p-4">
                    <input
                      className="field max-w-xs"
                      list="sso-groups"
                      placeholder="z. B. IT-Gruppe"
                      value={mapping.group || ''}
                      onChange={(event) => updateGroup(index, { group: event.target.value })}
                    />
                  </td>
                  <td className="p-4">
                    <select
                      className="rounded-xl border border-black/10 bg-white px-2 py-1 text-xs"
                      value={mapping.role || 'VIEWER'}
                      onChange={(event) => saveGroupRole(index, event.target.value)}
                    >
                      <option value="VIEWER">Benutzer</option>
                      <option value="STAFF">IT</option>
                      <option value="ADMIN">Administrator</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <Link
                      className="btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5"
                      to={`/admin/roles/edit?type=groups&id=${index}`}
                    >
                      <Sliders size={14} />
                      Rechte bearbeiten
                      <OverrideBadge granted={mapping.permissions} revoked={mapping.revokedPermissions} />
                    </Link>
                  </td>
                  <td className="p-4">
                    <button className="font-medium text-red-600 text-xs" onClick={() => removeGroup(index)}><Trash2 className="mr-1 inline" size={14} />Entfernen</button>
                  </td>
                </tr>
              ))}
              {!groupMappings.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="4">Noch keine SSO-Gruppen gemappt.</td></tr>}
            </tbody>
          </table>
          <datalist id="sso-groups">
            {availableGroups.map((group) => <option key={group} value={group} />)}
          </datalist>
        </div>
      </section>
    </AdminPage>
  );
}