import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowLeftRight, Barcode, ChevronDown,
  Info, Link2, Lock, MapPin, Network, Pencil, Printer, QrCode, RefreshCw, ShieldCheck
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { AssetLabel, normalizeLabelSettings } from '../components/AssetLabel';
import StatusPill from '../components/StatusPill';
import DeviceIcon from '../components/deviceIcons';
import { categoryLabel, visibilityLabel } from '../components/deviceMeta';

const roomTypes = {
  STORAGE: 'Lager',
  CLASSROOM: 'Klassenraum',
  STUDIO: 'Studio',
  WORKSHOP: 'Werkstatt',
  SERVERROOM: 'Serverraum',
  OTHER: 'Sonstiges'
};

const loanStatusLabels = {
  ACTIVE: 'Aktiv',
  RETURNED: 'Zurückgegeben',
  OVERDUE: 'Überfällig',
  REQUESTED: 'Angefragt',
  DISCUSSION_REQUESTED: 'Gespräch erbeten',
  CANCELLED: 'Abgebrochen'
};

const loanStatusClasses = {
  ACTIVE: 'bg-badge-orange text-text-badge-orange',
  RETURNED: 'bg-surface-container-high text-on-surface-variant',
  OVERDUE: 'bg-badge-red text-text-badge-red',
  REQUESTED: 'bg-badge-violet text-text-badge-violet',
  DISCUSSION_REQUESTED: 'bg-badge-violet text-text-badge-violet',
  CANCELLED: 'bg-surface-container-high text-outline'
};

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('de-DE');
}

export default function DeviceDetail({ print = false }) {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const { user } = useAuth();
  const permissions = user?.effectivePermissions || [];
  const canEdit = permissions.includes('DEVICE_EDIT');
  const canManageAreas = permissions.includes('AREA_MANAGE');
  const role = user?.effectiveRole || user?.role;
  const isViewer = role === 'VIEWER';
  const canPrintLabel = !isViewer;
  // VIEWER hat LOAN_VIEW – Ausleihen bleiben trotzdem staff-seitig (Abschnitt 21).
  const canViewLoans = canEdit || permissions.includes('LOAN_MANAGE');
  const canViewUpdates = canEdit || permissions.includes('UPDATE_VIEW');
  const [device, setDevice] = useState(null);
  const [settings, setSettings] = useState({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/devices/${id}`),
      api.get('/settings/public').catch(() => ({ data: { settings: {} } }))
    ]).then(([deviceResult, settingsResult]) => {
      setDevice(deviceResult.data.device);
      setSettings(settingsResult.data.settings || {});
    });
  }, [id]);

  if (!device) return <div className="text-sm text-on-surface-variant">Laden...</div>;
  const qrValue = `${window.location.origin}/fehler/show/device?id=${device.id}`;

  async function downloadQr() {
    const response = await api.get(`/devices/${device.id}/qr`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${device.inventoryId}-qr.png`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadLabel() {
    const response = await api.get(`/devices/${device.id}/label`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${device.inventoryId}-label.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyQrLink() {
    try {
      await navigator.clipboard.writeText(qrValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard nicht verfügbar */
    }
  }

  if (print) {
    const label = normalizeLabelSettings(settings);
    return (
      <div
        className="label-sheet bg-white print:shadow-none print:m-0"
        style={{
          boxSizing: 'border-box',
          paddingTop: `${label.marginTopMm}mm`,
          paddingBottom: `${label.marginBottomMm}mm`,
          paddingLeft: `${label.marginLeftMm}mm`,
          paddingRight: `${label.marginRightMm}mm`
        }}
      >
        <AssetLabel align="start" device={device} settings={settings} qrValue={qrValue} />
      </div>
    );
  }

  const manufacturerModel = [device.manufacturer, device.model].filter(Boolean).join(' ') || '—';
  const activeLoan = (device.loans || []).find((loan) => loan.status === 'ACTIVE' || loan.status === 'OVERDUE');
  // Verantwortliche Personen: explizit hinterlegter Administrator, anderenfalls
  // die Bearbeiter des Gerätebereichs (Konzept Abschnitt 11).
  const responsibleAdmins = (device.admin
    ? [device.admin]
    : (device.area?.editors || []).map((editor) => editor.user).filter(Boolean)
  ).map((admin) => admin.displayName || admin.username);
  const latestLoans = (device.loans || []).slice(0, 5);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {/* ===== Kopfbereich ===== */}
        <header className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-container-high text-primary">
              <DeviceIcon device={device} size={28} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-on-surface md:text-2xl">{device.inventoryId || device.id}</h1>
                <StatusPill status={device.status} />
                {device.statusLocked && (
                  <span className="badge bg-surface-container-high text-outline" title="Status ist vor automatischen Ticket-Änderungen geschützt">
                    <Lock size={12} /> Manuell gesperrt
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm text-on-surface-variant">{manufacturerModel}</p>
            </div>
          </div>
          <StatChips device={device} />
        </header>

        <ConditionBanner device={device} />

        {/* ===== Mobile Aktionen – prominent ===== */}
        <div className="space-y-3 lg:hidden">
          <DeviceErrorLink device={device} />
          <div className="grid grid-cols-3 gap-2">
            {canPrintLabel && (
              <button type="button" className="btn-secondary min-h-11 flex-col gap-1 !px-2 text-xs" onClick={downloadQr} title="QR-Code (PNG) herunterladen">
                <QrCode size={18} />QR-Code
              </button>
            )}
            {canPrintLabel && (
              <button type="button" className="btn-secondary min-h-11 flex-col gap-1 !px-2 text-xs" onClick={downloadLabel} title="Label (SVG) herunterladen">
                <Barcode size={18} />Label
              </button>
            )}
            {canPrintLabel && (
              <Link className="btn-secondary min-h-11 flex-col gap-1 !px-2 text-center text-xs" to={`/devices/print?id=${device.id}`} title="Druckansicht öffnen">
                <Printer size={18} />Drucken
              </Link>
            )}
          </div>
        </div>

        {/* ===== Informationsbereiche ===== */}
        <Section title="Grundinformationen" icon={Info}>
          <dl>
            <Row label="Geräte-ID"><span className="font-mono">{device.id}</span></Row>
            <Row label="Inventarnummer">{device.inventoryId || '—'}</Row>
            <Row label="Geräteart">{categoryLabel(device.category)}</Row>
            {device.hostname && <Row label="Gerätename"><span className="font-mono">{device.hostname}</span></Row>}
            <Row label="Hersteller">{device.manufacturer || '—'}</Row>
            <Row label="Modell / Bezeichnung">{device.model || '—'}</Row>
            <Row label="Seriennummer"><span className="font-mono">{device.serialNumber || '—'}</span></Row>
            {device.isReportable !== undefined && <Row label="Meldbar">{device.isReportable ? 'Ja' : 'Nein'}</Row>}
            {device.isLendable !== undefined && <Row label="Ausleihbar">{device.isLendable ? 'Ja' : 'Nein'}</Row>}
            {device.updatesEnabled !== undefined && <Row label="Updates aktiv">{device.updatesEnabled ? 'Ja' : 'Nein'}</Row>}
            {device.purchaseDate && <Row label="Kaufdatum">{formatDate(device.purchaseDate)}</Row>}
            {device.warrantyEnd && <Row label="Garantieende">{formatDate(device.warrantyEnd)}</Row>}
          </dl>
          {device.labels?.length ? (
            <div className="flex flex-wrap gap-2 py-3">
              {device.labels.map((label) => <span key={label} className="badge bg-surface-container-high text-on-surface-variant">{label}</span>)}
            </div>
          ) : null}
          {device.description ? (
            <p className="whitespace-pre-wrap py-3 text-sm leading-6 text-on-surface-variant">{device.description}</p>
          ) : null}
        </Section>

        <Section title="Netzwerk & Technik" icon={Network}>
          <dl>
            <Row label="IP-Adresse"><span className="font-mono">{device.ipAddress || '—'}</span></Row>
            <Row label="MAC-Adresse"><span className="font-mono">{device.macAddress || '—'}</span></Row>
          </dl>
        </Section>

        <Section title="Standort & Zuordnung" icon={MapPin}>
          <dl>
            <Row label="Standort (Gebäude)">{device.room?.building || '—'}</Row>
            <Row label="Raum">{device.room?.name || 'Kein Raum zugewiesen'}</Row>
            <Row label="Bereich">{device.area?.name || 'Kein Bereich zugewiesen'}</Row>
            <Row label="Zuständiger Administrator">
              {responsibleAdmins.length
                ? responsibleAdmins.join(', ')
                : 'Nicht zugewiesen'}
            </Row>
            {canManageAreas && <Row label="Sichtbarkeit">{visibilityLabel(device.visibility)}</Row>}
            {device.room?.type && <Row label="Raumtyp">{roomTypes[device.room.type] || device.room.type}</Row>}
            {device.room?.description && <Row label="Raumbeschreibung">{device.room.description}</Row>}
          </dl>
        </Section>

        <Section title="Verwaltung" icon={ShieldCheck}>
          <dl>
            <Row label="Erstellt am">{formatDate(device.createdAt)}</Row>
            <Row label="Aktualisiert am">{formatDate(device.updatedAt)}</Row>
          </dl>
        </Section>

        {canViewLoans && (
          <Section title="Aktuelle Ausleihe" icon={ArrowLeftRight}>
            {activeLoan ? (
              <div className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm font-semibold text-on-surface">
                    {activeLoan.user?.displayName || activeLoan.borrowerName || activeLoan.user?.username || '—'}
                  </div>
                  <span className={`badge shrink-0 ${loanStatusClasses[activeLoan.status] || 'bg-surface-container-high text-outline'}`}>
                    {loanStatusLabels[activeLoan.status] || activeLoan.status}
                  </span>
                </div>
                {activeLoan.borrowerGroup && <div className="mt-0.5 text-xs text-on-surface-variant">{activeLoan.borrowerGroup}</div>}
                <div className="mt-1 text-xs text-on-surface-variant">
                  Seit {formatDate(activeLoan.startDate)} · Rückgabe bis {formatDate(activeLoan.dueDate)}
                </div>
              </div>
            ) : (
              <p className="py-2 text-sm text-on-surface-variant">Keine aktuelle Ausleihe vorhanden.</p>
            )}
          </Section>
        )}

        {canViewLoans && (
          <Section title="Letzte Ausleihen" icon={ArrowLeftRight}>
            {latestLoans.length ? (
              <div className="divide-y divide-outline-variant/70">
                {latestLoans.map((loan) => (
                  <Row key={loan.id} label={loan.user?.displayName || loan.borrowerName || loan.user?.username || '—'}>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-on-surface-variant">
                        {formatDate(loan.startDate)} – {formatDate(loan.returnDate || loan.dueDate)}
                      </span>
                      <span className={`badge shrink-0 ${loanStatusClasses[loan.status] || 'bg-surface-container-high text-outline'}`}>
                        {loanStatusLabels[loan.status] || loan.status}
                      </span>
                    </div>
                  </Row>
                ))}
              </div>
            ) : (
              <p className="py-2 text-sm text-on-surface-variant">Noch keine Ausleihen dokumentiert.</p>
            )}
          </Section>
        )}

        {canViewUpdates && (
          <Section title="Updates-Verlauf" icon={RefreshCw}>
            {device.updateResults?.length ? (
              <div className="divide-y divide-outline-variant/70">
                {device.updateResults.map((res) => (
                  <div key={res.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-on-surface">{res.update?.location || 'Unbekannter Ort'}</div>
                      <div className="text-xs text-on-surface-variant">
                        {res.update?.dateTime ? new Date(res.update.dateTime).toLocaleString('de-DE') : '—'}
                      </div>
                      {res.status === 'FAILED' && res.errorDetails && (
                        <div className="mt-1 rounded-md bg-badge-red px-2 py-1 text-xs text-text-badge-red">Fehler: {res.errorDetails}</div>
                      )}
                    </div>
                    <span className={`badge shrink-0 ${res.status === 'SUCCESS' ? 'bg-badge-green text-text-badge-green' : 'bg-badge-red text-text-badge-red'}`}>
                      {res.status === 'SUCCESS' ? 'Erfolgreich' : 'Fehlgeschlagen'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-2 text-sm text-on-surface-variant">Noch keine Updates dokumentiert.</p>
            )}
          </Section>
        )}
      </div>

      {/* ===== Desktop Aktionsbereich ===== */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-4">
          {canPrintLabel && (
          <section className="card p-5">
            <div className="mb-3">
              <div className="font-semibold text-on-surface">Geräte-Label</div>
              <div className="text-xs text-on-surface-variant">QR-Code & Kennung aus den Gerätedaten</div>
            </div>
            <div className="label-preview overflow-hidden rounded-2xl bg-surface-container-low p-5">
              <AssetLabel preview device={device} settings={settings} qrValue={qrValue} />
            </div>
            <div className="mt-4 space-y-2">
              <DeviceErrorLink device={device} />
              <div className="h-px bg-outline-variant" />
              {canEdit && (
                <Link className="btn-secondary w-full justify-center" to={`/devices/edit?id=${device.id}`}>
                  <Pencil size={16} />Bearbeiten
                </Link>
              )}
              <button type="button" className="btn-secondary w-full justify-center" onClick={copyQrLink}>
                <Link2 size={16} />{copied ? 'Link kopiert!' : 'Link kopieren'}
              </button>
              {canPrintLabel && (
                <button type="button" className="btn-secondary w-full justify-center" onClick={downloadQr}>
                  <QrCode size={16} />QR-Code (PNG)
                </button>
              )}
              {canPrintLabel && (
                <button type="button" className="btn-secondary w-full justify-center" onClick={downloadLabel}>
                  <Barcode size={16} />Label (SVG)
                </button>
              )}
              {canPrintLabel && (
                <Link className="btn-secondary w-full justify-center" to={`/devices/print?id=${device.id}`}>
                  <Printer size={16} />Druckansicht
                </Link>
              )}
            </div>
          </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function ConditionBanner({ device }) {
  const condition = device.condition || {};
  const state = condition.state;
  if (state !== 'DEFECT' && state !== 'LIMITED') return null;
  const isDefect = state === 'DEFECT';
  const reasons = condition.reasons || [];
  return (
    <section className={`rounded-xl border px-4 py-4 ${isDefect ? 'border-red-200 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10' : 'border-amber-200 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'}`}>
      <div className={`flex items-center gap-2 font-semibold ${isDefect ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-200'}`}>
        <AlertTriangle size={18} className="shrink-0" />
        {condition.headline || (isDefect ? 'Gerät ist defekt' : 'Gerät ist eingeschränkt')}
      </div>
      {reasons.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {reasons.map((reason) => (
            <li key={reason.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <Link to={`/issues?id=${encodeURIComponent(reason.id)}`} className={`font-medium hover:underline ${isDefect ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-200'}`}>
                {reason.title}
              </Link>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isDefect ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {reason.priorityLabel || reason.priority}
              </span>
              <span className="text-xs text-on-surface-variant">gemeldet am {formatDate(reason.createdAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-on-surface-variant">Es ist derzeit kein offenes Ticket vermerkt.</p>
      )}
    </section>
  );
}

function StatChips({ device }) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3">
      <div className="rounded-lg bg-surface-container-low px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-outline">Geräte-ID</div>
        <div className="mt-0.5 truncate font-mono text-sm font-semibold text-on-surface">{device.id}</div>
      </div>
      <div className="rounded-lg bg-surface-container-low px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-outline">IP-Adresse</div>
        <div className="mt-0.5 truncate font-mono text-sm font-semibold text-on-surface">{device.ipAddress || '—'}</div>
      </div>
      <div className="rounded-lg bg-surface-container-low px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-outline">MAC-Adresse</div>
        <div className="mt-0.5 truncate font-mono text-sm font-semibold text-on-surface">{device.macAddress || '—'}</div>
      </div>
    </div>
  );
}

function DeviceErrorLink({ device }) {
  return device.isReportable ? (
    <Link
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-error px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      to={`/issues/new?type=DEVICE&deviceId=${encodeURIComponent(device.id)}`}
    >
      <AlertCircle size={18} />Fehler melden
    </Link>
  ) : (
    <button
      type="button"
      className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-error/70 px-4 py-3 text-sm font-bold text-white opacity-70"
      title="Für dieses Gerät können keine Fehler gemeldet werden"
    >
      <AlertCircle size={18} />Fehler melden
    </button>
  );
}

function Section({ title, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left md:cursor-default md:pointer-events-none"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          {Icon && <Icon size={16} className="text-outline" />}
          {title}
        </div>
        <ChevronDown size={16} className={`shrink-0 text-outline transition-transform md:hidden ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`border-t border-outline-variant ${open ? 'block animate-fade-in' : 'hidden md:block'}`}>
        <div className="px-4 py-1.5 md:py-1">{children}</div>
      </div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-outline-variant/70 py-2.5 text-sm last:border-0">
      <dt className="shrink-0 text-on-surface-variant">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-on-surface">{children || '—'}</dd>
    </div>
  );
}