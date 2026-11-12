import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Laptop, Wrench } from 'lucide-react';
import { api } from '../api/client';
import StatusPill from './StatusPill';
import DeviceIcon from './deviceIcons';

/**
 * Kompakte „Mein Gerät"-Karte für die Dashboards (Konzept Abschnitt 22):
 * Name, Modell, Status, Serien-/IP/MAC und die beiden Aktionen
 * „Problem melden" und „Gerätedetails".
 * Erwartet ein Element aus `GET /api/my-devices`.
 */
export default function MyDeviceCard({ entry, showActions = true }) {
  const device = entry?.device;
  if (!device) return null;

  const detailPath = `/devices?id=${encodeURIComponent(device.id)}`;
  const reportPath = `/issues/new?type=DEVICE&deviceId=${encodeURIComponent(device.id)}`;
  const responsibleAdmins = (entry?.admins && entry.admins.length
    ? entry.admins
    : (entry?.admin ? [entry.admin] : [])
  ).map((admin) => admin.displayName || admin.username).filter(Boolean);

  const facts = [
    ['Geräte-ID', device.id],
    ['Bereich', entry?.area?.name],
    ['Administrator', responsibleAdmins.join(', ')],
    ['Seriennummer', device.serialNumber],
    ['IP-Adresse', device.ipAddress],
    ['MAC-Adresse', device.macAddress]
  ].filter(([, value]) => value);

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface">
          <DeviceIcon device={device} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-on-surface">{device.inventoryId}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-on-surface-variant">
            <span className="font-mono">Geräte-ID: {device.id}</span>
            {[device.manufacturer, device.model].filter(Boolean).length > 0 && (
              <span>{[device.manufacturer, device.model].filter(Boolean).join(' ')}</span>
            )}
          </div>
        </div>
        <StatusPill status={device.status} />
      </div>

      {facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-1 gap-1 text-xs text-on-surface-variant sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="flex min-w-0 items-baseline gap-1.5">
              <dt className="shrink-0 text-outline">{label}:</dt>
              <dd className="truncate font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {showActions && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="btn-primary !min-h-9 !py-1.5 text-xs" to={reportPath}>
            <Wrench size={14} />Problem melden
          </Link>
          {entry?.canOpenDetail !== false && (
            <Link className="btn-secondary !min-h-9 !py-1.5 text-xs" to={detailPath}>
              <Info size={14} />Gerätedetails
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Dashboard-Einbettung (Konzept Abschnitt 22): Lädt die eigenen Geräte und
 * zeigt die Kompaktkarten – ohne Zuweisung bleibt die Sektion unsichtbar.
 */
export function MyDeviceEmbed() {
  const [entries, setEntries] = useState(undefined);

  useEffect(() => {
    let ignore = false;
    api.get('/my-devices')
      .then(({ data }) => { if (!ignore) setEntries(data.devices || []); })
      .catch(() => { if (!ignore) setEntries([]); });
    return () => { ignore = true; };
  }, []);

  if (!entries?.length) return null;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-on-surface">
          <Laptop size={16} className="text-sky-500" />
          Mein Gerät
        </h2>
        <Link to="/my-device" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
          {entries.length > 1 ? `${entries.length} Geräte` : 'Alle anzeigen'}
        </Link>
      </div>
      <div className="space-y-3 p-4">
        {entries.map((entry) => (
          <MyDeviceCard key={entry.loan?.id || entry.device?.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
