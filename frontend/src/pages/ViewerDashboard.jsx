import { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardCheck,
  Cpu,
  DoorOpen,
  MailOpen,
  MessageSquareWarning,
  Wrench
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDevices } from '../hooks/useDevices';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { issueTypeMeta, issueContext } from '../components/issueMeta';
import { MyDeviceEmbed } from '../components/MyDeviceCard';
import { SupportFooter } from '../components/SupportFooter';

const MODULE_TONES = {
  blue: 'bg-badge-blue text-text-badge-blue',
  orange: 'bg-badge-orange text-text-badge-orange',
  violet: 'bg-badge-violet text-text-badge-violet',
  green: 'bg-badge-green text-text-badge-green',
  yellow: 'bg-badge-yellow text-text-badge-yellow',
  red: 'bg-badge-red text-text-badge-red'
};

export default function ViewerDashboard() {
  const { user } = useAuth();
  const { devices } = useDevices();
  const [loans, setLoans] = useState([]);
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    let ignore = false;
    api.get('/loans').then(({ data }) => {
      if (!ignore) setLoans(data.loans || []);
    }).catch(() => {});
    api.get('/issues').then(({ data }) => {
      if (!ignore) setIssues(data.issues || []);
    }).catch(() => {});
    return () => { ignore = true; };
  }, []);

  const permissions = user?.effectivePermissions || [];
  const revokedPermissions = user?.revokedPermissions || [];
  const canAccess = (permission) => (
    permissions.includes(permission) || permissions.includes('ADMIN')
  ) && !revokedPermissions.includes(permission);

  const defectDevices = useMemo(() => {
    return devices.filter((device) => device.status === 'DEFECT').slice(0, 5);
  }, [devices]);

  const activeLoans = useMemo(() => {
    return loans.filter((loan) => ['ACTIVE', 'OVERDUE'].includes(loan.status));
  }, [loans]);

  const openIssues = useMemo(() => {
    return issues.filter((issue) => ['OPEN', 'IN_PROGRESS', 'WAITING'].includes(issue.status));
  }, [issues]);

  const showDevices = canAccess('DEVICE_VIEW');
  const showLoans = canAccess('LOAN_VIEW');
  const showTickets = canAccess('ISSUE_VIEW');

  const showLoanMessages = showLoans && activeLoans.length > 0;
  const showTicketMessages = showTickets && openIssues.length > 0;
  const showDeviceMessages = showDevices && defectDevices.length > 0;
  const hasOverview = showLoanMessages || showTicketMessages || showDeviceMessages;
  const overviewLabels = [
    showLoanMessages ? 'Ausleihen' : null,
    showTicketMessages ? 'Tickets' : null,
    showDeviceMessages ? 'Gerätehinweise' : null
  ].filter(Boolean);

  const modules = [];

  if (showDevices) {
    modules.push({
      to: '/devices',
      label: 'Geräte',
      icon: Cpu,
      tone: MODULE_TONES.blue
    });
  }

  if (showLoans) {
    modules.push({
      to: '/loans',
      label: 'Ausleihen',
      icon: ArrowLeftRight,
      tone: MODULE_TONES.orange
    });
  }

  if (showTickets) {
    modules.push({
      to: '/issues',
      label: 'Tickets',
      icon: MessageSquareWarning,
      tone: MODULE_TONES.violet
    });
  }

  if (canAccess('ROOM_VIEW')) {
    modules.push({
      to: '/rooms',
      label: 'Räume',
      icon: DoorOpen,
      tone: MODULE_TONES.green
    });
  }

  if (canAccess('UPDATE_VIEW')) {
    modules.push({
      to: '/updates',
      label: 'Geräte-Updates',
      icon: ClipboardCheck,
      tone: MODULE_TONES.yellow
    });
  }

  if (canAccess('ISSUE_MANAGE')) {
    modules.push({
      to: '/issues/manage',
      label: 'Ticket-Board',
      icon: Wrench,
      tone: MODULE_TONES.red
    });
  }

  if (canAccess('MAIL_MANAGE')) {
    modules.push({
      to: '/email-support',
      label: 'E-Mail-Support',
      icon: MailOpen,
      tone: MODULE_TONES.violet
    });
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-outline">Startseite</p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight text-on-surface">
            Hallo, {user?.displayName || user?.username || 'Benutzer'}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Deine freigegebenen Module und aktuellen Informationen auf einen Blick.
          </p>
        </div>
        <span className="badge w-fit bg-surface-container-high text-on-surface-variant">
          {modules.length} {modules.length === 1 ? 'Modul' : 'Module'} freigegeben
        </span>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Meine Module</h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Direkter Zugriff auf alle Bereiche, die für dich freigegeben sind.
          </p>
        </div>

        {modules.length > 0 ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] sm:gap-4">
            {modules.map(({ to, label, icon: Icon, tone }) => (
              <Link
                key={to}
                to={to}
                className="group card flex min-h-[150px] flex-col items-center justify-center gap-4 p-5 text-center transition hover:ring-1 hover:ring-primary/30 sm:min-h-[180px]"
              >
                <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                  <Icon size={32} />
                </span>
                <span className="text-base font-semibold text-on-surface">{label}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card p-6 text-sm text-on-surface-variant">
            Dir sind aktuell keine Module freigegeben. Bitte wende dich an die IT.
          </div>
        )}
      </section>

      <MyDeviceEmbed />

      {hasOverview && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Meine Übersicht</h2>
            <p className="mt-0.5 text-sm text-on-surface-variant">
              Aktuelle {overviewLabels.join(', ')}.
            </p>
          </div>

          {(showLoanMessages || showTicketMessages) && (
            <div className={`grid gap-4 ${showLoanMessages && showTicketMessages ? 'lg:grid-cols-2' : ''}`}>
              {showLoanMessages && (
                <section className="card h-full overflow-hidden">
                  <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
                    <h3 className="flex items-center gap-2 font-semibold text-on-surface">
                      <ArrowLeftRight size={16} className="text-badge-orange" />
                      Meine Ausleihen
                    </h3>
                    <Link to="/loans/my" className="text-xs text-primary hover:underline">Alle anzeigen</Link>
                  </div>
                  <ul className="divide-y divide-outline-variant">
                    {activeLoans.map((loan) => (
                      <li key={loan.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                        <Cpu size={16} className="shrink-0 text-outline" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-on-surface">
                            {loan.device?.model || loan.device?.inventoryId || 'Gerät'}
                          </div>
                          <div className="text-xs text-on-surface-variant">
                            {loan.status === 'OVERDUE' ? 'Überfällig' : 'Aktiv'} · Rückgabe bis {loan.dueDate?.slice(0, 10) || '-'}
                          </div>
                        </div>
                        <Link to={`/devices?id=${loan.deviceId}`} className="btn-secondary !px-2 !py-1 text-xs">Öffnen</Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {showTicketMessages && (
                <section className="card h-full overflow-hidden">
                  <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
                    <h3 className="flex items-center gap-2 font-semibold text-on-surface">
                      <MessageSquareWarning size={16} className="text-badge-violet" />
                      Meine Tickets
                    </h3>
                    <Link to="/issues" className="text-xs text-primary hover:underline">Alle anzeigen</Link>
                  </div>
                  <ul className="divide-y divide-outline-variant">
                    {openIssues.map((issue) => (
                      <li key={issue.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                        <div className={`h-2 w-2 shrink-0 rounded-full ${issue.priority === 'CRITICAL' ? 'bg-red-500' : issue.priority === 'HIGH' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-on-surface">{issue.title}</div>
                          <div className="text-xs text-on-surface-variant">
                            {issueTypeMeta(issue.type).label}{issueContext(issue) ? ` · ${issueContext(issue)}` : ''} · {new Date(issue.createdAt).toLocaleDateString('de-DE')}
                          </div>
                        </div>
                        <Link to={`/issues?id=${issue.id}`} className="btn-secondary !px-2 !py-1 text-xs">Öffnen</Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {showDeviceMessages && (
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
                <h3 className="flex items-center gap-2 font-semibold text-on-surface">
                  <AlertTriangle size={16} className="text-badge-red" />
                  Defekte Geräte
                </h3>
                <Link to="/devices?status=DEFECT" className="text-xs text-primary hover:underline">Alle anzeigen</Link>
              </div>
              <ul className="divide-y divide-outline-variant">
                {defectDevices.map((device) => (
                  <li key={device.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-badge-red text-text-badge-red">
                      <Cpu size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-on-surface">{device.inventoryId}</div>
                      <div className="text-xs text-on-surface-variant">{[device.manufacturer, device.model].filter(Boolean).join(' ') || '-'}</div>
                    </div>
                    <Link to={`/devices?id=${device.id}`} className="btn-secondary !px-2 !py-1 text-xs">Öffnen</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      )}

      <SupportFooter />
    </div>
  );
}
