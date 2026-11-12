import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, ArrowLeftRight, Cpu, MessageSquareWarning, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useDevices } from '../hooks/useDevices';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { SkeletonBlock } from '../components/Loading';
import { issueTypeMeta, issueContext } from '../components/issueMeta';
import { MyDeviceEmbed } from '../components/MyDeviceCard';
import { SupportFooter } from '../components/SupportFooter';

// Vereinfachtes Dashboard für VIEWER-Benutzer.
// Zeigt nur die für den normalen Benutzer relevanten Informationen:
// - Meine aktiven Ausleihen
// - Meine offenen Tickets (Fehlermeldungen)
// - Aktuell defekte Geräte
export default function ViewerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { devices, loading: devicesLoading } = useDevices();
  const [loans, setLoans] = useState([]);
  const [issues, setIssues] = useState([]);

  // Lädt Ausleihen und Tickets des aktuellen Benutzers.
  // Das Backend filtert automatisch auf die eigenen Einträge, wenn der Benutzer kein STAFF/ADMIN ist.
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

  const defectDevices = useMemo(() => {
    return devices.filter((device) => device.status === 'DEFECT').slice(0, 5);
  }, [devices]);

  const activeLoans = useMemo(() => {
    return loans.filter((l) => ['ACTIVE', 'OVERDUE'].includes(l.status));
  }, [loans]);

  const openIssues = useMemo(() => {
    return issues.filter((i) => ['OPEN', 'IN_PROGRESS', 'WAITING'].includes(i.status));
  }, [issues]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Dashboard</h1>
      <p className="text-sm text-gray-500">Willkommen, {user?.displayName || user?.username || 'Benutzer'}!</p>

      {/* Mein Gerät (Konzept Abschnitt 22) */}
      <MyDeviceEmbed />

      {/* Meine aktiven Ausleihen */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-blue-500" />
            Meine Ausleihen
          </h2>
          <Link to="/loans/my" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Alle anzeigen</Link>
        </div>
        {activeLoans.length > 0 ? (
          <ul className="divide-y divide-outline-variant">
            {activeLoans.map((loan) => (
              <li key={loan.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Cpu size={16} className="text-gray-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800 dark:text-gray-100 truncate">
                    {loan.device?.model || loan.device?.inventoryId || 'Gerät'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {loan.status === 'OVERDUE' ? 'Überfällig' : 'Aktiv'} · Rückgabe bis {loan.dueDate?.slice(0, 10) || '-'}
                  </div>
                </div>
                <Link to={`/devices?id=${loan.deviceId}`} className="btn-secondary !py-1 !px-2 text-xs">Öffnen</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-gray-500">Du hast aktuell keine aktiven Ausleihen.</p>
        )}
      </section>

      {/* Meine offenen Tickets */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <MessageSquareWarning size={16} className="text-rose-500" />
            Meine Tickets
          </h2>
          <Link to="/issues" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Alle anzeigen</Link>
        </div>
        {openIssues.length > 0 ? (
          <ul className="divide-y divide-outline-variant">
            {openIssues.map((issue) => (
              <li key={issue.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className={`h-2 w-2 shrink-0 rounded-full ${issue.priority === 'CRITICAL' ? 'bg-red-500' : issue.priority === 'HIGH' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800 dark:text-gray-100 truncate">{issue.title}</div>
                  <div className="text-xs text-gray-500">
                    {issueTypeMeta(issue.type).label}{issueContext(issue) ? ` · ${issueContext(issue)}` : ''} · {new Date(issue.createdAt).toLocaleDateString('de-DE')}
                  </div>
                </div>
                <Link to={`/issues?id=${issue.id}`} className="btn-secondary !py-1 !px-2 text-xs">Öffnen</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-gray-500">Keine offenen Tickets.</p>
        )}
      </section>

      {/* Aktuell defekte Geräte */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            Defekte Geräte
          </h2>
          <Link to="/devices?status=DEFECT" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Alle anzeigen</Link>
        </div>
        {devicesLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <SkeletonBlock className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <SkeletonBlock className="h-3.5 w-2/5 rounded" />
                  <SkeletonBlock className="h-3 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : defectDevices.length > 0 ? (
          <ul className="divide-y divide-outline-variant">
            {defectDevices.map((device) => (
              <li key={device.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                  <Cpu size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800 dark:text-gray-100 truncate">{device.inventoryId}</div>
                  <div className="text-xs text-gray-500">{[device.manufacturer, device.model].filter(Boolean).join(' ') || '-'}</div>
                </div>
                <Link to={`/devices?id=${device.id}`} className="btn-secondary !py-1 !px-2 text-xs">Öffnen</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-gray-500">Aktuell sind keine defekten Geräte eingetragen.</p>
        )}
      </section>

      <SupportFooter />
    </div>
  );
}