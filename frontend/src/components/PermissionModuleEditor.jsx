import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

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

// Modularer Berechtigungskatalog – gespiegelt von permissions.js (Backend)
export const PERMISSION_MODULES = [
  {
    module: 'Geräte',
    icon: '📱',
    permissions: [
      { id: 'DEVICE_VIEW',   name: 'Geräte ansehen',   description: 'Geräte ansehen und suchen' },
      { id: 'DEVICE_CREATE', name: 'Geräte anlegen',    description: 'Neue Geräte anlegen und importieren' },
      { id: 'DEVICE_EDIT',   name: 'Geräte bearbeiten', description: 'Gerätedaten und Status bearbeiten' },
      { id: 'DEVICE_DELETE', name: 'Geräte löschen',    description: 'Geräte aus dem System löschen' }
    ]
  },
  {
    module: 'Ausleihen',
    icon: '📋',
    permissions: [
      { id: 'LOAN_VIEW',   name: 'Ausleihen ansehen',  description: 'Ausleihen und Historie einsehen' },
      { id: 'LOAN_CREATE', name: 'Ausleihe anfragen',  description: 'Neue Ausleihe anfragen oder eintragen' },
      { id: 'LOAN_MANAGE', name: 'Ausleihen verwalten',description: 'Ausleihen genehmigen, bearbeiten und zurücknehmen' },
      { id: 'LOAN_DELETE', name: 'Ausleihen löschen',  description: 'Ausleihvorgänge löschen' }
    ]
  },
  {
    module: 'Tickets & Fehler',
    icon: '🎫',
    permissions: [
      { id: 'ISSUE_VIEW',   name: 'Tickets ansehen',   description: 'Tickets ansehen' },
      { id: 'ISSUE_CREATE', name: 'Tickets erstellen', description: 'Neue Fehler melden und Tickets erstellen' },
      { id: 'ISSUE_MANAGE', name: 'Tickets verwalten', description: 'Tickets bearbeiten, zuweisen und schließen' },
      { id: 'ISSUE_DELETE', name: 'Tickets löschen',   description: 'Tickets löschen' }
    ]
  },
  {
    module: 'Räume & Orte',
    icon: '🏫',
    permissions: [
      { id: 'ROOM_VIEW',   name: 'Räume ansehen',   description: 'Räume und Standorte ansehen' },
      { id: 'ROOM_CREATE', name: 'Räume anlegen',   description: 'Neue Räume anlegen' },
      { id: 'ROOM_EDIT',   name: 'Räume bearbeiten',description: 'Raumdaten bearbeiten' },
      { id: 'ROOM_DELETE', name: 'Räume löschen',    description: 'Räume löschen' }
    ]
  },
  {
    module: 'Gerätebereiche',
    icon: '🗂️',
    permissions: [
      { id: 'AREA_VIEW',   name: 'Bereiche ansehen',   description: 'Gerätebereiche und Mitglieder ansehen' },
      { id: 'AREA_MANAGE', name: 'Bereiche verwalten', description: 'Bereiche anlegen, bearbeiten und Mitglieder zuweisen' }
    ]
  },
  {
    module: 'Benutzer & Rechte',
    icon: '👥',
    permissions: [
      { id: 'USER_VIEW',   name: 'Benutzer ansehen',   description: 'Benutzerliste ansehen' },
      { id: 'USER_MANAGE', name: 'Benutzer verwalten', description: 'Benutzerkonten anlegen und Rechte verwalten' }
    ]
  },
  {
    module: 'Geräte-Updates',
    icon: '🔄',
    permissions: [
      { id: 'UPDATE_VIEW',   name: 'Updates ansehen',  description: 'Update-Durchläufe ansehen' },
      { id: 'UPDATE_MANAGE', name: 'Updates verwalten',description: 'Update-Durchläufe erstellen und Ergebnisse eintragen' }
    ]
  },
  {
    module: 'System & Einstellungen',
    icon: '⚙️',
    permissions: [
      { id: 'SETTINGS_MANAGE', name: 'Einstellungen verwalten', description: 'Organisation, SSO und Systemeinstellungen' },
      { id: 'MAIL_MANAGE',     name: 'Mail verwalten',           description: 'Mail-Konfiguration, Status und Mail-Logs' },
      { id: 'ADMIN',           name: 'System-Administration',    description: 'Vollzugriff auf alle Systembereiche' }
    ]
  }
];

/**
 * Inline-Berechtigungseditor als Vollseite (kein Modal).
 *
 * props:
 *  entity: { name, subtitle?, role, effectiveRole?, permissions, revokedPermissions }
 *  granted / revoked / role: kontrollierter State (vom übergeordneten Formular verwaltet)
 *  roleOptions: Array<[value, label]> | null – zeigt einen Rollen-Selektor an, wenn gesetzt
 *  onChangeState(permissionId): cycle durch Standard → Erteilt → Entzogen
 *  onRoleChange(role)
 *  onReset(): alle Overrides zurücksetzen
 */
export default function PermissionModuleEditor({ entity, roleOptions = null, granted, revoked, role, onChangeState, onRoleChange, onReset }) {
  const [expandedModules, setExpandedModules] = useState(
    Object.fromEntries(PERMISSION_MODULES.map(m => [m.module, true]))
  );

  function getState(permId) {
    if (granted.includes(permId)) return 'granted';
    if (revoked.includes(permId)) return 'revoked';
    return 'default';
  }

  function toggleModule(moduleName) {
    setExpandedModules(prev => ({ ...prev, [moduleName]: !prev[moduleName] }));
  }

  const totalOverrides = granted.length + revoked.length;

  return (
    <div className="space-y-3">
      {/* Legende */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-[#fafafa] border border-black/5 px-4 py-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-gray-600">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-gray-400 text-[10px]">–</span>
          Standard (Rollen-Vorgabe)
        </div>
        <div className="flex items-center gap-1.5 font-medium text-green-700">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-green-500 text-white text-[10px] font-bold">+</span>
          Zusätzlich erteilen
        </div>
        <div className="flex items-center gap-1.5 font-medium text-red-700">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-red-500 text-white text-[10px] font-bold">–</span>
          Gezielt entziehen
        </div>
        <span className="ml-auto text-gray-400 text-[10px]">Zum Umschalten klicken: Standard → Erteilt → Entzogen</span>
      </div>

      {/* Modularer Berechtigungseditor */}
      <div className="space-y-2">
        {PERMISSION_MODULES.map(({ module, icon, permissions }) => {
          const isExpanded = expandedModules[module] !== false;
          const moduleGranted = permissions.filter(p => granted.includes(p.id)).length;
          const moduleRevoked = permissions.filter(p => revoked.includes(p.id)).length;

          return (
            <div key={module} className="rounded-xl border border-black/8 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleModule(module)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#fafafa] hover:bg-gray-100 transition text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{icon}</span>
                  <span className="font-semibold text-gray-700 text-sm">{module}</span>
                  {(moduleGranted > 0 || moduleRevoked > 0) && (
                    <div className="flex gap-1">
                      {moduleGranted > 0 && <span className="text-[10px] rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 font-bold">+{moduleGranted}</span>}
                      {moduleRevoked > 0 && <span className="text-[10px] rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 font-bold">–{moduleRevoked}</span>}
                    </div>
                  )}
                </div>
                {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
              </button>

              {isExpanded && (
                <div className="divide-y divide-black/5">
                  {permissions.map(({ id, name, description }) => {
                    const state = getState(id);
                    return (
                      <div
                        key={id}
                        className={`flex items-center justify-between px-4 py-2.5 transition cursor-pointer select-none ${
                          state === 'granted' ? 'bg-green-50' :
                          state === 'revoked' ? 'bg-red-50' : 'bg-white hover:bg-gray-50'
                        }`}
                        onClick={() => onChangeState(id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${
                            state === 'granted' ? 'text-green-800' :
                            state === 'revoked' ? 'text-red-800' : 'text-gray-700'
                          }`}>{name}</div>
                          <div className="text-[11px] text-gray-400 truncate">{description}</div>
                        </div>
                        <div className="ml-4 flex-shrink-0">
                          {state === 'default' && (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-gray-300 text-xs">–</span>
                          )}
                          {state === 'granted' && (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-green-500 text-white text-xs font-bold">+</span>
                          )}
                          {state === 'revoked' && (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-red-500 text-white text-xs font-bold">–</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fußleiste mit Reset */}
      <div className="flex items-center justify-between rounded-xl border border-black/5 bg-[#fafafa] px-4 py-3">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="text-blue-600"><strong>{granted.length}</strong> erteilt</span>
          <span className="text-red-600"><strong>{revoked.length}</strong> entzogen</span>
          {roleOptions && (
            <span className="flex items-center gap-2 font-medium text-gray-600">
              Standard-Rolle
              <select
                className="rounded-xl border border-black/10 bg-white px-2 py-1 text-xs"
                value={role}
                onChange={(event) => onRoleChange(event.target.value)}
              >
                {roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </span>
          )}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600 transition"
          onClick={onReset}
          disabled={totalOverrides === 0}
        >
          <RotateCcw size={13} />
          Overrides zurücksetzen
        </button>
      </div>
    </div>
  );
}
