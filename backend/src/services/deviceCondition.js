// Zustand eines Geräts aus seinen Tickets („Eingeschränkt"/„Defekt").
//
// Ein Ticket schränkt ein Gerät ein, es macht es nicht zwangsläufig unbrauchbar
// (Konzept „Mein Gerät", Abschnitte 16–19):
//   • Unwichtig, Normal, Störend → Gerät ist „EINGESCHRÄNKT"
//   • Kritisch                  → Gerät ist „DEFEKT"
// Welche Prioritäten zu welchem Zustand führen, ist in den Ticket-Einstellungen
// konfigurierbar (Settings `tickets.restrictedPriorities` /
// `tickets.defectPriorities`).
//
// Wichtig: Der Zustand wird immer aus allen offenen Tickets des Geräts neu
// berechnet. Dadurch stimmt er auch dann, wenn die Dringlichkeit eines Tickets
// nachträglich geändert wird oder das Ticket geschlossen wird.
const prisma = require('../config/prisma');
const { getSettingCached } = require('./settingsCache');
const { CONDITION_STATUSES } = require('./deviceStatus');
const { PRIORITY_ORDER, priorityLabel } = require('./issueMeta');

const OPEN_ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING'];
const ISSUE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

const SETTING_RESTRICTED = 'tickets.restrictedPriorities';
const SETTING_DEFECT = 'tickets.defectPriorities';
// Standard: alles außer „Kritisch" schränkt nur ein, nur „Kritisch" macht defekt.
const DEFAULT_RESTRICTED = 'LOW,NORMAL,HIGH';
const DEFAULT_DEFECT = 'CRITICAL';

// Statuswerte, aus denen heraus ein Ticket den Gerätezustand setzen darf.
// LOANED/MAINTENANCE/RETIRED bleiben unangetastet – ein ausgeliehenes Gerät wird
// durch ein Ticket nicht automatisch zum Defekt.
const OVERWRITABLE_STATUSES = ['AVAILABLE', 'RESERVED', ...CONDITION_STATUSES];

/** Liest eine Prioritätsliste aus den Einstellungen („LOW, NORMAL"). */
function parsePriorityList(value, fallback) {
  const entries = String(value ?? '')
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => ISSUE_PRIORITIES.includes(entry));
  if (entries.length === 0) {
    return String(fallback)
      .split(',')
      .map((entry) => entry.trim().toUpperCase())
      .filter((entry) => ISSUE_PRIORITIES.includes(entry));
  }
  return entries;
}

/** Prioritätsgruppen aus den Einstellungen; die Defekt-Gruppe hat Vorrang. */
async function loadConditionGroups() {
  const [defectRaw, restrictedRaw] = await Promise.all([
    getSettingCached(SETTING_DEFECT, DEFAULT_DEFECT),
    getSettingCached(SETTING_RESTRICTED, DEFAULT_RESTRICTED)
  ]);
  return {
    defect: parsePriorityList(defectRaw, DEFAULT_DEFECT),
    restricted: parsePriorityList(restrictedRaw, DEFAULT_RESTRICTED)
  };
}

/** Welcher Gerätezustand gehört zu einer Ticket-Priorität? */
async function conditionForPriority(priority) {
  const groups = await loadConditionGroups();
  return conditionFromGroups(groups, priority);
}

function conditionFromGroups(groups, priority) {
  const value = ISSUE_PRIORITIES.includes(priority) ? priority : 'NORMAL';
  if (groups.defect.includes(value)) return 'DEFECT';
  if (groups.restricted.includes(value)) return 'LIMITED';
  // Eine Priorität, die in keiner Gruppe steht, schränkt nur ein – nur
  // „Kritisch" gilt im Zweifel als defekt.
  return value === 'CRITICAL' ? 'DEFECT' : 'LIMITED';
}

/**
 * Berechnet den Zustand aller genannten Geräte neu aus ihren offenen Tickets und
 * schreibt ihn auf das Gerät. Ohne offenes Ticket wird ein Gerät, das nur wegen
 * eines Tickets eingeschränkt oder defekt ist, wieder verfügbar.
 *
 * @param {string[]} deviceIds
 * @param {{ excludeIssueId?: string }} options Ticket, das nicht als offen zählt
 *        (wird beim Löschen eines Tickets gebraucht).
 * @returns {Promise<Map<string, string>>} Geräte-ID -> neuer Status (nur Änderungen)
 */
async function syncDeviceConditions(deviceIds, options = {}) {
  const ids = [...new Set((deviceIds || []).filter(Boolean))];
  const changes = new Map();
  if (ids.length === 0) return changes;

  const groups = await loadConditionGroups();
  const issues = await prisma.deviceIssue.findMany({
    where: {
      status: { in: OPEN_ISSUE_STATUSES },
      deletedAt: null,
      ...(options.excludeIssueId ? { id: { not: options.excludeIssueId } } : {}),
      OR: [{ deviceId: { in: ids } }, { extraDevices: { some: { deviceId: { in: ids } } } }]
    },
    select: {
      priority: true,
      deviceId: true,
      extraDevices: { select: { deviceId: true } }
    }
  });

  // Stärkster Zustand je Gerät gewinnt: ein offenes Ticket mit hoher Dringlichkeit
  // macht das Gerät defekt, auch wenn ein weiteres Ticket es nur einschränkt.
  const conditions = new Map();
  for (const issue of issues) {
    const condition = conditionFromGroups(groups, issue.priority);
    const affected = new Set([issue.deviceId, ...issue.extraDevices.map((link) => link.deviceId)]);
    for (const deviceId of affected) {
      if (!deviceId) continue;
      const current = conditions.get(deviceId);
      if (current !== 'DEFECT') conditions.set(deviceId, condition);
    }
  }

  const devices = await prisma.device.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, statusLocked: true }
  });

  for (const device of devices) {
    // Manuell gesetzter Status bleibt vor automatischen Ticket-Änderungen
    // geschützt, bis die Sperre im Gerät ausdrücklich aufgehoben wird.
    if (device.statusLocked) continue;
    const condition = conditions.get(device.id) || null;
    if (!condition) {
      // Kein offenes Ticket mehr: einen rein ticketbedingten Zustand auflösen.
      if (!CONDITION_STATUSES.includes(device.status)) continue;
      await prisma.device.update({ where: { id: device.id }, data: { status: 'AVAILABLE' } });
      changes.set(device.id, 'AVAILABLE');
      continue;
    }
    if (!OVERWRITABLE_STATUSES.includes(device.status)) continue;
    if (device.status === condition) continue;
    await prisma.device.update({ where: { id: device.id }, data: { status: condition } });
    changes.set(device.id, condition);
  }

  return changes;
}

/**
 * Anzeige-Zusammenfassung des Gerätezustands für „Mein Gerät" und die
 * Asset-Detailseite (Konzept Abschnitte 19/20): nicht nur „defekt", sondern
 * mit der konkreten Ursache – den offenen Tickets des Geräts.
 *
 * @param {{ status?: string }} device
 * @param {Array<{ id, title, priority, status, description, createdAt }>} issues
 *        Offene Tickets des Geräts (Typ `openIssues` aus der Gerät-Abfrage).
 */
function conditionSummary(device, issues = []) {
  const state = CONDITION_STATUSES.includes(device?.status) ? device.status : null;
  const open = [...(issues || [])]
    .filter((issue) => OPEN_ISSUE_STATUSES.includes(issue.status))
    .sort((a, b) => (PRIORITY_ORDER[b.priority] ?? 1) - (PRIORITY_ORDER[a.priority] ?? 1));

  return {
    state,
    headline: state === 'DEFECT'
      ? 'Gerät ist defekt'
      : state === 'LIMITED'
        ? 'Gerät ist eingeschränkt'
        : null,
    note: state === 'DEFECT' ? (device?.defectNote || null) : null,
    reasons: open.map((issue) => ({
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      priorityLabel: priorityLabel(issue.priority),
      status: issue.status,
      description: issue.description,
      createdAt: issue.createdAt
    }))
  };
}

module.exports = {
  OPEN_ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  SETTING_RESTRICTED,
  SETTING_DEFECT,
  DEFAULT_RESTRICTED,
  DEFAULT_DEFECT,
  loadConditionGroups,
  conditionForPriority,
  conditionSummary,
  syncDeviceConditions
};