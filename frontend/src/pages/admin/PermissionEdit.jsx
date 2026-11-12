import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Shield, UsersRound } from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage } from './Users';
import { getInitials } from '../../utils/format';
import PermissionModuleEditor, { ROLE_LABELS, ROLE_OPTIONS } from '../../components/PermissionModuleEditor';
import { Spinner } from '../../components/Loading';

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const pageMeta = {
  users: { title: 'Einzelrechte bearbeiten', subtitle: 'Spezifische Zusatzrechte (+) oder Entzüge (-) für diesen Benutzer festlegen.' },
  groups: { title: 'Gruppen-Rechte bearbeiten', subtitle: 'Standard-Rolle sowie Zusatzrechte (+) und Entzüge (-) für diese SSO-Gruppe festlegen.' }
};

export default function PermissionEdit() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [entity, setEntity] = useState(null);
  const [granted, setGranted] = useState([]);
  const [revoked, setRevoked] = useState([]);
  const [role, setRole] = useState('VIEWER');

  const meta = pageMeta[type] || { title: 'Rechte bearbeiten', subtitle: '' };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        if (type === 'users') {
          const { data } = await api.get('/users');
          const user = (data.users || []).find((entry) => entry.id === id);
          if (!user) {
            setError('Benutzer wurde nicht gefunden.');
            return;
          }
          setEntity({
            name: user.displayName || user.username,
            subtitle: user.email,
            role: user.role,
            effectiveRole: user.effectiveRole || user.role,
            permissions: user.permissions || [],
            revokedPermissions: user.revokedPermissions || []
          });
        } else if (type === 'groups') {
          const { data } = await api.get('/settings');
          const mappings = parseJson(data.settings?.['sso.groupMappings'], []);
          const index = Number(id);
          const mapping = mappings[index];
          if (!mapping) {
            setError('SSO-Gruppe wurde nicht gefunden.');
            return;
          }
          setEntity({
            name: mapping.group || `SSO-Gruppe ${index + 1}`,
            role: mapping.role || 'VIEWER',
            effectiveRole: mapping.role || 'VIEWER',
            permissions: mapping.permissions || [],
            revokedPermissions: mapping.revokedPermissions || []
          });
        } else {
          setError('Unbekannter Rechte-Typ.');
        }
      } catch {
        setError('Daten konnten nicht geladen werden.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [type, id]);

  useEffect(() => {
    if (!entity) return;
    setGranted(entity.permissions || []);
    setRevoked(entity.revokedPermissions || []);
    setRole(entity.role || entity.effectiveRole || 'VIEWER');
  }, [entity]);

  function cycleState(permissionId) {
    if (granted.includes(permissionId)) {
      setGranted((current) => current.filter((p) => p !== permissionId));
      setRevoked((current) => [...current, permissionId]);
    } else if (revoked.includes(permissionId)) {
      setRevoked((current) => current.filter((p) => p !== permissionId));
    } else {
      setGranted((current) => [...current, permissionId]);
      setRevoked((current) => current.filter((p) => p !== permissionId));
    }
  }

  function resetAll() {
    setGranted([]);
    setRevoked([]);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      if (type === 'users') {
        await api.patch(`/users/${id}/permissions`, { permissions: granted, revokedPermissions: revoked });
      } else if (type === 'groups') {
        const index = Number(id);
        const { data } = await api.get('/settings');
        const mappings = parseJson(data.settings?.['sso.groupMappings'], []);
        if (!mappings[index]) {
          setError('SSO-Gruppe wurde nicht gefunden.');
          return;
        }
        const next = mappings.map((entry, currentIndex) => currentIndex === index
          ? { ...entry, role, permissions: granted, revokedPermissions: revoked }
          : entry);
        await api.patch('/settings', { 'sso.groupMappings': JSON.stringify(next) });
      }
      navigate('/admin/roles');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Berechtigungen konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  const roleLabel = entity ? ROLE_LABELS[entity.effectiveRole || entity.role]?.[0] || entity.effectiveRole || entity.role : '';
  const roleClasses = entity ? ROLE_LABELS[entity.effectiveRole || entity.role]?.[1] || 'bg-gray-100 text-gray-600' : '';

  return (
    <AdminPage title={meta.title} subtitle={meta.subtitle}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to="/admin/roles" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main"><ArrowLeft size={16} />Zurück zu Rechte & Gruppen</Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-main">{entity ? entity.name : 'Rechte bearbeiten'}</h1>
            {entity && <span className={`badge ${roleClasses}`}>{roleLabel}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">{entity?.subtitle || ''}</p>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving || loading || !entity}>
          {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
          {saving ? 'Speichert...' : 'Berechtigungen speichern'}
        </button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
      {loading && <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted"><Spinner size={22} />Lade Rechte…</div>}

      {entity && !loading && (
        <section className="card overflow-hidden">
          <div className="border-b border-black/5 p-5">
            <div className="flex items-center gap-3">
              {type === 'users' ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#afa9ec] font-bold text-[#26215c]">
                  {getInitials(entity.name)}
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#afa9ec] text-[#26215c]">
                  <UsersRound size={18} />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 font-semibold text-gray-800">
                  <Shield size={16} className="text-blue-600" />
                  {entity.name}
                </div>
                <div className="text-xs text-gray-500">
                  Effektive Basis-Rolle: <strong>{roleLabel}</strong>
                  {type === 'groups' && ' · Rolle und Rechte gelten für alle Mitglieder dieser SSO-Gruppe'}
                </div>
              </div>
            </div>
          </div>
          <div className="p-5">
            <PermissionModuleEditor
              entity={entity}
              roleOptions={type === 'groups' ? ROLE_OPTIONS : null}
              granted={granted}
              revoked={revoked}
              role={role}
              onChangeState={cycleState}
              onRoleChange={setRole}
              onReset={resetAll}
            />
          </div>
        </section>
      )}
    </AdminPage>
  );
}
