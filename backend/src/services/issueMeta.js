// Gemeinsame Ticket-Metadaten für Backend (Aktivitätsmeldungen, Zustands-
// anzeige, Mails) und Frontend. Spiegelbildlich zu
// frontend/src/components/issueMeta.js – beide Listen müssen synchron bleiben.
//
// Die Prioritätslabels ergeben zusammen mit den Gerätezuständen einen Sinn
// (Konzept „Mein Gerät", Abschnitte 16–19):
//   Unwichtig / Normal        → Gerät ist „Eingeschränkt"
//   Störend                   → Gerät ist „Eingeschränkt"
//   Kritisch                  → Gerät ist „Defekt"
// Welche Priorität zu welchem Zustand führt, bestimmen die Einstellungen
// `tickets.restrictedPriorities` / `tickets.defectPriorities`.
const ISSUE_PRIORITY_LABELS = {
  LOW: 'Unwichtig',
  NORMAL: 'Normal',
  HIGH: 'Störend',
  CRITICAL: 'Kritisch'
};

const ISSUE_STATUS_LABELS = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  WAITING: 'Warten auf Rückmeldung',
  CLOSED: 'Geschlossen'
};

const ISSUE_TYPE_LABELS = {
  DEVICE: 'Schulgerät',
  PERSONAL: 'Privat-/Dienstgerät',
  WLAN: 'WLAN / Netzwerk',
  SOFTWARE: 'Software'
};

/** Dringlichkeit der Priorität: höhere Zahl = dringender. */
const PRIORITY_ORDER = { LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 };

function priorityLabel(value) {
  return ISSUE_PRIORITY_LABELS[value] || ISSUE_PRIORITY_LABELS.NORMAL;
}

module.exports = {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_TYPE_LABELS,
  PRIORITY_ORDER,
  priorityLabel
};
