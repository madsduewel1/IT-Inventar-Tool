import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, Info, Wrench } from 'lucide-react';
import { api } from '../api/client';
import StatusPill from '../components/StatusPill';
import DeviceIcon from '../components/deviceIcons';
import { PageLoader } from '../components/Loading';
import { ISSUE_PRIORITIES } from '../components/issueMeta';
import { categoryLabel } from '../components/deviceMeta';

// „Mein Gerät" (Konzept Abschnitt 2): Das Gerät aus der aktiven Ausleihe mit
// Status, Geräteart-Icon, konkreter Fehlerursache, Bereichen und den Aktionen
// „Problem melden" und „Gerätedetails". Oben stehen Inventarnummer und
// Geräte-ID statt der Modellnummer.
function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(value).slice(0, 10);
  }
}

export default function MyDevice() {
  const [entries, setEntries] = useState(null);
  const [activeKey, setActiveKey] = useState(null);

  useEffect(() => {
    let ignore = false;
    api.get('/my-devices')
      .then(({ data }) => { if (!ignore) setEntries(data.devices || []); })
      .catch(() => { if (!ignore) setEntries([]); });
    return () => { ignore = true; };
  }, []);

  const active = useMemo(() => {
    if (!entries?.length) return null;
    if (activeKey) {
      const match = entries.find((entry) => entry.loan?.id === activeKey);
      if (match) return match;
    }
    return entries[0];
  }, [entries, activeKey]);

  if (entries === null) return <PageLoader text="Mein Gerät wird geladen…" />;

  if (!entries?.length) {
    return (
      <div className="space-y-5 md:space-y-6">
        <h1 className="text-2xl font-bold text-on-surface md:text-3xl">Mein Gerät</h1>
        <div className="card p-6 text-sm text-on-surface-variant">
          Dir ist aktuell kein Gerät zugewiesen.
        </div>
      </div>
    );
  }

  const device = active.device;
  const condition = active.condition || {};
  const reasons = condition.reasons || [];
  const isDefect = condition.state === 'DEFECT';
  const isLimited = condition.state === 'LIMITED';
  const name = device.hostname || device.model || device.inventoryId;

  // Verantwortliche Personen: explizit hinterlegter Administrator des Assets,
  // anderenfalls die Admins des Gerätebereichs (Konzept Abschnitt 11).
  const responsibleAdmins = (active.admins && active.admins.length
    ? active.admins
    : (active.admin ? [active.admin] : [])
  ).map((admin) => admin.displayName || admin.username).filter(Boolean);

  const fields = [
    ['Inventarnummer', device.inventoryId],
    ['Gerätename', device.hostname],
    ['Modell', [device.manufacturer, device.model].filter(Boolean).join(' ')],
    ['Geräteart', categoryLabel(device.category)],
    ['Seriennummer', device.serialNumber],
    ['IP-Adresse', device.ipAddress],
    ['MAC-Adresse', device.macAddress],
    ['Raum', device.room?.name],
    ['Bereich', active.area?.name],
    ['Zuständiger Administrator', responsibleAdmins.length ? responsibleAdmins.join(', ') : null]
  ].filter(([, value]) => value);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-on-surface md:text-3xl">Mein Gerät</h1>
        <p className="text-sm text-on-surface-variant">
          {entries.length === 1
            ? 'Dir ist aktuell ein Gerät zugewiesen.'
            : `Dir sind aktuell ${entries.length} Geräte zugewiesen.`}
        </p>
      </div>

      {entries.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {entries.map((entry) => {
            const isActive = entry.loan.id === active.loan.id;
            const label = entry.device.hostname || entry.device.model || entry.device.inventoryId;
            return (
              <button
                key={entry.loan.id}
                type="button"
                onClick={() => setActiveKey(entry.loan.id)}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
                  isActive
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <DeviceIcon device={entry.device} size={16} />
                <span className="max-w-[10rem] truncate">{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {(isDefect || isLimited) && (
        <section className={`rounded-xl border px-4 py-4 ${
          isDefect
            ? 'border-red-500/40 bg-red-500/10'
            : 'border-amber-500/40 bg-amber-500/10'
        }`}>
          <div className={`flex items-center gap-2 font-semibold ${isDefect ? 'text-red-200' : 'text-amber-100'}`}>
            <AlertTriangle size={18} className="shrink-0" />
            {condition.headline || (isDefect ? 'Gerät ist defekt' : 'Gerät ist eingeschränkt')}
          </div>
          {reasons.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {reasons.map((reason) => (
                <li key={reason.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <Link to={`/issues?id=${encodeURIComponent(reason.id)}`} className="font-medium text-on-surface hover:underline">
                    {reason.title}
                  </Link>
                  <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                    {ISSUE_PRIORITIES[reason.priority]?.label || reason.priorityLabel || reason.priority}
                  </span>
                  <span className="text-xs text-on-surface-variant">gemeldet am {formatDate(reason.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-on-surface-variant">Es ist derzeit kein offenes Ticket vermerkt.</p>
          )}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start gap-4 border-b border-outline-variant p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface">
            <DeviceIcon device={device} size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="break-words text-lg font-bold text-on-surface">{device.inventoryId}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-on-surface-variant">
              {device.hostname && <span className="font-medium text-on-surface">{device.hostname}</span>}
              <span className="font-mono">Geräte-ID: {device.id}</span>
            </div>
            {[device.manufacturer, device.model].filter(Boolean).length > 0 && (
              <div className="mt-0.5 text-xs text-on-surface-variant">{[device.manufacturer, device.model].filter(Boolean).join(' ')}</div>
            )}
          </div>
          <StatusPill status={device.status} />
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-outline">{label}</dt>
              <dd className="mt-0.5 truncate text-sm text-on-surface">{value}</dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-outline">Rückgabe bis</dt>
            <dd className="mt-0.5 text-sm text-on-surface">{formatDate(active.loan.dueDate) || '–'}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 border-t border-outline-variant p-5 sm:flex-row sm:justify-end">
          <Link className="btn-secondary" to={`/issues/new?type=DEVICE&deviceId=${encodeURIComponent(device.id)}`}>
            <Wrench size={17} />Problem mit „{name}“ melden
          </Link>
          {active.canOpenDetail !== false && (
            <Link className="btn-primary" to={`/devices?id=${encodeURIComponent(device.id)}`}>
              <Info size={17} />Gerätedetails
            </Link>
          )}
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs text-on-surface-variant">
        <ArrowLeftRight size={14} />
        Dein Leihverhältnis läuft bis zum {formatDate(active.loan.dueDate) || 'unbekannten Datum'}.
      </p>
    </div>
  );
}
