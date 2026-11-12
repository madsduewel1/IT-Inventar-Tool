// Symbole für Assets (Konzept „Mein Gerät", Abschnitt 24).
// Spiegelt backend/src/services/deviceIcons.js – beide Listen müssen synchron
// bleiben. Am Gerät gespeichert wird `Device.icon` (SWITCH|TABLET|LAPTOP|
// DESKTOP|PRINTER|SERVER); ist keins gesetzt, fällt das Symbol auf die
// Geräteart zurück (Fallback aus `Device.category`).
import { Cpu, Laptop, Monitor, Network, Printer, Server, Tablet } from 'lucide-react';

// Auswahl im Geräteformular – identisch zur Backend-Liste.
export const DEVICE_ICONS = [
  { value: 'SWITCH', label: 'Switch' },
  { value: 'TABLET', label: 'Tablet' },
  { value: 'LAPTOP', label: 'Laptop' },
  { value: 'DESKTOP', label: 'Desktop' },
  { value: 'PRINTER', label: 'Drucker' },
  { value: 'SERVER', label: 'Server' }
];

const ICON_META = {
  SWITCH: { Icon: Network, label: 'Switch', cls: 'text-emerald-500' },
  TABLET: { Icon: Tablet, label: 'Tablet', cls: 'text-violet-500' },
  LAPTOP: { Icon: Laptop, label: 'Laptop', cls: 'text-sky-500' },
  DESKTOP: { Icon: Monitor, label: 'Desktop', cls: 'text-blue-500' },
  PRINTER: { Icon: Printer, label: 'Drucker', cls: 'text-amber-500' },
  SERVER: { Icon: Server, label: 'Server', cls: 'text-rose-500' }
};

// Rückfall auf ein passendes Symbol der Geräteart (wie im Backend).
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

/** Wirklicher Symbolwert eines Geräts (explizit oder über die Geräteart). */
export function iconValueFor(device) {
  const explicit = String(device?.icon || '').trim().toUpperCase();
  if (ICON_META[explicit]) return explicit;
  const byCategory = ICON_BY_CATEGORY[String(device?.category || '').trim().toUpperCase()];
  return byCategory || null;
}

/**
 * Symbol-Props für ein Gerät:
 * `{ Icon, cls, label, value, explicit }` – `value: null` bedeutet generisches
 * Gerätesymbol (keine Geräteart mit eigenem Symbol).
 */
export function deviceIconProps(device) {
  const value = iconValueFor(device);
  const meta = value ? ICON_META[value] : null;
  return {
    value,
    explicit: Boolean(ICON_META[String(device?.icon || '').trim().toUpperCase()]),
    label: meta?.label || null,
    Icon: meta?.Icon || Cpu,
    cls: meta?.cls || 'text-on-surface-variant'
  };
}

/** Kompaktes Symbol für Listen, Detailseiten und „Mein Gerät". */
export default function DeviceIcon({ device, size = 18, className = '' }) {
  const { Icon, cls } = deviceIconProps(device);
  return <Icon size={size} className={`${cls} ${className}`.trim()} />;
}
