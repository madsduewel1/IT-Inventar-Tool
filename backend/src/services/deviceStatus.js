// Gerätestatus der Assets. Der Wert wird am Gerät gespeichert (`Device.status`) und
// steuert Status-Pille, Listenfilter und Verfügbarkeit bei Ausleihen.
// Die Frontend-Variante mit den Farben liegt in
// frontend/src/components/deviceMeta.js – beide Listen müssen synchron bleiben.
const DEVICE_STATUSES = ['AVAILABLE', 'LOANED', 'RESERVED', 'LIMITED', 'DEFECT', 'MAINTENANCE', 'RETIRED'];

// „Eingeschränkt" und „Defekt" entstehen aus Tickets: Ein Ticket mit niedriger
// oder normaler Dringlichkeit schränkt ein Gerät nur ein, ein Ticket mit hoher
// oder kritischer Dringlichkeit macht es defekt. Siehe
// backend/src/services/deviceCondition.js.
const DEVICE_STATUS_LABELS = {
  AVAILABLE: 'Verfügbar',
  LOANED: 'Verliehen',
  RESERVED: 'Reserviert',
  LIMITED: 'Eingeschränkt',
  DEFECT: 'Defekt',
  MAINTENANCE: 'Wartung',
  RETIRED: 'Ausgemustert'
};

// Statuswerte, die aus einem Ticket resultieren und beim Schließen des Tickets
// wieder freigegeben werden können.
const CONDITION_STATUSES = ['LIMITED', 'DEFECT'];

const STATUS_ALIASES = {
  // deutsch
  verfügbar: 'AVAILABLE', verfuegbar: 'AVAILABLE', available: 'AVAILABLE',
  verliehen: 'LOANED', ausgeliehen: 'LOANED', loaned: 'LOANED',
  reserviert: 'RESERVED', reserved: 'RESERVED',
  eingeschränkt: 'LIMITED', eingeschraenkt: 'LIMITED', eingeschränkt: 'LIMITED', limited: 'LIMITED',
  defekt: 'DEFECT', defect: 'DEFECT',
  wartung: 'MAINTENANCE', maintenance: 'MAINTENANCE',
  ausgemustert: 'RETIRED', retired: 'RETIRED'
};

/**
 * Bringt einen Statuswert aus API oder CSV auf einen gültigen Gerätestatus.
 * Unbekannte Werte fallen auf `fallback` zurück (Default: „Verfügbar").
 */
function normalizeDeviceStatus(value, fallback = 'AVAILABLE') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const upper = raw.toUpperCase();
  if (DEVICE_STATUSES.includes(upper)) return upper;
  const alias = STATUS_ALIASES[raw.toLowerCase()];
  return alias || fallback;
}

function deviceStatusLabel(value) {
  return DEVICE_STATUS_LABELS[normalizeDeviceStatus(value)];
}

module.exports = {
  DEVICE_STATUSES,
  DEVICE_STATUS_LABELS,
  CONDITION_STATUSES,
  STATUS_ALIASES,
  normalizeDeviceStatus,
  deviceStatusLabel
};