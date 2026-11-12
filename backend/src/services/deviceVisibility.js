const prisma = require('../config/prisma');
const { hasPermission } = require('./permissions');

// Asset-Sichtbarkeit (Konzept „Mein Gerät", Abschnitt 4):
//   ALL   – alle Benutzer sehen das Gerät (Standard für Altbestand)
//   STAFF – nur IT und Administratoren
//   ADMIN – nur Administratoren
const VISIBILITY_VALUES = ['ALL', 'STAFF', 'ADMIN'];
const VISIBILITY_LEVEL = { ALL: 0, STAFF: 1, ADMIN: 2 };

function normalizeVisibility(value) {
  return VISIBILITY_VALUES.includes(value) ? value : 'ALL';
}

/** Sichtbarkeitsstufe des Benutzers: 0 = alle, 1 = IT, 2 = Administratoren. */
function visibilityLevel(user) {
  const role = user?.effectiveRole || user?.role || 'VIEWER';
  if (role === 'ADMIN' || hasPermission(user, 'ADMIN')) return 2;
  if (role === 'STAFF') return 1;
  return 0;
}

/** Prisma-Where-Fragment für gerätebezogene Abfragen. */
function visibilityWhere(user) {
  const level = visibilityLevel(user);
  if (level >= 2) return {};
  if (level === 1) return { visibility: { in: ['ALL', 'STAFF'] } };
  return { visibility: 'ALL' };
}

/** Darf der Benutzer dieses Gerät (Objekt aus der DB oder API) sehen? */
function canSeeDevice(user, device) {
  if (!device) return false;
  return visibilityLevel(user) >= VISIBILITY_LEVEL[normalizeVisibility(device.visibility)];
}

/** Eigenes aktives Leihverhältnis umgeht die Sichtbarkeitsfilterung. */
async function hasActiveLoan(userId, deviceId) {
  if (!userId || !deviceId) return false;
  const loan = await prisma.loan.findFirst({
    where: {
      deviceId,
      userId,
      status: { in: ['ACTIVE', 'OVERDUE'] },
      archivedAt: null
    },
    select: { id: true }
  });
  return Boolean(loan);
}

/** where-Objekt für verschachtelte Geräte-Relationen (z. B. Räume). */
function deviceIncludeWhere(user) {
  return visibilityWhere(user);
}

module.exports = {
  VISIBILITY_VALUES,
  normalizeVisibility,
  visibilityLevel,
  visibilityWhere,
  canSeeDevice,
  hasActiveLoan,
  deviceIncludeWhere
};
