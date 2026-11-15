import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowLeftRight, Barcode, Building2, CheckCircle2,
  ChevronRight, Clock, DoorOpen, Eye, FileText, FolderTree, Hash, Info, Link2,
  Lock, MapPin, Network, Pencil, Printer, QrCode, RefreshCw, Tag, UserRound
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

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function borrowerName(loan) {
  return loan.user?.displayName || loan.borrowerName || loan.user?.username || '—';
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
  const responsibleAdmins = (device.admin
    ? [device.admin]
    : (device.area?.editors || []).map((editor) => editor.user).filter(Boolean)
  ).map((admin) => admin.displayName || admin.username);
  const latestLoans = (device.loans || []).slice(0, 5);
  const otherLoans = latestLoans.filter((loan) => loan.id !== activeLoan?.id);
  const updateResults = device.updateResults || [];

  const flags = [];
  if (device.isReportable !== undefined) {
    flags.push({ label: device.isReportable ? 'Meldbar' : 'Nicht meldbar', active: device.isReportable });
  }
  if (device.isLendable !== undefined) {
    flags.push({ label: device.isLendable ? 'Ausleihbar' : 'Nicht ausleihbar', active: device.isLendable });
  }
  if (device.updatesEnabled !== undefined) {
    flags.push({ label: device.updatesEnabled ? 'Updates aktiv' : 'Updates inaktiv', active: device.updatesEnabled });
  }

  return (
    <div className="space-y-4">
      <header className="card overflow-hidden">
        <div className="bg-surface-container-low px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-lowest text-primary shadow-sm">
                <DeviceIcon device={device} size={32} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-bold text-on-surface md:text-2xl">
                    {device.inventoryId || device.id}
                  </h1>
                  <StatusPill status={device.status} />
                  {device.statusLocked && (
                    <span className="badge bg-surface-container-high text-outline" title="Status ist vor automatischen Ticket-Änderungen geschützt">
                      <Lock size={12} /> Manuell gesperrt
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm text-on-surface-variant">{manufacturerModel}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="badge bg-surface-container-high text-on-surface-variant">
                    <Tag size={12} /> {categoryLabel(device.category)}
                  </span>
                  {flags.map((flag) => (
                    <span
                      key={flag.label}
                      className={`badge ${flag.active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-surface-container-high text-on-surface-variant'}`}
                    >
                      {flag.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Link className="btn-secondary" to={`/devices/edit?id=${device.id}`}>
                  <Pencil size={16} />Bearbeiten
                </Link>
              )}
              <DeviceErrorLink device={device} compact />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-outline-variant/70 sm:grid-cols-4">
          <QuickFact icon={Hash} label="Geräte-ID" value={device.id} mono />
          <QuickFact
            icon={MapPin}
            label="Standort"
            value={device.room?.name || 'Nicht zugewiesen'}
            hint={device.room?.building || device.area?.name}
          />
          <QuickFact
            icon={Network}
            label="Netzwerk"
            value={device.ipAddress || 'Keine IP'}
            hint={device.macAddress ? `MAC ${device.macAddress}` : undefined}
            mono={Boolean(device.ipAddress)}
          />
          <QuickFact
            icon={ArrowLeftRight}
            label="Ausleihe"
            value={activeLoan ? borrowerName(activeLoan) : 'Verfügbar'}
            hint={activeLoan ? `Rückgabe bis ${formatDate(activeLoan.dueDate) || '—'}` : 'Keine aktive Ausleihe'}
          />
        </div>
      </header>

      <ConditionBanner device={device} />

      {canPrintLabel && (
        <div className="grid grid-cols-3 gap-2 xl:hidden">
          <button type="button" className="btn-secondary min-h-11 flex-col gap-1 !px-2 text-xs" onClick={downloadQr} title="QR-Code (PNG) herunterladen">
            <QrCode size={18} />QR-Code
          </button>
          <button type="button" className="btn-secondary min-h-11 flex-col gap-1 !px-2 text-xs" onClick={downloadLabel} title="Label (SVG) herunterladen">
            <Barcode size={18} />Label
          </button>
          <Link className="btn-secondary min-h-11 flex-col gap-1 !px-2 text-center text-xs" to={`/devices/print?id=${device.id}`} title="Druckansicht öffnen">
            <Printer size={18} />Drucken
          </Link>
        </div>
      )}

      <div className={`grid gap-4 ${canPrintLabel ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <div className="min-w-0 space-y-4">
          <section className="card p-5">
            <CardHeader icon={Info} title="Gerätedaten" description="Stammdaten, Kennzeichnung und Hinweise" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Inventarnummer" value={device.inventoryId} />
              <Fact label="Geräteart" value={categoryLabel(device.category)} />
              <Fact label="Hersteller" value={device.manufacturer} />
              <Fact label="Modell / Bezeichnung" value={device.model} />
              <Fact label="Seriennummer" value={device.serialNumber} mono />
              <Fact label="Gerätename" value={device.hostname} mono />
              {device.purchaseDate && <Fact label="Kaufdatum" value={formatDate(device.purchaseDate)} />}
              {device.warrantyEnd && <Fact label="Garantieende" value={formatDate(device.warrantyEnd)} />}
            </div>
            {device.labels?.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-outline">Labels</span>
                {device.labels.map((label) => (
                  <span key={label} className="badge bg-surface-container-high text-on-surface-variant">{label}</span>
                ))}
              </div>
            )}
            {device.description && (
              <div className="mt-4 flex gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-low p-4">
                <FileText size={17} className="mt-0.5 shrink-0 text-outline" />
                <p className="whitespace-pre-wrap text-sm leading-6 text-on-surface-variant">{device.description}</p>
              </div>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <CardHeader icon={MapPin} title="Standort & Zuordnung" />
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant/70 bg-surface-container-low px-3 py-2 text-xs font-medium text-on-surface-variant">
                <Building2 size={14} className="text-outline" />
                <span>{device.room?.building || 'Kein Gebäude'}</span>
                <ChevronRight size={13} className="text-outline" />
                <DoorOpen size={14} className="text-outline" />
                <span>{device.room?.name || 'Kein Raum'}</span>
                <ChevronRight size={13} className="text-outline" />
                <FolderTree size={14} className="text-outline" />
                <span>{device.area?.name || 'Kein Bereich'}</span>
              </div>
              <div className="mt-4 grid gap-3">
                <InfoTile
                  icon={UserRound}
                  label="Verantwortlich"
                  value={responsibleAdmins.length ? responsibleAdmins.join(', ') : 'Nicht zugewiesen'}
                />
                {device.room?.type && (
                  <InfoTile icon={DoorOpen} label="Raumtyp" value={roomTypes[device.room.type] || device.room.type} />
                )}
                {device.room?.description && (
                  <InfoTile icon={Info} label="Raumbeschreibung" value={device.room.description} />
                )}
                {canManageAreas && (
                  <InfoTile icon={Eye} label="Sichtbarkeit" value={visibilityLabel(device.visibility)} />
                )}
              </div>
            </section>

            <section className="card p-5">
              <CardHeader icon={Network} title="Netzwerk & Technik" />
              <div className="mt-4 space-y-3">
                <NetworkValue label="IP-Adresse" value={device.ipAddress} />
                <NetworkValue label="MAC-Adresse" value={device.macAddress} />
                <NetworkValue label="Gerätename" value={device.hostname} />
              </div>
            </section>
          </div>

          {canViewLoans && (
            <section className="card p-5">
              <CardHeader
                icon={ArrowLeftRight}
                title="Ausleihen"
                description={activeLoan ? 'Aktuell ausgeliehen' : 'Aktuell verfügbar'}
              />
              {activeLoan
                ? <ActiveLoanCard loan={activeLoan} />
                : <EmptyState icon={CheckCircle2} text="Das Gerät ist aktuell nicht ausgeliehen." tone="success" />}
              {otherLoans.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-outline">Verlauf</h3>
                  <div className="relative mt-3 space-y-3 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-outline-variant/70">
                    {otherLoans.map((loan) => <LoanTimelineItem key={loan.id} loan={loan} />)}
                  </div>
                </div>
              )}
              {!latestLoans.length && (
                <p className="mt-4 text-sm text-on-surface-variant">Noch keine Ausleihen dokumentiert.</p>
              )}
            </section>
          )}

          {canViewUpdates && (
            <section className="card p-5">
              <CardHeader icon={RefreshCw} title="Updates-Verlauf" description="Dokumentierte Update-Durchläufe" />
              {updateResults.length ? (
                <div className="relative mt-4 space-y-3 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-outline-variant/70">
                  {updateResults.map((result) => <UpdateTimelineItem key={result.id} result={result} />)}
                </div>
              ) : (
                <EmptyState icon={RefreshCw} text="Noch keine Updates dokumentiert." />
              )}
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-on-surface-variant">
            <span>Erstellt am <strong className="text-on-surface">{formatDate(device.createdAt) || '—'}</strong></span>
            <span>Aktualisiert am <strong className="text-on-surface">{formatDate(device.updatedAt) || '—'}</strong></span>
          </div>
        </div>

        {canPrintLabel && (
          <aside className="hidden xl:block">
            <div className="sticky top-6">
              <section className="card p-5">
                <div className="mb-3">
                  <div className="font-semibold text-on-surface">Geräte-Label</div>
                  <div className="text-xs text-on-surface-variant">QR-Code & Kennung aus den Gerätedaten</div>
                </div>
                <div className="label-preview overflow-hidden rounded-2xl bg-surface-container-low p-5">
                  <AssetLabel preview device={device} settings={settings} qrValue={qrValue} />
                </div>
                <div className="mt-4 space-y-2">
                  <button type="button" className="btn-secondary w-full justify-center" onClick={copyQrLink}>
                    <Link2 size={16} />{copied ? 'Link kopiert!' : 'Link kopieren'}
                  </button>
                  <button type="button" className="btn-secondary w-full justify-center" onClick={downloadQr}>
                    <QrCode size={16} />QR-Code (PNG)
                  </button>
                  <button type="button" className="btn-secondary w-full justify-center" onClick={downloadLabel}>
                    <Barcode size={16} />Label (SVG)
                  </button>
                  <Link className="btn-secondary w-full justify-center" to={`/devices/print?id=${device.id}`}>
                    <Printer size={16} />Druckansicht
                  </Link>
                </div>
              </section>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function QuickFact({ icon: Icon, label, value, hint, mono = false }) {
  return (
    <div className="min-w-0 bg-surface-container-lowest p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-outline">
        <Icon size={12} />
        {label}
      </div>
      <div className={`mt-1 truncate text-sm font-semibold text-on-surface ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </div>
      {hint && <div className="mt-0.5 truncate text-xs text-on-surface-variant">{hint}</div>}
    </div>
  );
}

function CardHeader({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant">
        <Icon size={17} />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>}
      </div>
    </div>
  );
}

function Fact({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-outline">{label}</div>
      <div className={`mt-1 break-words text-sm font-semibold text-on-surface ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </div>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-outline">{label}</div>
        <div className="mt-0.5 break-words text-sm font-medium text-on-surface">{value || '—'}</div>
      </div>
    </div>
  );
}

function NetworkValue({ label, value }) {
  return (
    <div className="rounded-xl border border-outline-variant/70 bg-surface-container-low px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-outline">{label}</div>
      <div className={`mt-1 break-all font-mono text-base font-semibold ${value ? 'text-on-surface' : 'text-on-surface-variant'}`}>
        {value || 'Nicht hinterlegt'}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text, tone = 'default' }) {
  const classes = tone === 'success'
    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
    : 'border-outline-variant bg-surface-container-low text-on-surface-variant';
  return (
    <div className={`mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${classes}`}>
      <Icon size={17} />
      <span>{text}</span>
    </div>
  );
}

function ActiveLoanCard({ loan }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-primary/20 bg-primary/5">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound size={18} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-on-surface">{borrowerName(loan)}</div>
            {loan.borrowerGroup && <div className="truncate text-xs text-on-surface-variant">{loan.borrowerGroup}</div>}
          </div>
        </div>
        <span className={`badge shrink-0 ${loanStatusClasses[loan.status] || 'bg-surface-container-high text-outline'}`}>
          {loanStatusLabels[loan.status] || loan.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-primary/10 text-xs">
        <div className="bg-surface-container-lowest px-4 py-2">
          <div className="text-[10px] uppercase tracking-wider text-outline">Seit</div>
          <div className="mt-0.5 font-medium text-on-surface">{formatDate(loan.startDate) || '—'}</div>
        </div>
        <div className="bg-surface-container-lowest px-4 py-2">
          <div className="text-[10px] uppercase tracking-wider text-outline">Rückgabe bis</div>
          <div className="mt-0.5 font-medium text-on-surface">{formatDate(loan.dueDate) || '—'}</div>
        </div>
      </div>
    </div>
  );
}

function LoanTimelineItem({ loan }) {
  return (
    <div className="relative flex gap-3">
      <span className="relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant">
        <UserRound size={14} />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-on-surface">{borrowerName(loan)}</div>
            {loan.borrowerGroup && <div className="truncate text-xs text-on-surface-variant">{loan.borrowerGroup}</div>}
          </div>
          <span className={`badge shrink-0 ${loanStatusClasses[loan.status] || 'bg-surface-container-high text-outline'}`}>
            {loanStatusLabels[loan.status] || loan.status}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant">
          <Clock size={12} />
          {formatDate(loan.startDate) || '—'} – {formatDate(loan.returnDate || loan.dueDate) || '—'}
        </div>
      </div>
    </div>
  );
}

function UpdateTimelineItem({ result }) {
  const success = result.status === 'SUCCESS';
  return (
    <div className="relative flex gap-3">
      <span className={`relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${success ? 'bg-badge-green text-text-badge-green' : 'bg-badge-red text-text-badge-red'}`}>
        <RefreshCw size={14} />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-on-surface">{result.update?.location || 'Unbekannter Ort'}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-on-surface-variant">
              <Clock size={12} />
              {formatDateTime(result.update?.dateTime || result.createdAt)}
            </div>
          </div>
          <span className={`badge shrink-0 ${success ? 'bg-badge-green text-text-badge-green' : 'bg-badge-red text-text-badge-red'}`}>
            {success ? 'Erfolgreich' : 'Fehlgeschlagen'}
          </span>
        </div>
        {!success && result.errorDetails && (
          <div className="mt-2 break-words rounded-lg bg-badge-red px-3 py-2 text-xs text-text-badge-red">
            Fehler: {result.errorDetails}
          </div>
        )}
      </div>
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
              <span className="text-xs text-on-surface-variant">gemeldet am {formatDate(reason.createdAt) || '—'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-on-surface-variant">Es ist derzeit kein offenes Ticket vermerkt.</p>
      )}
    </section>
  );
}

function DeviceErrorLink({ device, compact = false }) {
  const base = compact
    ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-error px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-error px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60';

  return device.isReportable ? (
    <Link
      className={base}
      to={`/issues/new?type=DEVICE&deviceId=${encodeURIComponent(device.id)}`}
    >
      <AlertCircle size={18} />Fehler melden
    </Link>
  ) : (
    <button
      type="button"
      disabled
      className={`${base} cursor-not-allowed opacity-70`}
      title="Für dieses Gerät können keine Fehler gemeldet werden"
    >
      <AlertCircle size={18} />Fehler melden
    </button>
  );
}
