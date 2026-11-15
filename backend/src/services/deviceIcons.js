// Explizit wählbare Symbole für Assets (Konzept „Mein Gerät", Abschnitt 24).
// Der Wert wird am Gerät gespeichert (`Device.icon`). Ist keiner gesetzt,
// leitet das Frontend das Symbol aus der Geräteart ab (iconForCategory).
// Die Frontend-Variante liegt spiegelbildlich in
// frontend/src/components/deviceIcons.jsx – beide Listen müssen synchron bleiben.
const DEVICE_ICONS = [
  { value: 'SWITCH', label: 'Switch' },
  { value: 'TABLET', label: 'Tablet' },
  { value: 'LAPTOP', label: 'Laptop' },
  { value: 'DESKTOP', label: 'Desktop' },
  { value: 'PRINTER', label: 'Drucker' },
  { value: 'SERVER', label: 'Server' }
];

const ICON_VALUES = new Set(DEVICE_ICONS.map((entry) => entry.value));
const ICON_LABELS = Object.fromEntries(DEVICE_ICONS.map((entry) => [entry.value, entry.label]));

// Rückfall auf ein passendes Symbol, wenn am Gerät kein explizites Symbol
// hinterlegt ist. Gerätearten ohne eigenes Symbol liefern null – das Frontend
// zeigt dann ein generisches Gerät-Symbol.
const ICON_BY_CATEGORY = {
  SWITCH: 'SWITCH',
  ROUTER: 'SWITCH',
  TABLET: 'TABLET',
  PHONE: 'TABLET',
  LAPTOP: 'LAPTOP',
  DESKTOP: 'DESKTOP',
  DISPLAY: 'DESKTOP',
  PRINTER: 'PRINTER',
  SERVER: 'SERVER',
  STORAGE: 'SERVER'
};

const ICON_ALIASES = Object.fromEntries(
  DEVICE_ICONS.flatMap((entry) => [[entry.value.toLowerCase(), entry.value], [entry.label.toLowerCase(), entry.value]])
);
Object.assign(ICON_ALIASES, { drucker: 'PRINTER', printer: 'PRINTER' });

/** Gültiges Symbol, sonst null (kein Symbol = Standard). */
function normalizeIcon(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return ICON_VALUES.has(upper) ? upper : ICON_ALIASES[raw.toLowerCase()] || null;
}

/** Passendes Standardsymbol der Geräteart oder null. */
function iconForCategory(category) {
  const raw = String(category ?? '').trim().toUpperCase();
  return ICON_BY_CATEGORY[raw] || null;
}

module.exports = {
  DEVICE_ICONS,
  ICON_LABELS,
  normalizeIcon,
  iconForCategory
};
