const { getSettingCached } = require('./settingsCache');

const ROLE_ORDER = ['VIEWER', 'STAFF', 'ADMIN'];

// Vollständiger, modularer Berechtigungskatalog
const ALL_PERMISSIONS = [
  // Geräte (Devices)
  { id: 'DEVICE_VIEW',   name: 'Geräte ansehen',    module: 'Geräte',          description: 'Geräte ansehen und suchen' },
  { id: 'DEVICE_CREATE', name: 'Geräte anlegen',     module: 'Geräte',          description: 'Neue Geräte anlegen und importieren' },
  { id: 'DEVICE_EDIT',   name: 'Geräte bearbeiten',  module: 'Geräte',          description: 'Gerätedaten und Status bearbeiten' },
  { id: 'DEVICE_DELETE', name: 'Geräte löschen',     module: 'Geräte',          description: 'Geräte aus dem System löschen' },

  // Ausleihen (Loans)
  { id: 'LOAN_VIEW',     name: 'Ausleihen ansehen',  module: 'Ausleihen',       description: 'Ausleihen und Histoire einsehen' },
  { id: 'LOAN_CREATE',   name: 'Ausleihe anfragen',  module: 'Ausleihen',       description: 'Neue Ausleihe anfragen oder eintragen' },
  { id: 'LOAN_MANAGE',   name: 'Ausleihen verwalten',module: 'Ausleihen',       description: 'Ausleihen genehmigen, bearbeiten und zurücknehmen' },
  { id: 'LOAN_DELETE',   name: 'Ausleihen löschen',  module: 'Ausleihen',       description: 'Ausleihvorgänge stornieren und löschen' },

  // Tickets (Issues)
  { id: 'ISSUE_VIEW',    name: 'Tickets ansehen',    module: 'Tickets',         description: 'Tickets ansehen' },
  { id: 'ISSUE_CREATE',  name: 'Tickets erstellen',  module: 'Tickets',         description: 'Neue Fehler melden und Tickets erstellen' },
  { id: 'ISSUE_MANAGE',  name: 'Tickets verwalten',  module: 'Tickets',         description: 'Tickets bearbeiten, zuweisen, kommentieren und schließen' },
  { id: 'ISSUE_DELETE',  name: 'Tickets löschen',    module: 'Tickets',         description: 'Tickets löschen' },

  // Räume (Rooms)
  { id: 'ROOM_VIEW',     name: 'Räume ansehen',      module: 'Räume',           description: 'Räume und Standorte ansehen' },
  { id: 'ROOM_CREATE',   name: 'Räume anlegen',      module: 'Räume',           description: 'Neue Räume anlegen' },
  { id: 'ROOM_EDIT',     name: 'Räume bearbeiten',   module: 'Räume',           description: 'Raumdaten bearbeiten' },
  { id: 'ROOM_DELETE',   name: 'Räume löschen',      module: 'Räume',           description: 'Räume löschen' },

  // Gerätebereiche (Areas)
  { id: 'AREA_VIEW',     name: 'Bereiche ansehen',   module: 'Gerätebereiche',  description: 'Gerätebereiche und Mitglieder ansehen' },
  { id: 'AREA_MANAGE',   name: 'Bereiche verwalten', module: 'Gerätebereiche',  description: 'Gerätebereiche anlegen, bearbeiten und Mitglieder zuweisen' },

  // Benutzer (Users)
  { id: 'USER_VIEW',     name: 'Benutzer ansehen',   module: 'Benutzer',        description: 'Benutzerliste ansehen' },
  { id: 'USER_MANAGE',   name: 'Benutzer verwalten', module: 'Benutzer',        description: 'Benutzerkonten anlegen, bearbeiten und Rechte verwalten' },

  // Geräte-Updates
  { id: 'UPDATE_VIEW',   name: 'Updates ansehen',    module: 'Geräte-Updates',  description: 'Update-Durchläufe ansehen' },
  { id: 'UPDATE_MANAGE', name: 'Updates verwalten',  module: 'Geräte-Updates',  description: 'Update-Durchläufe erstellen und Ergebnisse eintragen' },

  // Ticket-System
  { id: 'TEMPLATE_MANAGE', name: 'Ticket-Vorlagen verwalten', module: 'Ticket-System', description: 'Ticket-Vorlagen anlegen, bearbeiten und zuordnen' },

  // System & Einstellungen
  { id: 'SETTINGS_MANAGE', name: 'Einstellungen verwalten', module: 'System', description: 'Organisation, SSO, Embedding und Systemeinstellungen bearbeiten' },
  { id: 'MAIL_MANAGE',     name: 'Mail verwalten',          module: 'System', description: 'Mail-Konfiguration, Status und Mail-Logs verwalten' },
  { id: 'ADMIN',           name: 'System-Administration',   module: 'System', description: 'Vollzugriff auf Systemeinstellungen, Benutzer und Logs' }
];

const ROLE_PERMISSIONS = {
  VIEWER: [
    'DEVICE_VIEW', 'LOAN_VIEW', 'LOAN_CREATE', 'ISSUE_VIEW', 'ISSUE_CREATE', 'ROOM_VIEW',
    'AREA_VIEW'
  ],
  STAFF: [
    'DEVICE_VIEW', 'DEVICE_CREATE', 'DEVICE_EDIT',
    'LOAN_VIEW', 'LOAN_CREATE', 'LOAN_MANAGE', 'LOAN_DELETE',
    'ISSUE_VIEW', 'ISSUE_CREATE', 'ISSUE_MANAGE', 'ISSUE_DELETE',
    'ROOM_VIEW', 'ROOM_CREATE', 'ROOM_EDIT',
    'AREA_VIEW',
    'USER_VIEW',
    'UPDATE_VIEW', 'UPDATE_MANAGE'
  ],
  ADMIN: [
    'DEVICE_VIEW', 'DEVICE_CREATE', 'DEVICE_EDIT', 'DEVICE_DELETE',
    'LOAN_VIEW', 'LOAN_CREATE', 'LOAN_MANAGE', 'LOAN_DELETE',
    'ISSUE_VIEW', 'ISSUE_CREATE', 'ISSUE_MANAGE', 'ISSUE_DELETE',
    'ROOM_VIEW', 'ROOM_CREATE', 'ROOM_EDIT', 'ROOM_DELETE',
    'AREA_VIEW', 'AREA_MANAGE',
    'USER_VIEW', 'USER_MANAGE',
    'UPDATE_VIEW', 'UPDATE_MANAGE',
    'TEMPLATE_MANAGE',
    'SETTINGS_MANAGE', 'MAIL_MANAGE',
    'ADMIN'
  ]
};

function parseJson(value, fallback) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeGroups(value) {
  // Einzelner String (kein JSON-Array) wird direkt in ein Array umgewandelt
  if (typeof value === 'string' && value && !value.startsWith('[')) {
    return [value];
  }
  return parseJson(value, []).filter(Boolean).map(String);
}

function normalizePermissions(value) {
  return parseJson(value, []).filter(Boolean).map(String);
}

function normalizeMappings(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function strongestRole(current, next) {
  return ROLE_ORDER.indexOf(next) > ROLE_ORDER.indexOf(current) ? next : current;
}

async function getGroupMappings() {
  const value = await getSettingCached('sso.groupMappings');
  return normalizeMappings(value);
}

async function enrichUserAccess(user) {
  if (!user) return user;

  const ssoGroups = normalizeGroups(user.ssoGroups);
  const isSsoUser = ssoGroups.length > 0;

  // Für SSO-Benutzer wird die Rolle über Gruppen-Mappings bestimmt
  let effectiveRole = isSsoUser ? 'VIEWER' : (user.role || 'VIEWER');
  
  // Mappings laden
  const mappings = await getGroupMappings();

  // 1. Rollen-Bestimmung über Gruppen
  for (const mapping of mappings) {
    if (!mapping?.group || !ssoGroups.includes(mapping.group)) continue;
    if (mapping.role && ROLE_PERMISSIONS[mapping.role]) {
      effectiveRole = strongestRole(effectiveRole, mapping.role);
    }
  }

  // 2. Basis-Berechtigungen aus der effektiven Rolle
  const grantedPermissions = new Set(ROLE_PERMISSIONS[effectiveRole] || []);
  const revokedPermissions = new Set();

  // 3. SSO-Gruppen-Overrides anwenden (Zusatzrechte & entzogene Rechte)
  for (const mapping of mappings) {
    if (!mapping?.group || !ssoGroups.includes(mapping.group)) continue;
    
    if (mapping.role && ROLE_PERMISSIONS[mapping.role]) {
      for (const p of ROLE_PERMISSIONS[mapping.role]) grantedPermissions.add(p);
    }

    for (const p of mapping.permissions || []) {
      grantedPermissions.add(p);
    }
    for (const p of mapping.revokedPermissions || []) {
      revokedPermissions.add(p);
    }
  }

  // 4. Einzelbenutzer-Overrides anwenden (Zusatzrechte & entzogene Rechte aus User-Model)
  const userGranted = normalizePermissions(user.permissions);
  const userRevoked = normalizePermissions(user.revokedPermissions);

  for (const p of userGranted) grantedPermissions.add(p);
  for (const p of userRevoked) revokedPermissions.add(p);

  // 5. Final berechnete Berechtigungen (granted MINUS revoked)
  const effectivePermissions = Array.from(grantedPermissions).filter(p => !revokedPermissions.has(p));

  return {
    ...user,
    ssoGroups,
    role: effectiveRole,
    effectiveRole,
    permissions: userGranted,
    revokedPermissions: userRevoked,
    effectivePermissions
  };
}

function hasPermission(user, permission) {
  if (!user) return false;
  
  // ADMIN-Berechtigung überspringt alle Prüfungen (außer explizit entzogenen)
  const userRevoked = user.revokedPermissions || [];
  if (userRevoked.includes(permission)) {
    return false; // Explizit entzogen schlägt alles
  }

  const effectivePermissions = user.effectivePermissions || [];
  if (effectivePermissions.includes(permission)) {
    return true;
  }

  // ADMIN-Permission erlaubt alles (wenn nicht revoked)
  if (effectivePermissions.includes('ADMIN') && !userRevoked.includes(permission)) {
    return true;
  }

  if (user.effectiveRole === 'ADMIN' && !userRevoked.includes(permission)) {
    return true;
  }

  return false;
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: 'Keine Berechtigung', code: 'FORBIDDEN' });
    }
    return next();
  };
}

module.exports = {
  enrichUserAccess,
  hasPermission,
  requirePermission,
  normalizeGroups,
  normalizePermissions,
  normalizeMappings,
  getGroupMappings,
  strongestRole,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS
};