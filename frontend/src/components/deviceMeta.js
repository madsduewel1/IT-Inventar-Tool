// Gemeinsame Geräte-Metadaten für Listen, Detailansichten und „Mein Gerät".
// Spiegelt spiegelbildlich:
//   - backend/src/services/deviceCategories.js (Gerätearten)
//   - Statuswerte aus backend/prisma/schema.prisma (Device.status)
//   - Device.visibility (ALL | STAFF | ADMIN, Konzept Abschnitt 4)

export const DEVICE_CATEGORIES = [
  { value: 'DESKTOP', label: 'Desktop-Computer' },
  { value: 'LAPTOP', label: 'Laptop' },
  { value: 'TABLET', label: 'Tablet' },
  { value: 'DISPLAY', label: 'Monitor / Display' },
  { value: 'PRINTER', label: 'Drucker / Scanner' },
  { value: 'SERVER', label: 'Server' },
  { value: 'SWITCH', label: 'Switch / Netzwerk' },
  { value: 'ROUTER', label: 'Router / Access Point' },
  { value: 'PHONE', label: 'Telefon' },
  { value: 'PROJECTOR', label: 'Beamer / TV' },
  { value: 'AUDIO', label: 'Audio / Lautsprecher' },
  { value: 'CAMERA', label: 'Kamera' },
  { value: 'STORAGE', label: 'Speicher / NAS' },
  { value: 'ACCESSORY', label: 'Zubehör / Kabel' },
  { value: 'OTHER', label: 'Sonstiges' }
];

export const CATEGORY_LABELS = Object.fromEntries(
  DEVICE_CATEGORIES.map((entry) => [entry.value, entry.label])
);

export function categoryLabel(value) {
  return CATEGORY_LABELS[value] || value || '';
}

// Status des Assets. LIMITED („Eingeschränkt") ist die Zwischenstufe zwischen
// verfügbar und defekt und wird über offene Tickets gesetzt (Abschnitt 16).
export const DEVICE_STATUS = {
  AVAILABLE: { label: 'Verfügbar', badge: 'bg-badge-green text-text-badge-green', cls: 'status-pill--available' },
  LOANED: { label: 'Verliehen', badge: 'bg-badge-orange text-text-badge-orange', cls: 'status-pill--loaned' },
  RESERVED: { label: 'Reserviert', badge: 'bg-badge-yellow text-text-badge-yellow', cls: 'status-pill--reserved' },
  LIMITED: { label: 'Eingeschränkt', badge: 'bg-badge-orange text-text-badge-orange', cls: 'status-pill--limited' },
  DEFECT: { label: 'Defekt', badge: 'bg-badge-red text-text-badge-red', cls: 'status-pill--defect' },
  MAINTENANCE: { label: 'Wartung', badge: 'bg-surface-container-high text-on-surface-variant', cls: 'status-pill--maintenance' },
  RETIRED: { label: 'Ausgemustert', badge: 'bg-surface-container-high text-outline', cls: 'status-pill--retired' }
};

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(DEVICE_STATUS).map(([key, meta]) => [key, meta.label])
);

// Tupel [label, badge] für bestehende Tabellen-/Filter-Abbildungen.
export const STATUS_BADGES = Object.fromEntries(
  Object.entries(DEVICE_STATUS).map(([key, meta]) => [key, [meta.label, meta.badge]])
);

export function statusMeta(status) {
  return DEVICE_STATUS[status] || DEVICE_STATUS.AVAILABLE;
}

export function statusLabel(status) {
  return statusMeta(status).label;
}

// Sichtbarkeit des Assets: wer das Gerät in Listen sehen darf.
export const VISIBILITY_LABELS = {
  ALL: 'Alle Benutzer',
  STAFF: 'IT und Administratoren',
  ADMIN: 'Nur Administratoren'
};

export function visibilityLabel(value) {
  if (VISIBILITY_LABELS[value]) return VISIBILITY_LABELS[value];
  const raw = String(value || '').toLowerCase();
  const match = Object.entries(VISIBILITY_LABELS).find(([key, label]) => key.toLowerCase() === raw || label.toLowerCase() === raw);
  return match?.[1] || VISIBILITY_LABELS.ALL;
}
