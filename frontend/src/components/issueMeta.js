// Gemeinsame Metadaten für das Ticketsystem (Ticketarten, Status, Prioritäten)

export const ISSUE_TYPES = [
  {
    value: 'DEVICE',
    label: 'Schulgerät',
    subtitle: 'Problem mit einem Gerät der Schule',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: 'Monitor'
  },
  {
    value: 'PERSONAL',
    label: 'Privat-/Dienstgerät',
    subtitle: 'Problem mit meinem eigenen privaten oder dienstlichen Gerät',
    badge: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: 'User'
  },
  {
    value: 'WLAN',
    label: 'WLAN / Netzwerk',
    subtitle: 'Problem mit WLAN oder Netzwerkverbindung',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    icon: 'Wifi'
  },
  {
    value: 'SOFTWARE',
    label: 'Software',
    subtitle: 'Problem mit einer Software/Anwendung',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: 'AppWindow'
  }
];

export const ISSUE_STATUSES = {
  OPEN: { label: 'Offen', badge: 'border-red-500 text-red-700 bg-red-50', dot: 'bg-red-500' },
  IN_PROGRESS: { label: 'In Bearbeitung', badge: 'border-orange-500 text-orange-700 bg-orange-50', dot: 'bg-orange-500' },
  WAITING: { label: 'Warten auf Rückmeldung', badge: 'border-amber-500 text-amber-700 bg-amber-50', dot: 'bg-amber-500' },
  CLOSED: { label: 'Geschlossen', badge: 'border-green-500 text-green-700 bg-green-50', dot: 'bg-green-500' }
};

export const ISSUE_STATUS_ORDER = ['OPEN', 'IN_PROGRESS', 'WAITING', 'CLOSED'];

export const ISSUE_PRIORITIES = {
  LOW: { label: 'Unwichtig', badge: 'bg-gray-100 text-gray-600' },
  NORMAL: { label: 'Normal', badge: 'bg-gray-100 text-gray-700' },
  HIGH: { label: 'Störend', badge: 'bg-orange-100 text-orange-700' },
  CRITICAL: { label: 'Kritisch', badge: 'bg-red-100 text-red-700' }
};

export function issueTypeMeta(type) {
  return ISSUE_TYPES.find((t) => t.value === type) || ISSUE_TYPES[0];
}

/**
 * Bezug eines Tickets: Inventarnummer(n), Raum oder Software (je nach Ticketart).
 */
export function issueContext(issue) {
  if (!issue) return '';
  if (issue.type === 'DEVICE') return issueDevicesLabel(issueDevices(issue));
  if (issue.type === 'WLAN') return issue.room?.name || '';
  if (issue.type === 'SOFTWARE') return issue.softwareName || '';
  return '';
}

/**
 * Alle Geräte eines Schulgerät-Tickets (führendes Gerät + weitere Geräte).
 * Fällt auf das einzelne `device`-Feld zurück, falls die API noch keine
 * `devices`-Liste liefert.
 */
export function issueDevices(issue) {
  if (!issue) return [];
  if (Array.isArray(issue.devices)) return issue.devices;
  return issue.device ? [issue.device] : [];
}

/**
 * Kurzbezug einer Geräteliste: eine Inventarnummer bzw. bei mehreren Geräten
 * eine kompakte Liste („3 Geräte: INV-1, INV-2, INV-3 (+1)").
 */
export function issueDevicesLabel(devices, maxShown = 3) {
  if (!devices || devices.length === 0) return '';
  const labels = devices.map((d) => d?.inventoryId || d?.model).filter(Boolean);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  const rest = labels.length - maxShown;
  return `${labels.length} Geräte: ${labels.slice(0, maxShown).join(', ')}${rest > 0 ? ` (+${rest})` : ''}`;
}

/**
 * Anzeige-Titel wie „#1042 – WLAN funktioniert nicht".
 */
export function issueDisplayTitle(issue) {
  if (!issue) return '';
  const num = typeof issue.id === 'string' ? issue.id.replace(/^.*-/, '') : issue.id;
  return `#${num} – ${issue.title || ''}`;
}

export function reporterName(issue) {
  if (!issue) return 'Unbekannt';
  if (issue.reporter) return issue.reporter.displayName || issue.reporter.username;
  if (issue.reporterEmail) return issue.reporterEmail;
  return 'Unbekannt';
}