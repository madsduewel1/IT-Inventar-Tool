const prisma = require('../config/prisma');
const { enrichUserAccess, hasPermission } = require('./permissions');
const { syncDeviceConditions } = require('./deviceCondition');

// Status-Werte aus Bestandsdaten – beim Lesen/Schreiben auf CLOSED normalisiert
const LEGACY_STATUSES = ['DONE', 'REJECTED'];

// Tickets werden ausschließlich von IT (STAFF) und Administratoren bearbeitet.
// Normale Benutzer (VIEWER) sind daher keine gültigen Zuständigen und tauchen
// weder in der Auswahlliste auf noch lassen sie sich zuweisen.
const ASSIGNABLE_ROLES = new Set(['STAFF', 'ADMIN']);

/**
 * Filtert eine User-Liste auf die gültigen Ticket-Zuständigen. Maßgeblich ist
 * die effektive Rolle, damit SSO-Gruppen-Mappings und Einzelrechte berücksichtigt
 * werden und die Liste zur tatsächlichen Berechtigung passt.
 */
async function filterAssignableUsers(users) {
  if (!users?.length) return [];
  const enriched = await Promise.all(users.map((user) => enrichUserAccess(user)));
  return enriched.filter((user) => ASSIGNABLE_ROLES.has(user.effectiveRole || user.role || 'VIEWER'));
}

/**
 * Sammelt alle Geräte eines Tickets: das führende Gerät (`deviceId`) zuerst,
 * danach die weiteren Geräte aus der Verknüpfungstabelle. Duplikate werden
 * entfernt und nach Inventarnummer sortiert.
 */
function issueDevices(issue) {
  if (!issue) return [];
  const list = [];
  const push = (device) => {
    if (device && !list.some((d) => d.id === device.id)) list.push(device);
  };
  push(issue.device);
  (issue.extraDevices || []).forEach((link) => push(link.device));
  return list.sort((a, b) => (a.inventoryId || '').localeCompare(b.inventoryId || '', 'de'));
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeStatus(status) {
  return LEGACY_STATUSES.includes(status) ? 'CLOSED' : status;
}

/**
 * Normalisiert ein Ticket für die API: alte Status-Werte werden auf das neue
 * Statusmodell abgebildet, das attachments-Feld als Array und die betroffenen
 * Geräte als `devices`-Array ausgeliefert.
 */
function normalizeIssue(issue, options = {}) {
  if (!issue) return issue;
  const { extraDevices, assignments, internalNotes, ...rest } = issue;
  // Alle Bearbeiter als flache Liste. Der führende Bearbeiter (`assignee`) ist
  // immer enthalten, auch bei Altbeständen ohne Eintrag in `assignments`.
  const assignees = [];
  const pushAssignee = (user) => {
    if (!user?.id) return;
    if (!assignees.some((entry) => entry.id === user.id)) {
      assignees.push({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email
      });
    }
  };
  (assignments || []).forEach((entry) => pushAssignee(entry.user));
  pushAssignee(issue.assignee);

  const normalized = {
    ...rest,
    status: normalizeStatus(issue.status),
    attachments: parseJsonArray(issue.attachments),
    devices: issueDevices(issue),
    assignees
  };
  if (options.includeInternal && Array.isArray(internalNotes)) {
    normalized.internalNotes = internalNotes;
  }
  return normalized;
}

/**
 * Sammelt die betroffenen Bereichs-IDs eines Tickets (Geräte ohne Bereich
 * werden übersprungen). Grundlage der Bereichs-Bearbeiterrechte.
 */
function issueAreas(issue) {
  const ids = new Set();
  for (const device of issueDevices(issue)) {
    if (device?.areaId) ids.add(device.areaId);
  }
  return [...ids];
}

/**
 * Darf der Benutzer dieses Ticket bearbeiten (Status ändern, zuweisen,
 * kommentieren, schließen)?
 *
 * Konzept „Mein Gerät": Administratoren dürfen immer alles. IT-Mitarbeiter
 * dürfen nur Tickets bearbeiten, deren betroffene Geräte in Bereichen liegen,
 * in denen sie als Bearbeiter (AreaEditor) eingetragen sind. Bei mehreren
 * Geräten aus unterschiedlichen Bereichen reicht die Zugehörigkeit zu einem
 * der Bereiche. Tickets ohne betroffenen Bereich behalten die bisherige Regel
 * (alle IT dürfen bearbeiten).
 *
 * Zusätzlich gelten die Ticketart-Zuständigkeiten: Für Netzwerk-, Dienstgerät-
 * und Software-Tickets dürfen nur die eingetragenen Bearbeiter der Ticketart
 * das Ticket bearbeiten – sofern welche konfiguriert sind. Ohne Konfiguration
 * gilt die bisherige Regel (alle IT).
 */
async function canEditIssue(user, issue) {
  if (!user || !issue) return false;
  if (hasPermission(user, 'ADMIN')) return true;
  if (!hasPermission(user, 'ISSUE_MANAGE')) return false;

  // Ticketart-Zuständigkeiten (WLAN/PERSONAL/SOFTWARE): Sind für die Ticketart
  // Bearbeiter konfiguriert, nur diese. Schulgerät-Tickets (DEVICE) laufen
  // weiter über die Bereichs-Bearbeiter.
  if (issue.type && issue.type !== 'DEVICE') {
    const configured = await prisma.issueTypeEditor.count({ where: { type: issue.type } });
    if (configured > 0) {
      const editor = await prisma.issueTypeEditor.findFirst({
        where: { type: issue.type, userId: user.id },
        select: { type: true }
      });
      return editor !== null;
    }
  }

  const areaIds = issueAreas(issue);
  if (areaIds.length === 0) return true;
  const editors = await prisma.areaEditor.findMany({
    where: { userId: user.id, areaId: { in: areaIds } },
    select: { areaId: true }
  });
  return editors.length > 0;
}

/**
 * Ersetzt die Bearbeiter eines Tickets. Erwartet eine Liste von User-IDs;
 * leere Einträge werden entfernt. `DeviceIssue.assigneeId` zeigt danach auf den
 * ersten Bearbeiter (oder null), damit ältere Auswertungen weiter greifen.
 */
async function setIssueAssignees(issueId, userIds, tx = prisma) {
  const unique = [...new Set((userIds || []).filter((id) => typeof id === 'string' && id.trim()))];
  await tx.issueAssignee.deleteMany({ where: { issueId } });
  if (unique.length) {
    await tx.issueAssignee.createMany({
      data: unique.map((userId) => ({ issueId, userId })),
      skipDuplicates: true
    });
  }
  await tx.deviceIssue.update({ where: { id: issueId }, data: { assigneeId: unique[0] || null } });
  return unique;
}

/**
 * Löst eine Liste von User-IDs zu existierenden Benutzern auf, die Tickets auch
 * bearbeiten dürfen (IT/Admin). Fehlende IDs und Benutzer ohne entsprechende
 * Rolle werden stillschweigend verworfen – der Aufrufer erkennt das an der
 * abweichenden Anzahl.
 */
async function resolveAssigneeUsers(userIds, tx = prisma) {
  const unique = [...new Set((userIds || []).filter((id) => typeof id === 'string' && id.trim()))];
  if (unique.length === 0) return [];
  const users = await tx.user.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      ssoGroups: true,
      permissions: true,
      revokedPermissions: true
    }
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const found = unique.map((id) => byId.get(id)).filter(Boolean);
  return filterAssignableUsers(found);
}

/**
 * Liefert den kontextabhängigen Bezug eines Tickets (Gerät / Raum / Software)
 * für Listen, Mails und die Detailansicht.
 */
function contextLabel(issue) {
  if (!issue) return '';
  switch (issue.type) {
    case 'DEVICE':
      return devicesLabel(issueDevices(issue));
    case 'WLAN':
      return issue.room?.name || 'Raum unbekannt';
    case 'SOFTWARE':
      return issue.softwareName || 'Software unbekannt';
    default:
      return '';
  }
}

/**
 * Kurzbezug für eine Liste von Geräten: eine Inventarnummer bzw. bei mehreren
 * Geräten eine kompakte Liste („3 Geräte: INV-1, INV-2, INV-3 (+1)").
 */
function devicesLabel(devices, maxShown = 3) {
  if (devices.length === 0) return '';
  const labels = devices.map((d) => d.inventoryId || d.model).filter(Boolean);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  const rest = labels.length - maxShown;
  return `${labels.length} Geräte: ${labels.slice(0, maxShown).join(', ')}${rest > 0 ? ` (+${rest})` : ''}`;
}

/**
 * Löst eine Liste von Geräte-Angaben (IDs oder Inventarnummern) zu echten
 * Datensätzen auf. Duplikate werden entfernt, die Reihenfolge bleibt erhalten.
 */
async function resolveDevices(values) {
  const unique = [...new Set((Array.isArray(values) ? values : [values]).filter((v) => typeof v === 'string' && v.trim()))];
  if (unique.length === 0) return [];
  const devices = await prisma.device.findMany({
    where: { OR: unique.flatMap((value) => [{ id: value }, { inventoryId: value }]) }
  });
  const byKey = new Map();
  for (const device of devices) {
    byKey.set(device.id, device);
    byKey.set(device.inventoryId, device);
  }
  return unique.map((value) => byKey.get(value)).filter(Boolean);
}

/**
 * Berechnet den Zustand der Geräte eines Tickets neu: Solange das Ticket offen
 * ist, bleiben die betroffenen Geräte je nach Dringlichkeit „Eingeschränkt"
 * oder „Defekt"; wird es geschlossen (oder gelöscht), werden sie wieder
 * verfügbar – sofern kein weiteres offenes Ticket für dasselbe Gerät existiert.
 * Berücksichtigt werden das führende Gerät (`deviceId`) und die weiteren Geräte
 * eines Tickets.
 */
async function syncDevicesForIssue(deviceIds, excludeIssueId = null) {
  const ids = [...new Set((deviceIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  // Beim Schließen ist das Ticket selbst schon geschlossen und zählt nicht mehr.
  // Beim Löschen muss es ausdrücklich herausfallen – sonst würde es noch als
  // offenes Ticket mitgerechnet und das Gerät bliebe dauerhaft gesperrt.
  return syncDeviceConditions(ids, { excludeIssueId: excludeIssueId || undefined });
}

/**
 * Gemeinsame Include-Definition für alle Ticket-Abfragen (inkl. Geräten).
 */
const ISSUE_INCLUDE = {
  device: { include: { room: true } },
  extraDevices: { include: { device: { include: { room: true } } } },
  room: true,
  reporter: { select: { id: true, username: true, displayName: true, email: true } },
  assignee: { select: { id: true, username: true, displayName: true, email: true } },
  primaryAssignee: { select: { id: true, username: true, displayName: true, email: true } },
  assignments: {
    include: { user: { select: { id: true, username: true, displayName: true, email: true } } },
    orderBy: { assignedAt: 'asc' }
  },
  comments: {
    include: { user: { select: { id: true, username: true, displayName: true, role: true } } },
    orderBy: { createdAt: 'asc' }
  },
  activities: {
    include: { user: { select: { id: true, username: true, displayName: true, role: true } } },
    orderBy: { createdAt: 'asc' }
  },
  internalNotes: {
    include: { user: { select: { id: true, username: true, displayName: true, role: true } } },
    orderBy: { createdAt: 'asc' }
  }
};

module.exports = {
  ASSIGNABLE_ROLES,
  LEGACY_STATUSES,
  ISSUE_INCLUDE,
  canEditIssue,
  issueAreas,
  contextLabel,
  devicesLabel,
  issueDevices,
  normalizeIssue,
  normalizeStatus,
  setIssueAssignees,
  resolveAssigneeUsers,
  filterAssignableUsers,
  syncDevicesForIssue,
  resolveDevices
};
