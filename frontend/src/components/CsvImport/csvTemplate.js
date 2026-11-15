import { categoryLabel, statusLabel, visibilityLabel, DEVICE_CATEGORIES, DEVICE_STATUS, VISIBILITY_LABELS } from '../deviceMeta';
import { DEVICE_ICONS } from '../deviceIcons';

const YES_NO_VALUES = ['ja', 'nein', 'yes', 'no', 'true', 'false', '1', '0'];
const CATEGORY_VALUES = new Set([
  ...DEVICE_CATEGORIES.map((entry) => entry.value.toLowerCase()),
  ...DEVICE_CATEGORIES.map((entry) => entry.label.toLowerCase()),
  'pc', 'computer', 'desktop-pc', 'notebook', 'ipad', 'tabletpc', 'monitor', 'screen',
  'display', 'beamer', 'projector', 'drucker', 'printer', 'scanner', 'multifunktionsgerät',
  'multifunktionsgeraet', 'nas', 'speicher', 'storage', 'switch', 'netzwerk',
  'network-switch', 'router', 'accesspoint', 'access-point', 'ap', 'wlan', 'telefon',
  'smartphone', 'handy', 'phone', 'webcam', 'kamera', 'camera', 'lautsprecher', 'speaker',
  'audio', 'mikrofon', 'headset', 'zubehör', 'zubehoer', 'accessory', 'kabel', 'cable',
  'usb', 'sonstiges', 'other', 'andere'
]);
const ICON_VALUES = new Set([
  ...DEVICE_ICONS.map((entry) => entry.value.toLowerCase()),
  ...DEVICE_ICONS.map((entry) => entry.label.toLowerCase()),
  'drucker', 'printer'
]);
const VISIBILITY_VALUES = new Set([
  ...Object.keys(VISIBILITY_LABELS).map((value) => value.toLowerCase()),
  ...Object.values(VISIBILITY_LABELS).map((label) => label.toLowerCase())
]);
const STATUS_VALUES = new Set([
  ...Object.keys(DEVICE_STATUS).map((value) => value.toLowerCase()),
  ...Object.values(DEVICE_STATUS).map((entry) => entry.label.toLowerCase()),
  'ausgeliehen', 'eingeschraenkt', 'eingeschränkt'
]);

const isYesNo = (value) => !value || YES_NO_VALUES.includes(value.toLowerCase());
const isCategory = (value) => !value || CATEGORY_VALUES.has(value.toLowerCase());
const isIcon = (value) => !value || ICON_VALUES.has(value.toLowerCase());
const isVisibility = (value) => !value || VISIBILITY_VALUES.has(value.toLowerCase());
const isStatus = (value) => !value || STATUS_VALUES.has(value.toLowerCase());

const ICON_LABELS = Object.fromEntries(DEVICE_ICONS.map((entry) => [entry.value, entry.label]));

export const CSV_COLUMNS = [
  {
    key: 'id',
    label: 'Geräte-ID',
    group: 'Identifikation',
    aliases: ['Device ID', 'Geräte ID'],
    required: false,
    example: '100',
    hint: 'Optionale eindeutige Geräte-ID, 3-50 Zeichen; leer lassen für automatische Vergabe',
    validate: (v) => !v || /^[a-zA-Z0-9_-]{3,50}$/.test(v),
    errorMsg: '3 bis 50 Zeichen: Buchstaben, Zahlen, _ oder -',
  },
  {
    key: 'inventoryId',
    label: 'Inventarnummer',
    group: 'Identifikation',
    aliases: ['Inventar-Nr.', 'Inventarnr.', 'Inventar'],
    required: true,
    example: 'LPT-001',
    hint: 'Eindeutige Inventarnummer, z.B. LPT-001',
    validate: (v) => v.trim().length >= 1,
    errorMsg: 'Pflichtfeld',
  },
  {
    key: 'manufacturer',
    label: 'Hersteller',
    group: 'Identifikation',
    aliases: ['Marke'],
    required: true,
    example: 'Lenovo',
    hint: 'z.B. Lenovo, Apple, Dell, HP',
    validate: (v) => v.trim().length >= 1,
    errorMsg: 'Pflichtfeld',
  },
  {
    key: 'model',
    label: 'Modell',
    group: 'Identifikation',
    aliases: ['Modell / Bezeichnung', 'Modellbezeichnung'],
    required: true,
    example: 'X1 Carbon 11th Gen',
    hint: 'Genaue Modellbezeichnung',
    validate: (v) => v.trim().length >= 1,
    errorMsg: 'Pflichtfeld',
  },
  {
    key: 'serialNumber',
    label: 'Seriennummer',
    group: 'Identifikation',
    required: false,
    example: 'PF3X9A12',
    hint: 'Optionale Seriennummer vom Gerät',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'category',
    label: 'Geräteart',
    group: 'Zuordnung',
    aliases: ['Art', 'Device Type', 'deviceType'],
    required: false,
    example: 'Laptop',
    hint: 'Geräteart, z.B. Laptop, Desktop-Computer, Tablet, Drucker / Scanner',
    validate: isCategory,
    errorMsg: 'Unbekannte Geräteart',
  },
  {
    key: 'icon',
    label: 'Symbol',
    group: 'Zuordnung',
    required: false,
    example: 'Laptop',
    hint: 'Optionales Symbol: Switch, Tablet, Laptop, Desktop, Drucker oder Server',
    validate: isIcon,
    errorMsg: 'Unbekanntes Symbol',
  },
  {
    key: 'hostname',
    label: 'Gerätename / Hostname',
    group: 'Zuordnung',
    aliases: ['Hostname', 'Gerätename'],
    required: false,
    example: 'nb-lehrerzimmer-01',
    hint: 'Optionaler Hostname für „Mein Gerät“',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'visibility',
    label: 'Sichtbarkeit',
    group: 'Zuordnung',
    required: false,
    example: 'Alle Benutzer',
    hint: 'Alle Benutzer, IT und Administratoren oder Nur Administratoren',
    validate: isVisibility,
    errorMsg: 'Unbekannte Sichtbarkeit',
  },
  {
    key: 'areaId',
    label: 'Bereich-ID',
    group: 'Zuordnung',
    required: false,
    example: '',
    hint: 'Datenbank-ID des Bereichs (alternativ Bereich-Name)',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'areaName',
    label: 'Bereich',
    group: 'Zuordnung',
    aliases: ['Bereichsname'],
    required: false,
    example: 'IT',
    hint: 'Name des Bereichs, wenn die Bereich-ID nicht bekannt ist',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'adminId',
    label: 'Administrator-ID',
    group: 'Zuordnung',
    aliases: ['Admin-ID'],
    required: false,
    example: '',
    hint: 'Datenbank-ID des zuständigen Administrators (alternativ Administrator-Name)',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'adminName',
    label: 'Zuständiger Administrator',
    group: 'Zuordnung',
    aliases: ['Administrator', 'Admin'],
    required: false,
    example: 'Max Mustermann',
    hint: 'Anzeigename oder Benutzername eines IT- oder Admin-Benutzers',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'roomId',
    label: 'Raum-ID',
    group: 'Zuordnung',
    required: false,
    example: '',
    hint: 'Datenbank-ID des Raums (alternativ Raumname)',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'roomName',
    label: 'Raumname',
    group: 'Zuordnung',
    aliases: ['Raum'],
    required: false,
    example: 'Testraum 123',
    hint: 'Raumname, wenn die Raum-ID nicht bekannt ist',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'status',
    label: 'Status',
    group: 'Status & Ausstattung',
    required: false,
    example: 'Verfügbar',
    hint: 'Verfügbar, Verliehen, Reserviert, Eingeschränkt, Defekt, Wartung oder Ausgemustert',
    validate: isStatus,
    errorMsg: 'Unbekannter Status',
  },
  {
    key: 'statusLocked',
    label: 'Status geschützt',
    group: 'Status & Ausstattung',
    aliases: ['Status schützen'],
    required: false,
    example: 'Nein',
    hint: 'Ja oder Nein — schützt den Status vor automatischen Ticket-Änderungen',
    validate: isYesNo,
    errorMsg: 'Erlaubt: Ja oder Nein',
  },
  {
    key: 'isLendable',
    label: 'Ausleihbar',
    group: 'Status & Ausstattung',
    required: false,
    example: 'Ja',
    hint: 'Ja oder Nein (leer = Nein)',
    validate: isYesNo,
    errorMsg: 'Erlaubt: Ja oder Nein',
  },
  {
    key: 'isReportable',
    label: 'Meldbar',
    group: 'Status & Ausstattung',
    required: false,
    example: 'Ja',
    hint: 'Ja oder Nein (leer = Nein) — ob Fehler zu diesem Gerät gemeldet werden können',
    validate: isYesNo,
    errorMsg: 'Erlaubt: Ja oder Nein',
  },
  {
    key: 'updatesEnabled',
    label: 'An Updates teilnehmen',
    group: 'Status & Ausstattung',
    aliases: ['Updates'],
    required: false,
    example: 'Ja',
    hint: 'Ja oder Nein (leer = Nein) — ob das Gerät an Software-Updates teilnimmt',
    validate: isYesNo,
    errorMsg: 'Erlaubt: Ja oder Nein',
  },
  {
    key: 'purchaseDate',
    label: 'Kaufdatum',
    group: 'Status & Ausstattung',
    required: false,
    example: '2024-03-01',
    hint: 'Format: YYYY-MM-DD (z.B. 2024-03-01) oder leer',
    validate: (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v),
    errorMsg: 'Format: YYYY-MM-DD oder leer lassen',
  },
  {
    key: 'warrantyEnd',
    label: 'Garantieende',
    group: 'Status & Ausstattung',
    required: false,
    example: '2027-03-01',
    hint: 'Format: YYYY-MM-DD (z.B. 2027-03-01) oder leer',
    validate: (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v),
    errorMsg: 'Format: YYYY-MM-DD oder leer lassen',
  },
  {
    key: 'labels',
    label: 'Labels',
    group: 'Status & Ausstattung',
    aliases: ['Label', 'Tags'],
    required: false,
    example: 'Laptop, Lehrergerät',
    hint: 'Mehrere Labels mit Komma trennen',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'description',
    label: 'Beschreibung',
    group: 'Status & Ausstattung',
    aliases: ['Beschreibung und Hinweise', 'Notizen', 'notes'],
    required: false,
    example: 'Netzteil fehlt',
    hint: 'Beliebiger Freitext',
    validate: () => true,
    errorMsg: '',
  },
  {
    key: 'ipAddress',
    label: 'IP-Adresse',
    group: 'Netzwerk',
    aliases: ['IP Address', 'IP'],
    required: false,
    example: '192.168.1.20',
    hint: 'Optionale IPv4-Adresse, z.B. 192.168.1.20',
    validate: (v) => !v || /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(v),
    errorMsg: 'Bitte eine gültige IPv4-Adresse eintragen oder leer lassen',
  },
  {
    key: 'macAddress',
    label: 'MAC-Adresse',
    group: 'Netzwerk',
    aliases: ['MAC Address', 'MAC'],
    required: false,
    example: 'A1:B2:C3:D4:E5:F6',
    hint: 'Optionale MAC-Adresse, z.B. A1:B2:C3:D4:E5:F6',
    validate: (v) => !v || /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(v),
    errorMsg: 'Bitte eine gültige MAC-Adresse eintragen oder leer lassen',
  },
];

export const CSV_GROUPS = [...new Set(CSV_COLUMNS.map((column) => column.group))];

export function columnsByGroup(columns = CSV_COLUMNS) {
  return CSV_GROUPS
    .map((group) => ({ group, columns: columns.filter((column) => column.group === group) }))
    .filter((entry) => entry.columns.length > 0);
}

function yesNo(value) {
  return value ? 'ja' : 'nein';
}

function dateValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

export function deviceCsvValue(device, key) {
  const value = device?.[key];
  switch (key) {
    case 'category':
      return categoryLabel(device?.category);
    case 'icon':
      return ICON_LABELS[device?.icon] || '';
    case 'visibility':
      return visibilityLabel(device?.visibility);
    case 'status':
      return statusLabel(device?.status);
    case 'statusLocked':
    case 'isLendable':
    case 'isReportable':
    case 'updatesEnabled':
      return yesNo(device?.[key]);
    case 'roomId':
      return device?.roomId || device?.room?.id || '';
    case 'roomName':
      return device?.room?.name || device?.roomName || '';
    case 'areaId':
      return device?.areaId || device?.area?.id || '';
    case 'areaName':
      return device?.area?.name || device?.areaName || '';
    case 'adminId':
      return device?.adminId || device?.admin?.id || '';
    case 'adminName':
      return device?.admin?.displayName || device?.admin?.username || device?.adminName || '';
    case 'purchaseDate':
    case 'warrantyEnd':
      return dateValue(value);
    case 'labels':
      return Array.isArray(device?.labels) ? device.labels.join(', ') : value || '';
    default:
      return value === null || value === undefined ? '' : value;
  }
}

export function generateTemplateCSV(columns = CSV_COLUMNS) {
  const sep = ';';
  const header = columns.map((column) => column.label).join(sep);
  return '\uFEFF' + header;
}

export function generateExampleRow(columns = CSV_COLUMNS) {
  const sep = ';';
  return columns.map((column) => column.example || '').join(sep);
}
