// Gerätearten der Assets. Der Wert wird am Gerät gespeichert (`Device.category`)
// und steuert das Symbol in Listen und Detailansichten sowie die Auswahl in den
// Geräteformularen. Die Frontend-Variante liegt spiegelbildlich in
// frontend/src/components/deviceMeta.js – beide Listen müssen synchron bleiben.
const DEVICE_CATEGORIES = [
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

const CATEGORY_VALUES = new Set(DEVICE_CATEGORIES.map((entry) => entry.value));
const DEFAULT_CATEGORY = 'OTHER';

const CATEGORY_LABELS = Object.fromEntries(DEVICE_CATEGORIES.map((entry) => [entry.value, entry.label]));

// Spiegelschlüssel für den CSV-Import: Schlüssel wie „laptop" oder die
// deutsche Bezeichnung „Laptop" führen zur selben Geräteart.
const CATEGORY_ALIASES = {};
for (const entry of DEVICE_CATEGORIES) {
  CATEGORY_ALIASES[entry.value.toLowerCase()] = entry.value;
  CATEGORY_ALIASES[entry.label.toLowerCase()] = entry.value;
}
// Gebräuchliche Schreibweisen aus Bestandsdaten/CSV.
Object.assign(CATEGORY_ALIASES, {
  pc: 'DESKTOP',
  desktop: 'DESKTOP',
  computer: 'DESKTOP',
  'desktop-pc': 'DESKTOP',
  notebook: 'LAPTOP',
  ipad: 'TABLET',
  tabletpc: 'TABLET',
  monitor: 'DISPLAY',
  screen: 'DISPLAY',
  beamer: 'PROJECTOR',
  projector: 'PROJECTOR',
  display: 'PROJECTOR',
  lautsprecher: 'AUDIO',
  speaker: 'AUDIO',
  audio: 'AUDIO',
  mikrofon: 'AUDIO',
  headset: 'AUDIO',
  drucker: 'PRINTER',
  printer: 'PRINTER',
  scanner: 'PRINTER',
  multifunktionsgerät: 'PRINTER',
  multifunktionsgeraet: 'PRINTER',
  server: 'SERVER',
  nas: 'STORAGE',
  speicher: 'STORAGE',
  storage: 'STORAGE',
  switch: 'SWITCH',
  netzwerk: 'SWITCH',
  'network-switch': 'SWITCH',
  router: 'ROUTER',
  accesspoint: 'ROUTER',
  'access-point': 'ROUTER',
  ap: 'ROUTER',
  wlan: 'ROUTER',
  telefon: 'PHONE',
  smartphone: 'PHONE',
  handy: 'PHONE',
  phone: 'PHONE',
  webcam: 'CAMERA',
  kamera: 'CAMERA',
  camera: 'CAMERA',
  zubehör: 'ACCESSORY',
  zubehoer: 'ACCESSORY',
  accessory: 'ACCESSORY',
  kabel: 'ACCESSORY',
  cable: 'ACCESSORY',
  usb: 'ACCESSORY',
  sonstiges: 'OTHER',
  other: 'OTHER',
  andere: 'OTHER'
});

/**
 * Bringt einen beliebigen Wert auf eine gültige Geräteart. Unbekannte oder leere
 * Werte werden zu „Sonstiges", damit nie ein leeres Symbol entsteht.
 */
function normalizeCategory(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  return CATEGORY_VALUES.has(raw) ? raw : DEFAULT_CATEGORY;
}

/** Wie `normalizeCategory`, lässt aber `null`/`''` zu (Gerät ohne Geräteart). */
function optionalCategory(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  return CATEGORY_VALUES.has(raw) ? raw : null;
}

function categoryLabel(value) {
  return CATEGORY_LABELS[normalizeCategory(value)];
}

/**
 * Liest eine Geräteart aus Freitext – für den CSV-Import und den
 * Mailimport. Akzeptiert den internen Wert („LAPTOP"), die deutsche
 * Bezeichnung („Laptop / Notebook") und gängige Schreibweisen („Notebook").
 * Unbekanntes wird zu „Sonstiges".
 */
function parseCategory(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_CATEGORY;
  return CATEGORY_ALIASES[raw.toLowerCase()] || normalizeCategory(raw);
}

module.exports = {
  DEVICE_CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_CATEGORY,
  normalizeCategory,
  optionalCategory,
  parseCategory,
  categoryLabel
};