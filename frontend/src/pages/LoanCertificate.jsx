import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import QRCode from 'react-qr-code';
import { api } from '../api/client';
import { PageLoader } from '../components/Loading';

const STATUS_LABELS = {
  REQUESTED: 'Angefragt',
  DISCUSSION_REQUESTED: 'Gespräch erbeten',
  ACTIVE: 'Aktiv',
  OVERDUE: 'Überfällig',
  RETURNED: 'Zurückgegeben'
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('de-DE');
}

export default function LoanCertificate() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const [loan, setLoan] = useState(null);
  const [settings, setSettings] = useState({});
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      return;
    }
    Promise.all([
      api.get(`/loans/${id}`),
      api.get('/settings/public').catch(() => ({ data: { settings: {} } }))
    ])
      .then(([loanResult, settingsResult]) => {
        setLoan(loanResult.data.loan);
        setSettings(settingsResult.data.settings || {});
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const appUrl = useMemo(() => {
    const configured = (settings['app.url'] || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}`;
  }, [settings]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-100 p-4 text-center">
        <div className="text-lg font-semibold text-gray-800">Bescheinigung nicht gefunden</div>
        <p className="max-w-sm text-sm text-gray-500">Die angeforderte Ausleihe konnte nicht geladen werden.</p>
        <Link to="/loans" className="btn-secondary inline-flex items-center gap-2"><ArrowLeft size={16} />Zurück zur Ausleihe</Link>
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <PageLoader text="Lade Bescheinigung…" />
      </div>
    );
  }

  const orgName = settings['org.name'] || 'Medienzentrum';
  // Logo-Fallback: ohne hinterlegtes Logo wird das mitgelieferte Standard-Logo
  // geladen, damit die Kopfzeile der Bescheinigung auch im Druck vollständig ist.
  const orgLogo = String(settings['org.logo'] || '').trim()
    || `${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')}tms-logo.png`;
  const device = loan.device || {};
  const borrower = loan.user?.displayName || loan.borrowerName || loan.user?.username || '—';
  const certificateId = `B-${loan.id}`.toUpperCase();
  const qrValue = `${appUrl}/loans/detail?id=${loan.id}`;

  return (
    <div className="cert-page flex min-h-screen flex-col items-center gap-6 bg-gray-100 py-6 print:gap-0 print:py-0">
      <div className="flex w-[210mm] items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm print:hidden">
        <Link to={`/loans/detail?id=${loan.id}`} className="btn-secondary inline-flex items-center gap-2 min-h-10 text-gray-700">
          <ArrowLeft size={16} /> Zurück
        </Link>
        <span className="text-sm font-semibold text-gray-800">Ausleihbescheinigung · {certificateId}</span>
        <button onClick={() => window.print()} className="btn-primary inline-flex items-center gap-2 min-h-10">
          <Printer size={16} /> Als PDF drucken
        </button>
      </div>

      <div className="cert-sheet w-[210mm] min-h-[297mm] bg-white p-[18mm] shadow-xl print:shadow-none print:m-0 print:p-[12mm]" style={{ boxSizing: 'border-box' }}>
        <header className="cert-header flex items-start justify-between gap-6 border-b border-gray-300 pb-6">
          <div className="flex items-center gap-4">
            <div className="cert-logo-box flex items-center justify-center rounded bg-white">
              <img src={orgLogo} alt="Logo" className="max-h-16 max-w-[160px] object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">{orgName}</div>
              <div className="text-xs text-gray-500">Medien- und Geräteausleihe</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-tight text-gray-900">Ausleihbescheinigung</div>
            <div className="mt-1 text-xs text-gray-500">
              Bescheinigungs-Nr. <span className="font-mono font-semibold text-gray-700">{certificateId}</span>
              <br />
              ausgestellt am {formatDate(new Date().toISOString())}
            </div>
          </div>
        </header>

        <section className="cert-avoid-break mt-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Entliehenes Gerät</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <CertRow label="Inventarnummer">{device.inventoryId || '—'}</CertRow>
              <CertRow label="Gerät">{[device.manufacturer, device.model].filter(Boolean).join(' ') || '—'}</CertRow>
              <CertRow label="Seriennummer"><span className="font-mono">{device.serialNumber || '—'}</span></CertRow>
            </tbody>
          </table>
        </section>

        <section className="cert-avoid-break mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Ausleiher</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <CertRow label="Name">{borrower}</CertRow>
              {loan.borrowerGroup && <CertRow label="Klasse / Gruppe / Einrichtung">{loan.borrowerGroup}</CertRow>}
              {loan.borrowerContact && <CertRow label="Kontakt">{loan.borrowerContact}</CertRow>}
              <CertRow label="Status">{STATUS_LABELS[loan.status] || loan.status}</CertRow>
            </tbody>
          </table>
        </section>

        <section className="cert-avoid-break mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Gültigkeit</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <CertRow label="Ausgabe">{formatDate(loan.startDate)}</CertRow>
              <CertRow label="Rückgabe bis">{formatDate(loan.dueDate)}</CertRow>
              {loan.returnDate && <CertRow label="Zurückgegeben am">{formatDate(loan.returnDate)}</CertRow>}
            </tbody>
          </table>
        </section>

        {loan.notes && (
          <section className="cert-avoid-break mt-6">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Hinweise</h2>
            <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700">{loan.notes}</p>
          </section>
        )}

        <section className="cert-avoid-break mt-10 flex items-center justify-between gap-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800">Online-Übersicht der Ausleihe</div>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Scanne den QR-Code oder öffne folgenden Link, um die Ausleihe im System einzusehen:
            </p>
            <p className="mt-3 break-all font-mono text-xs text-gray-700">{qrValue}</p>
          </div>
          <div className="shrink-0 rounded-lg bg-white p-3 shadow-sm">
            <QRCode value={qrValue} size={132} bgColor="#ffffff" fgColor="#000000" title={qrValue} />
          </div>
        </section>

        <section className="cert-avoid-break mt-10 rounded-xl bg-yellow-50 border border-yellow-100 p-4 text-center text-xs leading-5 text-yellow-800">
          Diese Bescheinigung wurde maschinell erstellt und ist in dieser Form – auch ohne Unterschrift und Stempel – gültig.
        </section>

        <footer className="cert-avoid-break mt-10 flex items-end justify-between border-t border-gray-300 pt-4 text-xs text-gray-500">
          <div>
            <div className="font-semibold text-gray-700">{orgName}</div>
            {settings['org.email'] && <div>{settings['org.email']}</div>}
          </div>
          <div className="text-right">
            {appUrl.replace(/^https?:\/\//, '')}
          </div>
        </footer>
      </div>
    </div>
  );
}

function CertRow({ label, children }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="w-52 py-2.5 pr-4 align-top text-xs font-medium text-gray-500">{label}</td>
      <td className="py-2.5 font-medium text-gray-900">{children || '—'}</td>
    </tr>
  );
}