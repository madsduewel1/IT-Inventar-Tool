import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Bell, CheckCircle2, ClipboardList, FolderTree, Info, ListChecks, RefreshCw, Settings, Shield, Users as UsersIcon,
  XCircle
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { AdminPage } from './Users';

const STATUS_ICONS = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
  info: Info
};

const STATUS_STYLES = {
  ok: 'text-badge-green',
  warn: 'text-amber-500',
  error: 'text-red-500',
  info: 'text-outline'
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ users: 0, ssoUsers: 0 });
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const [statusResult, usersResult, updateResult] = await Promise.allSettled([
      api.get('/system/status'),
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

    if (statusResult.status === 'fulfilled') {
      setStatus(statusResult.value.data);
      setStatusError('');
    } else {
      setStatus(null);
      setStatusError('Systemstatus konnte nicht geladen werden.');
    }
    setLoading(false);
    setRefreshing(false);
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

  const problems = status?.checks?.filter((check) => check.status === 'warn' || check.status === 'error') || [];

  return (
    <AdminPage title="Administration" subtitle="Systemstatus und schnelle Zugriffe">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {updateInfo?.available && (
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
          )}

          {/* Systemstatus – ersetzt die Kennzahlen: wenn alles in Ordnung ist,
              steht hier das Gesamturteil, sonst die einzelnen Beanstandungen. */}
          <section className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-black/5 px-5 py-3">
              <span className="flex-1 text-sm font-bold text-on-surface">Systemstatus</span>
              <button
                type="button"
                onClick={() => load(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Prüfe …' : 'Neu prüfen'}
              </button>
            </div>

            <div className="p-5">
              {statusError && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <XCircle size={18} />
                  {statusError}
                </div>
              )}

              {loading && !status && !statusError && <div className="text-xs text-outline">Systemstatus wird geprüft …</div>}

              {status && (
                <>
                  {status.overall === 'ok' ? (
                    <div className="flex items-center gap-3 rounded-xl bg-badge-green/10 px-4 py-3">
                      <CheckCircle2 size={26} className="shrink-0 text-badge-green" />
                      <div>
                        <div className="text-sm font-bold text-on-surface">Alles läuft ordnungsgemäß</div>
                        <div className="text-xs text-on-surface-variant">
                          {status.checks.length} Prüfungen ohne Beanstandung
                          {status.hostname ? ` · ${status.hostname}` : ''}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex items-start gap-3 rounded-xl px-4 py-3 ${
                        status.overall === 'error' ? 'bg-red-500/10' : 'bg-amber-500/10'
                      }`}
                    >
                      {status.overall === 'error'
                        ? <XCircle size={26} className="shrink-0 text-red-500" />
                        : <AlertTriangle size={26} className="shrink-0 text-amber-500" />}
                      <div>
                        <div className="text-sm font-bold text-on-surface">
                          {problems.length} {problems.length === 1 ? 'Punkt braucht' : 'Punkte brauchen'} Aufmerksamkeit
                        </div>
                        <div className="text-xs text-on-surface-variant">
                          {problems.map((check) => check.label).join(' · ')}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 divide-y divide-black/5">
                    {status.checks.map((check) => {
                      const Icon = STATUS_ICONS[check.status] || Info;
                      return (
                        <div key={check.id} className="flex items-start gap-3 py-2.5">
                          <Icon size={16} className={`mt-0.5 shrink-0 ${STATUS_STYLES[check.status] || STATUS_STYLES.info}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-on-surface">{check.label}</div>
                            {check.detail && <div className="truncate text-xs text-outline">{check.detail}</div>}
                          </div>
                          <div className="shrink-0 text-right text-xs font-medium text-on-surface-variant">{check.value}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Link to="/admin/settings" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Systemübersicht <ArrowRight size={13} />
                    </Link>
                  </div>
                </>
              )}
            </div>
          </section>
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
