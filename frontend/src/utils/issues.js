// Ticketbezogene Helfer, die von mehreren Seiten (Sidebar-Badge, Ticket-Board,
// Ticket-Detail) gebraucht werden.

export const OPEN_ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING'];

export function isOpenIssue(issue) {
  return OPEN_ISSUE_STATUSES.includes(issue?.status);
}

/**
 * Prüft, ob ein Ticket einer Person zugewiesen ist. Berücksichtigt sowohl die
 * Mehrfachzuweisung (`assignees`) als auch das ältere Einzelfeld (`assigneeId`).
 */
export function isAssignedTo(issue, userId) {
  if (!issue || !userId) return false;
  if (Array.isArray(issue.assignees) && issue.assignees.some((user) => user?.id === userId)) return true;
  if (Array.isArray(issue.assignments) && issue.assignments.some((entry) => entry?.userId === userId)) return true;
  return issue.assigneeId === userId;
}

/** Anzeigename eines Bearbeiters. */
export function assigneeName(user) {
  return user?.displayName || user?.username || 'Unbekannt';
}

/** „A, B und C" aus einer Liste von Anzeigenamen. */
export function joinNames(names) {
  const list = names.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}`;
}

/** Alle Bearbeiter-IDs eines Tickets (neu und alt). */
export function assigneeIds(issue) {
  const ids = new Set();
  if (Array.isArray(issue?.assignees)) issue.assignees.forEach((user) => user?.id && ids.add(user.id));
  if (Array.isArray(issue?.assignments)) issue.assignments.forEach((entry) => entry?.userId && ids.add(entry.userId));
  if (issue?.assigneeId) ids.add(issue.assigneeId);
  return [...ids];
}