import { AlertTriangle, ArrowLeftRight, Cpu, Plus, QrCode, MessageSquareWarning } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDevices } from '../hooks/useDevices';
import { useAuth } from '../hooks/useAuth';

export default function Dashboard() {
  const { user } = useAuth();
  const { devices } = useDevices();
  const role = user?.effectiveRole || user?.role;
  const permissions = user?.permissions || [];
  const isStaffOrAdmin = ['STAFF', 'ADMIN'].includes(role);
  const canSeeLists = role !== 'VIEWER';
  const canReport = permissions.includes('ISSUE_REPORT') || isStaffOrAdmin;
  const canManageIssues = permissions.includes('ISSUE_MANAGE') || isStaffOrAdmin;

  const available = devices.filter((device) => device.status === 'AVAILABLE').length;
  const loaned = devices.filter((device) => device.status === 'LOANED').length;
  const defect = devices.filter((device) => device.status === 'DEFECT').length;
  const latest = devices.slice(0, 6);

  return (
    <div className="space-y-4 md:space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Geräte" value={devices.length} color="text-gray-200" />
        <Metric label="Verfügbar" value={available} color="text-green-600" />
        <Metric label="Verliehen" value={loaned} color="text-orange-500" />
        <Metric label="Defekt" value={defect} color="text-red-500" />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <QuickAction to="/scanner" icon={QrCode} title="QR scannen" text="Gerät direkt öffnen" tone="neutral" />
        <QuickAction to="/devices" icon={Cpu} title="Inventar" text="Assets suchen" tone="neutral" />
        {!isStaffOrAdmin && <QuickAction to="/loans/request" icon={ArrowLeftRight} title="Ausleihe anfragen" text="Asset anfragen" tone="neutral" />}
        {isStaffOrAdmin && <QuickAction to="/devices/new" icon={Plus} title="Gerät anlegen" text="Neues Inventar" tone="green" />}
        {isStaffOrAdmin && <QuickAction to="/loans" icon={ArrowLeftRight} title="Ausleihen" text="Vorgänge prüfen" tone="orange" />}
        {canManageIssues && <QuickAction to="/issues/manage" icon={AlertTriangle} title="Tickets" text="Fehler bearbeiten" tone="red" />}
        {canReport && <QuickAction to="/issues/new" icon={MessageSquareWarning} title="Fehler melden" text="Ticket erstellen" tone="red" />}
      </section>

      {canSeeLists && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-black/5 p-4">
            <div className="min-w-0">
              <div className="font-semibold text-gray-800">Neueste Geräte</div>
              <div className="mt-1 text-sm text-gray-500">Kurzliste der zuletzt geladenen Assets</div>
            </div>
            <Link className="btn-primary hidden sm:inline-flex" to="/devices/new">Gerät hinzufügen</Link>
          </div>

          <div className="divide-y divide-black/5 md:hidden">
            {latest.length ? latest.map((device) => <DeviceCard key={device.id} device={device} />) : <EmptyState text="Noch keine Geräte vorhanden." />}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-[#fafafa] text-gray-500">
                <tr>
                  <th className="p-4 text-left font-medium">Gerät</th>
                  <th className="p-4 text-left font-medium">Inventar</th>
                  <th className="p-4 text-left font-medium">Raum</th>
                  <th className="p-4 text-left font-medium">Status</th>
                  <th className="p-4 text-left font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {latest.length ? latest.map((device) => <DeviceRow key={device.id} device={device} />) : <EmptyRows />}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-gray-500 md:text-sm">{label}</div>
      <div className={`mt-1 text-2xl font-bold md:text-3xl ${color}`}>{value}</div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, text, tone }) {
  const tones = {
    neutral: 'bg-gray-800 text-gray-100',
    green: 'bg-green-950/50 text-green-500',
    orange: 'bg-orange-950/40 text-orange-500',
    red: 'bg-red-950/40 text-red-500'
  };

  return (
    <Link to={to} className="card p-4 text-left transition hover:scale-[1.01]">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon size={21} />
      </div>
      <div className="font-semibold text-gray-800">{title}</div>
      <div className="mt-1 text-xs text-gray-500">{text}</div>
    </Link>
  );
}

function DeviceCard({ device }) {
  const status = statusBadge(device.status);
  return (
    <Link to={`/devices/${device.id}`} className="flex min-h-20 items-center gap-3 p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-gray-100">
        <Cpu size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-gray-800">{device.model || device.inventoryId}</div>
        <div className="mt-0.5 truncate text-xs text-gray-500">{device.inventoryId} - {device.room?.name || 'Kein Raum'}</div>
      </div>
      <span className={`badge shrink-0 ${status.className}`}>{status.label}</span>
    </Link>
  );
}

function DeviceRow({ device }) {
  const status = statusBadge(device.status);
  return (
    <tr className="table-row">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-800 text-gray-100">
            <Cpu size={19} />
          </div>
          <div>
            <div className="font-medium text-gray-800">{device.model || device.inventoryId}</div>
            <div className="text-xs text-gray-500">{device.manufacturer || 'Gerät'}</div>
          </div>
        </div>
      </td>
      <td className="p-4 text-gray-600">{device.inventoryId}</td>
      <td className="p-4 text-gray-600">{device.room?.name || '-'}</td>
      <td className="p-4"><span className={`badge ${status.className}`}>{status.label}</span></td>
      <td className="p-4"><Link className="font-medium text-gray-200" to={`/devices/${device.id}`}>Öffnen</Link></td>
    </tr>
  );
}

function EmptyRows() {
  return (
    <tr className="table-row">
      <td className="p-6 text-sm text-gray-500" colSpan="5">Noch keine Geräte vorhanden.</td>
    </tr>
  );
}

function EmptyState({ text }) {
  return <div className="p-5 text-sm text-gray-500">{text}</div>;
}

function statusBadge(status) {
  const map = {
    AVAILABLE: ['Verfügbar', 'bg-green-100 text-green-700'],
    LOANED: ['Verliehen', 'bg-orange-100 text-orange-600'],
    RESERVED: ['Reserviert', 'bg-yellow-100 text-yellow-700'],
    DEFECT: ['Defekt', 'bg-red-100 text-red-700'],
    MAINTENANCE: ['Wartung', 'bg-gray-100 text-gray-700'],
    RETIRED: ['Ausgemustert', 'bg-gray-100 text-gray-600']
  };
  const [label, className] = map[status] || map.AVAILABLE;
  return { label, className };
}
