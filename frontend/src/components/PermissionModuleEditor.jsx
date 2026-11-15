import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Cpu,
  DoorOpen,
  FolderTree,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Ticket,
  Users
} from 'lucide-react';

export const ROLE_LABELS = {
  ADMIN: ['Administrator', 'bg-red-100 text-red-700'],
  STAFF: ['IT', 'bg-orange-100 text-orange-700'],
  VIEWER: ['Benutzer', 'bg-gray-100 text-gray-600']
};

export const ROLE_OPTIONS = [
  ['VIEWER', 'Benutzer'],
  ['STAFF', 'IT'],
  ['ADMIN', 'Administrator']
];

const MODULE_META = {
  Geräte: { icon: Cpu, className: 'text-sky-600' },
  Ausleihen: { icon: ArrowLeftRight, className: 'text-amber-600' },
  Tickets: { icon: Ticket, className: 'text-rose-600' },
  Räume: { icon: DoorOpen, className: 'text-emerald-600' },
  Gerätebereiche: { icon: FolderTree, className: 'text-cyan-600' },
  Benutzer: { icon: Users, className: 'text-violet-600' },
  'Geräte-Updates': { icon: RefreshCw, className: 'text-teal-600' },
  'Ticket-System': { icon: ClipboardList, className: 'text-fuchsia-600' },
  System: { icon: Settings, className: 'text-slate-600' }
};

const DEFAULT_MODULE_META = { icon: Shield, className: 'text-primary' };

const STATE_META = {
  granted: {
    label: 'Zusätzlich erteilt',
    icon: Plus,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  },
  revoked: {
    label: 'Entzogen',
    icon: Minus,
    className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
  },
  defaultOn: {
    label: 'Standard aktiv',
    icon: Check,
    className: 'border-primary/30 bg-primary/10 text-primary'
  },
  adminOn: {
    label: 'Über Vollzugriff',
    icon: Shield,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  },
  defaultOff: {
    label: 'Nicht enthalten',
    icon: Circle,
    className: 'border-outline-variant bg-surface-container-low text-on-surface-variant'
  }
};

export default function PermissionModuleEditor({
  catalog = [],
  roleDefaults = [],
  roleOptions = null,
  granted = [],
  revoked = [],
  role,
  canGrantAdmin = true,
  onSetState,
  onRoleChange,
  onReset
}) {
  const [search, setSearch] = useState('');
  const [onlyOverrides, setOnlyOverrides] = useState(false);
  const [expandedModules, setExpandedModules] = useState({});

  const defaultSet = useMemo(() => new Set(roleDefaults), [roleDefaults]);
  const grantedSet = useMemo(() => new Set(granted), [granted]);
  const revokedSet = useMemo(() => new Set(revoked), [revoked]);

  const modules = useMemo(() => {
    const groups = new Map();
    catalog.forEach((permission) => {
      if (!groups.has(permission.module)) groups.set(permission.module, []);
      groups.get(permission.module).push(permission);
    });
    return Array.from(groups, ([module, permissions]) => ({
      module,
      permissions,
      meta: MODULE_META[module] || DEFAULT_MODULE_META
    }));
  }, [catalog]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredModules = useMemo(() => modules
    .map((entry) => ({
      ...entry,
      permissions: entry.permissions.filter((permission) => {
        if (onlyOverrides && !grantedSet.has(permission.id) && !revokedSet.has(permission.id)) {
          return false;
        }
        if (!normalizedSearch) return true;
        return [permission.name, permission.description, permission.id]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedSearch));
      })
    }))
    .filter((entry) => entry.permissions.length), [modules, onlyOverrides, normalizedSearch, grantedSet, revokedSet]);

  const adminAccess = defaultSet.has('ADMIN') || grantedSet.has('ADMIN');
  const effectiveCount = useMemo(() => catalog.filter((permission) => (
    adminAccess || defaultSet.has(permission.id) || grantedSet.has(permission.id)
  ) && !revokedSet.has(permission.id)).length, [catalog, adminAccess, defaultSet, grantedSet, revokedSet]);

  const totalOverrides = granted.length + revoked.length;
  const roleLabel = ROLE_LABELS[role]?.[0] || role || '';

  function getState(permissionId) {
    if (grantedSet.has(permissionId)) return 'granted';
    if (revokedSet.has(permissionId)) return 'revoked';
    if (defaultSet.has(permissionId)) return 'defaultOn';
    return adminAccess ? 'adminOn' : 'defaultOff';
  }

  function togglePermission(permissionId) {
    if (permissionId === 'ADMIN' && !canGrantAdmin) return;
    if (grantedSet.has(permissionId) || revokedSet.has(permissionId)) {
      onSetState(permissionId, 'default');
      return;
    }
    onSetState(permissionId, getState(permissionId) === 'defaultOff' ? 'granted' : 'revoked');
  }

  function toggleModule(moduleName) {
    setExpandedModules((current) => ({ ...current, [moduleName]: current[moduleName] === false }));
  }

  function isModuleExpanded(moduleName) {
    if (normalizedSearch || onlyOverrides) return true;
    return expandedModules[moduleName] !== false;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {roleLabel}
            </span>
            <span className="text-xs text-on-surface-variant">
              {defaultSet.size} Standardrechte · {effectiveCount} effektiv
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-on-surface-variant">
            {Object.entries(STATE_META).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <Icon size={13} />
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
          <input
            className="field pl-9"
            placeholder="Recht oder Beschreibung suchen…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-on-surface-variant">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-outline text-primary focus:ring-primary"
            checked={onlyOverrides}
            onChange={(event) => setOnlyOverrides(event.target.checked)}
          />
          Nur Abweichungen
        </label>
      </div>

      <div className="space-y-2">
        {filteredModules.map(({ module, permissions, meta }) => {
          const Icon = meta.icon;
          const isExpanded = isModuleExpanded(module);
          const moduleGranted = permissions.filter((permission) => grantedSet.has(permission.id)).length;
          const moduleRevoked = permissions.filter((permission) => revokedSet.has(permission.id)).length;

          return (
            <div key={module} className="overflow-hidden rounded-xl border border-outline-variant">
              <button
                type="button"
                onClick={() => toggleModule(module)}
                className="flex w-full items-center gap-3 bg-surface-container-low px-4 py-3 text-left transition hover:bg-surface-container"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest">
                  <Icon size={17} className={meta.className} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-on-surface">{module}</span>
                    <span className="text-[11px] text-on-surface-variant">{permissions.length} Rechte</span>
                    {moduleGranted > 0 && (
                      <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        +{moduleGranted}
                      </span>
                    )}
                    {moduleRevoked > 0 && (
                      <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
                        −{moduleRevoked}
                      </span>
                    )}
                  </span>
                </span>
                {isExpanded
                  ? <ChevronDown size={16} className="text-on-surface-variant" />
                  : <ChevronRight size={16} className="text-on-surface-variant" />}
              </button>

              {isExpanded && (
                <div className="divide-y divide-outline-variant">
                  {permissions.map((permission) => {
                    const state = getState(permission.id);
                    const stateMeta = STATE_META[state];
                    const StateIcon = stateMeta.icon;
                    const disabled = permission.id === 'ADMIN' && !canGrantAdmin;

                    return (
                      <button
                        key={permission.id}
                        type="button"
                        onClick={() => togglePermission(permission.id)}
                        disabled={disabled}
                        className="flex w-full items-start gap-3 bg-surface-container-lowest px-4 py-3 text-left transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${stateMeta.className}`}>
                          <StateIcon size={13} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-on-surface">{permission.name}</span>
                            {permission.id === 'ADMIN' && (
                              <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                                Vollzugriff
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-on-surface-variant">{permission.description}</span>
                          {disabled && (
                            <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-300">
                              Nur Administratoren dürfen dieses Recht vergeben.
                            </span>
                          )}
                        </span>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${stateMeta.className}`}>
                          {stateMeta.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!filteredModules.length && (
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-center text-sm text-on-surface-variant">
            Keine Rechte für die aktuelle Filterung gefunden.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
            <Check size={14} />
            {effectiveCount} effektiv
          </span>
          <span className="text-emerald-700 dark:text-emerald-300">
            <strong>{granted.length}</strong> zusätzlich
          </span>
          <span className="text-red-700 dark:text-red-300">
            <strong>{revoked.length}</strong> entzogen
          </span>
          {roleOptions && (
            <label className="inline-flex items-center gap-2 font-medium text-on-surface-variant">
              Standard-Rolle
              <select
                className="field h-8 w-auto py-0 text-xs"
                value={role}
                onChange={(event) => onRoleChange(event.target.value)}
              >
                {roleOptions.map(([value, label]) => (
                  <option key={value} value={value} disabled={value === 'ADMIN' && !canGrantAdmin}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          type="button"
          className="btn-secondary min-h-9 px-3 text-xs"
          onClick={onReset}
          disabled={totalOverrides === 0}
        >
          <RotateCcw size={14} />
          Overrides zurücksetzen
        </button>
      </div>
    </div>
  );
}
