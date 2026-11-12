import { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle, AlertCircle, ArrowLeftRight, CheckCircle2, ChevronLeft, ChevronRight,
  ChevronRight as ChevronRightArrow, Clock, Cpu, MessageSquareWarning, Plus, Search,
  Wrench, Building2, List
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useDevices } from '../hooks/useDevices';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import StatusPill from '../components/StatusPill';
import { MyDeviceEmbed } from '../components/MyDeviceCard';
import { SupportFooter } from '../components/SupportFooter';
import { STATUS_BADGES as statusLabels } from '../components/deviceMeta';

const PAGE_SIZE = 6;

const statusOrder = ['AVAILABLE', 'LOANED', 'RESERVED', 'LIMITED', 'DEFECT', 'MAINTENANCE', 'RETIRED'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { devices } = useDevices();
  const [loans, setLoans] = useState([]);
  const [issues, setIssues] = useState([]);
  const [globalQuery, setGlobalQuery] = useState('');
  const [page, setPage] = useState(1);

  const permissions = user?.effectivePermissions || [];
  const canCreate = permissions.includes('DEVICE_CREATE');
  const canManageIssues = permissions.includes('ISSUE_MANAGE');
  const canManageLoans = permissions.includes('LOAN_MANAGE');

  useEffect(() => {
    let ignore = false;
    api.get('/loans').then(({ data }) => { if (!ignore) setLoans(data.loans || []); }).catch(() => { if (!ignore) setLoans([]); });
    api.get('/issues/all').then(({ data }) => { if (!ignore) setIssues(data.issues || []); }).catch(() => {
      api.get('/issues').then(({ data }) => { if (!ignore) setIssues(data.issues || []); }).catch(() => { if (!ignore) setIssues([]); });
    });
    return () => { ignore = true; };
  }, []);

  const totalDevices = devices.length;
  const availableCount = devices.filter((d) => d.status === 'AVAILABLE').length;
  const loanedCount = devices.filter((d) => d.status === 'LOANED').length;
  const defectCount = devices.filter((d) => d.status === 'DEFECT').length;
  const maintenanceCount = devices.filter((d) => d.status === 'MAINTENANCE').length;
  const reservedCount = devices.filter((d) => d.status === 'RESERVED').length;
  const availablePercentage = totalDevices > 0 ? Math.round((availableCount / totalDevices) * 100) : 0;

  const openIssues = useMemo(() => issues.filter((i) => ['OPEN', 'IN_PROGRESS', 'WAITING'].includes(i.status)), [issues]);
  const criticalIssues = openIssues.filter((i) => i.priority === 'CRITICAL').length;
  const requestedLoans = loans.filter((l) => l.status === 'REQUESTED').length;
  const overdueLoans = loans.filter((l) => l.status === 'OVERDUE').length;

  const activeBorrowers = useMemo(() => {
    const map = {};
    loans.forEach((loan) => {
      if (['ACTIVE', 'OVERDUE'].includes(loan.status) && !map[loan.deviceId]) {
        map[loan.deviceId] = loan.user?.displayName || loan.borrowerName || loan.user?.username || '-';
      }
    });
    return map;
  }, [loans]);

  const categoryStats = useMemo(() => {
    const cats = {};
    devices.forEach((d) => {
      const cat = d.manufacturer || 'Sonstige';
      if (!cats[cat]) cats[cat] = { name: cat, count: 0 };
      cats[cat].count++;
    });
    const sorted = Object.values(cats).sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, 4);
    const otherCount = sorted.slice(4).reduce((sum, c) => sum + c.count, 0);
    if (otherCount > 0) top.push({ name: 'Sonstige', count: otherCount });
    return top;
  }, [devices]);

  const statusStats = useMemo(() => statusOrder.map((status) => ({ status, count: devices.filter((d) => d.status === status).length })), [devices]);

  const latestDevices = useMemo(() => {
    return [...devices].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }, [devices]);

  const visibleDevices = latestDevices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const maxPage = Math.max(1, Math.ceil(latestDevices.length / PAGE_SIZE));
  useEffect(() => { if (page > maxPage) setPage(1); }, [page, maxPage]);

  const activities = useMemo(() => {
    const list = [];
    devices.forEach((d) => list.push({ ts: new Date(d.createdAt), type: 'created', name: d.model || d.inventoryId, id: d.id }));
    loans.forEach((l) => {
      if (['ACTIVE', 'OVERDUE'].includes(l.status)) {
        list.push({ ts: new Date(l.startDate), type: 'loaned', name: l.device?.model || l.device?.inventoryId || l.borrowerName, id: l.id });
      } else if (l.status === 'RETURNED' && l.returnDate) {
        list.push({ ts: new Date(l.returnDate), type: 'returned', name: l.device?.model || l.device?.inventoryId || l.borrowerName, id: l.id });
      }
    });
    issues.forEach((i) => list.push({ ts: new Date(i.createdAt), type: 'issue', name: i.title, id: i.id }));
    return list.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [devices, loans, issues]);

  const alerts = useMemo(() => {
    const next = [];
    if (maintenanceCount > 0) next.push({ tone: 'orange', icon: Wrench, text: `${maintenanceCount} Gerät(e) in Wartung`, to: '/devices' });
    if (defectCount > 0) next.push({ tone: 'red', icon: AlertCircle, text: `${defectCount} Gerät(e) als defekt markiert`, to: '/devices' });
    if (overdueLoans > 0) next.push({ tone: 'red', icon: Clock, text: `${overdueLoans} überfällige Ausleihen`, to: '/loans' });
    if (requestedLoans > 0) next.push({ tone: 'blue', icon: ArrowLeftRight, text: `${requestedLoans} ausstehende Ausleihanfragen`, to: '/loans' });
    if (openIssues.length > 0) next.push({ tone: 'red', icon: MessageSquareWarning, text: `${openIssues.length} offene Fehlertickets${criticalIssues > 0 ? ` (${criticalIssues} kritisch)` : ''}`, to: '/issues' });
    return next;
  }, [maintenanceCount, defectCount, overdueLoans, requestedLoans, openIssues.length, criticalIssues]);

  const donutColors = ['#4D9EFF', '#F59E0B', '#A78BFA', '#22D3B6', '#F05252'];
  const statusColors = { AVAILABLE: '#4D9EFF', LOANED: '#F59E0B', RESERVED: '#A78BFA', DEFECT: '#F05252', MAINTENANCE: '#FB923C', RETIRED: '#777873' };
  const donutTotal = categoryStats.reduce((sum, c) => sum + c.count, 0);
  const donutRadius = 50;
  const donutStroke = 20;
  const circumference = 2 * Math.PI * donutRadius;
  let accumulated = 0;
  const statusRingRadius = 2 * Math.PI * 46;
  const statusRingFilled = statusRingRadius * (availablePercentage / 100);

  function submitGlobalSearch(event) {
    event.preventDefault();
    const q = globalQuery.trim();
    if (q) navigate(`/devices?search=${encodeURIComponent(q)}`);
    else navigate('/devices');
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* 1. Kopfbereich */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-on-surface leading-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Übersicht über deine Geräte und aktuellen Aktivitäten</p>
        </div>
        <form onSubmit={submitGlobalSearch} className="relative w-full md:w-80 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={17} />
          <input
            className="field pl-9"
            placeholder="Gerät, Asset-ID, Standort suchen..."
            value={globalQuery}
            onChange={(event) => setGlobalQuery(event.target.value)}
          />
        </form>
      </div>

      {/* Mein Gerät (Konzept Abschnitt 22) */}
      <MyDeviceEmbed />

      {/* 2. KPI-Übersicht */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Cpu}
          label="Geräte gesamt"
          value={totalDevices}
          tone="neutral"
          accent="bg-surface-container-high text-on-surface"
          subtext={totalDevices > 0 ? `${deviceCountPerRoom(devices)} Standorte` : 'Noch keine Geräte erfasst'}
          bars={categoryStats.slice(0, 5).map((c) => donutTotal > 0 ? Math.round((c.count / donutTotal) * 100) : 0)}
          to="/devices"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Verfügbar"
          value={availableCount}
          tone="blue"
          accent="bg-badge-green/15 text-badge-green"
          subtext={totalDevices > 0 ? `${availablePercentage}% aller Geräte` : '0% aller Geräte'}
          to="/devices"
        />
        <KpiCard
          icon={ArrowLeftRight}
          label="Ausgeliehen"
          value={loanedCount}
          tone="amber"
          accent="bg-badge-orange/15 text-badge-orange"
          subtext={requestedLoans > 0 ? `${requestedLoans} offene Anfragen` : `${reservedCount} reserviert`}
          to="/loans"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Offline / Fehler"
          value={defectCount}
          tone="red"
          accent="bg-badge-red/15 text-badge-red"
          subtext={defectCount > 0 || maintenanceCount > 0 ? `${defectCount} defekt · ${maintenanceCount} Wartung` : 'Alles einsatzbereit'}
          to="/issues"
        />
      </section>

      {/* 3. Analysebereich */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Geräte nach Typ */}
        <div className="card p-5 h-full">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-outline">Geräte nach Typ</h2>
          {donutTotal > 0 ? (
            <div className="flex items-center gap-6 h-[200px]">
              <div className="relative shrink-0">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  {categoryStats.map((cat, i) => {
                    const pct = donutTotal > 0 ? cat.count / donutTotal : 0;
                    const dashLength = (2 * Math.PI * 62) * pct;
                    const dashOffset = -(2 * Math.PI * 62) * (accumulated / donutTotal);
                    accumulated += cat.count;
                    return (
                      <circle key={cat.name} cx="80" cy="80" r="62" fill="none" stroke={donutColors[i % donutColors.length]} strokeWidth="24" strokeDasharray={`${dashLength} ${(2 * Math.PI * 62) - dashLength}`} strokeDashoffset={dashOffset} strokeLinecap="round" />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-on-surface">{donutTotal}</span>
                  <span className="text-xs text-on-surface-variant">Geräte</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {categoryStats.map((cat, i) => {
                  const pct = donutTotal > 0 ? Math.round((cat.count / donutTotal) * 100) : 0;
                  return (
                    <div key={cat.name} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: donutColors[i % donutColors.length] }} />
                      <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">{cat.name}</span>
                      <span className="text-sm font-semibold text-on-surface">{cat.count}</span>
                      <span className="w-10 text-right text-xs text-outline">({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyNote>Noch keine Geräte erfasst.</EmptyNote>
          )}
        </div>

        {/* Gerätestatus */}
        <div className="card p-5 h-full">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-outline">Gerätestatus</h2>
          {totalDevices > 0 ? (
            <div className="flex gap-6 items-center h-[200px]">
              <div className="relative h-40 w-40 shrink-0">
                <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
                  <circle cx="80" cy="80" r="62" fill="none" stroke="rgba(119,120,115,0.25)" strokeWidth="18" />
                  <circle cx="80" cy="80" r="62" fill="none" stroke="#4D9EFF" strokeWidth="18" strokeDasharray={`${statusRingFilled} ${statusRingRadius - statusRingFilled}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-on-surface">{availablePercentage}%</span>
                  <span className="text-xs text-on-surface-variant text-center leading-tight">verfügbar</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                {statusStats.map(({ status, count }) => (
                  <div key={status} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: statusColors[status] }} />
                    <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">{statusLabels[status]?.[0] || status}</span>
                    <span className="text-sm font-semibold text-on-surface">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyNote>Noch keine Geräte erfasst.</EmptyNote>
          )}
        </div>
      </section>

      {/* 4. Aktuelle Geräte */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant p-5">
          <div>
            <h2 className="font-bold text-on-surface text-base">Aktuelle Geräte</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Zuletzt hinzugefügte oder geänderte Geräte</p>
          </div>
          <Link className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" to="/devices">
            Alle anzeigen <ChevronRightArrow size={14} />
          </Link>
        </div>
        {/* Mobil: Kartenliste statt Tabelle – auf dem Handy bleibt so alles lesbar */}
        <div className="divide-y divide-outline-variant md:hidden">
          {visibleDevices.length > 0 ? (
            visibleDevices.map((device) => (
              <Link
                key={device.id}
                to={`/devices?id=${device.id}`}
                className="flex items-center gap-3 p-4 active:bg-surface-container-low"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant">
                  <Cpu size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-on-surface">{device.model || device.inventoryId}</div>
                  <div className="truncate text-xs text-on-surface-variant">
                    <span className="font-mono">{device.inventoryId}</span>
                    {device.manufacturer ? ` · ${device.manufacturer}` : ''}
                    {device.room?.name ? ` · ${device.room.name}` : ''}
                  </div>
                </div>
                <StatusPill status={device.status} />
              </Link>
            ))
          ) : (
            <div className="p-6 text-center text-on-surface-variant">
              Noch keine Geräte registriert. Lege über „Gerät anlegen“ das erste Asset an.
            </div>
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-outline-variant text-left text-[10px] uppercase tracking-wider text-outline">
              <tr>
                <th className="p-4 font-semibold">Asset-ID</th>
                <th className="p-4 font-semibold">Bezeichnung</th>
                <th className="p-4 font-semibold">Typ</th>
                <th className="p-4 font-semibold">Benutzer</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Standort</th>
                <th className="p-4 font-semibold">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {visibleDevices.length > 0 ? (
                visibleDevices.map((device) => {
                  return (
                    <tr key={device.id} onClick={() => navigate(`/devices?id=${device.id}`)} className="table-row cursor-pointer">
                      <td className="p-4 font-mono text-xs text-outline">{device.inventoryId}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant">
                            <Cpu size={16} />
                          </div>
                          <span className="font-semibold text-on-surface">{device.model || device.inventoryId}</span>
                        </div>
                      </td>
                      <td className="p-4 text-on-surface-variant">{device.manufacturer || '-'}</td>
                      <td className="p-4 text-on-surface-variant">{activeBorrowers[device.id] || '-'}</td>
                      <td className="p-4"><StatusPill status={device.status} /></td>
                      <td className="p-4 text-on-surface-variant">{device.room?.name || '-'}</td>
                      <td className="p-4">
                        <Link className="font-medium text-primary hover:underline" to={`/devices?id=${device.id}`}>Öffnen</Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={7} className="p-6 text-center text-on-surface-variant">Noch keine Geräte registriert. Lege über „Gerät anlegen“ das erste Asset an.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {latestDevices.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant px-5 py-3 text-xs text-on-surface-variant">
            <span>
              Zeigt {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, latestDevices.length)} von {latestDevices.length} Geräten
            </span>
            <div className="flex items-center gap-1">
              <button className="header-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} title="Vorherige Seite">
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 font-semibold text-on-surface">{page} / {maxPage}</span>
              <button className="header-btn" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))} title="Nächste Seite">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 6.+7. Letzte Aktivitäten + Meldungen */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-outline-variant p-5">
            <h2 className="font-bold text-on-surface text-base">Letzte Aktivitäten</h2>
          </div>
          <div className="divide-y divide-outline-variant">
            {activities.length > 0 ? activities.map((activity) => {
              const meta = activityMeta(activity.type);
              const Icon = meta.icon;
              return (
                <Link key={`${activity.type}-${activity.id}-${activity.ts.toISOString()}`} to={meta.to(activity)} className="flex items-center gap-3 px-5 py-3 hover:bg-sidebar-item-hover transition -mx-2 px-2 rounded-lg">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.iconBg}`}>
                    <Icon size={16} className={meta.iconColor} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-on-surface">
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-on-surface-variant"> · {activity.name}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-outline">{formatTime(activity.ts)}</span>
                </Link>
              );
            }) : (
              <div className="p-6 text-center text-sm text-on-surface-variant">Noch keine Aktivitäten vorhanden.</div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-outline-variant p-5">
            <h2 className="font-bold text-on-surface text-base">Meldungen</h2>
          </div>
          <div className="p-5">
            {alerts.length > 0 ? (
              <div className="space-y-2">
                {alerts.map((alert, i) => {
                  const Icon = alert.icon;
                  return (
                    <Link key={i} to={alert.to} className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 transition hover:border-primary/40">
                      <Icon size={17} className={alertTone(alert.tone)} />
                      <span className="text-sm text-on-surface">{alert.text}</span>
                      <ChevronRightArrow size={15} className="ml-auto shrink-0 text-outline" />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
                <CheckCircle2 size={17} className="text-badge-green" />
                Keine aktuellen Meldungen vorhanden. Alles läuft reibungslos.
              </div>
            )}
          </div>
        </div>
      </section>

      <SupportFooter />
    </div>
  );
}

function deviceCountPerRoom(devices) {
  const rooms = new Set(devices.filter((d) => d.roomId).map((d) => d.roomId)).size;
  return rooms === 1 ? '1 Standort' : `${rooms} Standorte`;
}

function KpiCard({ icon: Icon, label, value, subtext, accent, bars, to, tone = 'neutral' }) {
  const stripColors = { neutral: '#454A50', blue: '#4D9EFF', amber: '#F59E0B', red: '#F05252' };
  return (
    <Link to={to} className="card group relative overflow-hidden p-5 transition hover:border-outline">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: stripColors[tone] || stripColors.neutral }} />
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
          <Icon size={20} />
        </div>
        <ChevronRightArrow size={16} className="text-outline transition group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 text-[11px] font-bold uppercase tracking-wider text-outline">{label}</div>
      <div className="mt-1 text-3xl font-bold text-on-surface">{value}</div>
      <div className="mt-1 text-xs text-on-surface-variant">{subtext}</div>
      {bars && bars.length > 0 && (
        <div className="mt-3 flex h-10 items-end gap-1">
          {bars.map((height, i) => (
            <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(6, Math.min(100, height * 0.5))}%`, background: donutColors(i) }} />
          ))}
        </div>
      )}
    </Link>
  );
}

function donutColors(index) {
  const palette = ['#4D9EFF', '#F59E0B', '#A78BFA', '#22D3B6', '#F05252'];
  return palette[index % palette.length];
}

function QuickTile({ to, icon: Icon, label, primary, emphasized }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 rounded-xl border p-3 transition ${primary ? 'border-primary/30 bg-primary/10 text-primary' : 'border-outline-variant bg-surface-container-low text-on-surface hover:border-outline'} ${emphasized ? 'border-badge-orange/50' : ''}`}
    >
      <Icon size={17} className={primary ? 'text-primary' : 'text-on-surface-variant'} />
      <span className="text-[13px] font-medium">{label}</span>
    </Link>
  );
}

function EmptyNote({ children }) {
  return <div className="rounded-xl bg-surface-container-low p-8 text-center text-sm text-on-surface-variant">{children}</div>;
}

function activityMeta(type) {
  switch (type) {
    case 'created':
      return {
        label: 'Neues Gerät angelegt',
        icon: Cpu,
        iconBg: 'bg-primary/10',
        iconColor: 'text-primary',
        to: (act) => `/devices?id=${act.id}`
      };
    case 'loaned':
      return {
        label: 'Gerät ausgeliehen',
        icon: ArrowLeftRight,
        iconBg: 'bg-badge-orange/15',
        iconColor: 'text-badge-orange',
        to: () => '/loans'
      };
    case 'returned':
      return {
        label: 'Gerät zurückgegeben',
        icon: CheckCircle2,
        iconBg: 'bg-badge-green/15',
        iconColor: 'text-badge-green',
        to: () => '/loans'
      };
    default:
      return {
        label: 'Fehler gemeldet',
        icon: MessageSquareWarning,
        iconBg: 'bg-badge-red/15',
        iconColor: 'text-badge-red',
        to: (act) => `/issues?id=${act.id}`
      };
  }
}

function alertTone(tone) {
  switch (tone) {
    case 'red': return 'text-badge-red';
    case 'orange': return 'text-badge-orange';
    case 'green': return 'text-badge-green';
    default: return 'text-primary';
  }
}

function formatTime(date) {
  if (!date) return '';
  const diffMs = new Date() - new Date(date);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  return diffD === 1 ? 'vor 1 Tag' : `vor ${diffD} Tagen`;
}