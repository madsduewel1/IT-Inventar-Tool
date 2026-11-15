import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Bell, CheckCircle2, ClipboardList, FolderTree, ListChecks, Settings, Shield, Users as UsersIcon
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { AdminPage } from './Users';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ users: 0, ssoUsers: 0 });
  const [loading, setLoading] = useState(true);
  const [updateInfo, setUpdateInfo] = useState(null);

  const load = useCallback(async () => {
    const [usersResult, updateResult] = await Promise.allSettled([
      api.get('/users'),
      api.get('/system/updates/status')
    ]);

    if (updateResult.status === 'fulfilled') {
      setUpdateInfo(updateResult.value.data);
    }

    if (usersResult.status === 'fulfilled') {
      const users = usersResult.value.data.users || [];
      setCounts({
        users: users.filter((u) => !u.ssoId).length,
        ssoUsers: users.filter((u) => !!u.ssoId).length
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const quickLinks = [
    { to: '/admin/users', label: 'Benutzer verwalten', icon: UsersIcon, color: 'text-blue-500' },
    { to: '/admin/areas', label: 'Gerätebereiche', icon: FolderTree, color: 'text-amber-500' },
    { to: '/admin/ticket-templates', label: 'Ticket-Vorlagen', icon: ClipboardList, color: 'text-violet-500' },
    { to: '/admin/ticket-responsibilities', label: 'Ticket-Zuständigkeiten', icon: ListChecks, color: 'text-cyan-500' },
    { to: '/admin/ticket-notifications', label: 'Ticket-Benachrichtigungen', icon: Bell, color: 'text-rose-500' },
    { to: '/admin/roles', label: 'Rechte & Gruppen', icon: Shield, color: 'text-violet-500' },
    { to: '/admin/settings', label: 'Organisation', icon: Settings, color: 'text-slate-500' },
    { to: '/admin/settings/sso', label: 'SSO konfigurieren', icon: Shield, color: 'text-emerald-500' }
  ];

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Guten Morgen';
    if (hour < 18) return 'Guten Tag';
    return 'Guten Abend';
  }, []);

  return (
    <AdminPage title="Administration" subtitle="Schnelle Zugriffe und Hinweise">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {loading ? (
            <div className="rounded-xl border border-black/5 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
              Status wird geprüft …
            </div>
          ) : updateInfo?.available ? (
            <Link
              to="/admin/system/updates"
              className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
            >
              <ArrowRight size={18} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-bold">Update verfügbar: v{updateInfo.available.version}</div>
                <div className="text-xs opacity-80">Installierte Version: v{updateInfo.currentVersion} · Jetzt Update-Seite öffnen</div>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300">
              <CheckCircle2 size={20} className="shrink-0" />
              <div className="font-bold">Alles in Ordnung</div>
            </div>
          )}
        </div>

        {/* Rechte Spalte: Willkommen + Schnellzugriff */}
        <div className="space-y-5">
          <div className="card p-5">
            <div className="text-sm text-on-surface-variant">{greeting},</div>
            <div className="mt-1 text-base font-bold text-on-surface">
              {user?.displayName || user?.username || 'Administrator'}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-on-surface-variant">
              <UsersIcon size={13} />
              {counts.users} lokaler Benutzer
              {counts.ssoUsers > 0 && (
                <span className="ml-1 text-outline">· {counts.ssoUsers} SSO-Benutzer</span>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-black/5 flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Version</span>
              <span className="text-xs font-semibold text-on-surface">V2.1</span>
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-outline">Schnellzugriff</div>
            <div className="space-y-1">
              {quickLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-sidebar-item-hover transition"
                  >
                    <Icon size={16} className={link.color} />
                    <span className="flex-1">{link.label}</span>
                    <ArrowRight size={14} className="text-outline" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
