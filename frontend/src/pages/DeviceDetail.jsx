import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Copy, Cpu, Download, Pencil, Printer, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { AssetLabel } from '../components/AssetLabel';

const statusLabels = {
  AVAILABLE: 'Verfügbar',
  LOANED: 'Verliehen',
  RESERVED: 'Reserviert',
  DEFECT: 'Defekt',
  MAINTENANCE: 'Wartung',
  RETIRED: 'Ausgemustert'
};

export default function DeviceDetail({ print = false }) {
  const { id } = useParams();
  const { user } = useAuth();
  const canEdit = ['STAFF', 'ADMIN'].includes(user?.role);
  const [device, setDevice] = useState(null);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    Promise.all([
      api.get(`/devices/${id}`),
      api.get('/settings/public').catch(() => ({ data: { settings: {} } }))
    ]).then(([deviceResult, settingsResult]) => {
      setDevice(deviceResult.data.device);
      setSettings(settingsResult.data.settings || {});
    });
  }, [id]);

  if (!device) return <div className="text-sm text-gray-500">Laden...</div>;
  const qrValue = device.qrCode || `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/devices/${device.inventoryId}`;

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
    await navigator.clipboard.writeText(qrValue);
  }

  if (print) {
    return (
      <div className="label-sheet bg-white">
        <AssetLabel align="start" device={device} settings={settings} qrValue={qrValue} />
      </div>
    );
  }

  const activeLoan = (device.loans || []).find((loan) => loan.status === 'ACTIVE' || loan.status === 'OVERDUE');
  const latestLoans = (device.loans || []).slice(0, 3);
  const monitoring = device.monitoringData;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="card overflow-hidden">
        <div className="flex min-h-40 items-center gap-5 bg-[#fafafa] p-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#27272a] text-[#e5e7eb]">
            <Cpu size={30} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{device.inventoryId}</h1>
            <p className="mt-1 text-sm text-gray-500">{[device.manufacturer, device.model].filter(Boolean).join(' ')}</p>
          </div>
        </div>
        <dl className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
          <Info label="Geräte-ID (Device-ID)" value={device.id} />
          <Info label="Inventarnummer" value={device.inventoryId} />
          <Info label="Hersteller" value={device.manufacturer} />
          <Info label="Modell / Bezeichnung" value={device.model} />
          <Info label="Seriennummer" value={device.serialNumber} />
          <Info label="Status" value={statusLabels[device.status] || device.status} />
          <Info label="Standort" value={device.room?.name} />
          <Info label="Gebäude" value={device.room?.building} />
          <Info label="Raumtyp" value={device.room?.type} />
          <Info label="Kaufdatum" value={device.purchaseDate?.slice(0, 10)} />
          <Info label="Garantieende" value={device.warrantyEnd?.slice(0, 10)} />
          <Info label="Angelegt" value={device.createdAt?.slice(0, 10)} />
          <Info label="Aktualisiert" value={device.updatedAt?.slice(0, 10)} />
        </dl>
        {(device.labels?.length || device.description) && (
          <div className="space-y-4 border-t border-black/5 p-6">
            {device.labels?.length ? (
              <div className="flex flex-wrap gap-2">
                {device.labels.map((label) => <span key={label} className="badge bg-[#27272a] text-[#e5e7eb]">{label}</span>)}
              </div>
            ) : null}
            {device.description && <p className="text-sm leading-6 text-gray-700">{device.description}</p>}
          </div>
        )}
        <div className="grid gap-4 border-t border-black/5 p-6 lg:grid-cols-2">
          <Panel title="Aktuelle Ausleihe">
            {activeLoan ? (
              <div className="space-y-2 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">{activeLoan.borrowerName || activeLoan.user?.username || '-'}</div>
                <div>{activeLoan.borrowerGroup || 'Keine Gruppe hinterlegt'}</div>
                <div>Rückgabe bis {activeLoan.dueDate?.slice(0, 10) || '-'}</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Dieses Gerät ist aktuell nicht ausgeliehen.</div>
            )}
          </Panel>
          <Panel title="Monitoring">
            {monitoring ? (
              <div className="grid gap-2 text-sm text-gray-700">
                <div className="flex justify-between"><span>Hostname</span><strong>{monitoring.hostname || '-'}</strong></div>
                <div className="flex justify-between"><span>IP</span><strong>{monitoring.ip || '-'}</strong></div>
                <div className="flex justify-between"><span>Online</span><strong>{monitoring.online ? 'Ja' : 'Nein'}</strong></div>
                <div className="flex justify-between"><span>Zuletzt gesehen</span><strong>{monitoring.lastSeen?.slice(0, 16).replace('T', ' ') || '-'}</strong></div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Keine Monitoring-Daten vorhanden.</div>
            )}
          </Panel>
        </div>
        <div className="border-t border-black/5 p-6">
          <Panel title="Letzte Ausleihen">
            {latestLoans.length ? (
              <div className="divide-y divide-black/5">
                {latestLoans.map((loan) => (
                  <div key={loan.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <div className="font-semibold text-gray-800">{loan.borrowerName || loan.user?.username || '-'}</div>
                      <div className="text-gray-500">{loan.startDate?.slice(0, 10)} bis {loan.returnDate?.slice(0, 10) || loan.dueDate?.slice(0, 10) || '-'}</div>
                    </div>
                    <span className="badge bg-[#fafafa] text-gray-700">{loan.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Noch keine Ausleihen dokumentiert.</div>
            )}
          </Panel>
        </div>
      </section>
      
      {canEdit ? (
        <aside className="card p-6">
          <div className="mb-4">
            <div className="font-semibold text-gray-800">Label</div>
            <div className="text-sm text-gray-500">QR-Code, Organisation, Gerätename und Standort</div>
          </div>
          <div className="overflow-hidden rounded-2xl bg-[#fafafa] p-5">
            <AssetLabel preview device={device} settings={settings} qrValue={qrValue} />
          </div>
          <div className="mt-4 space-y-2">
            <Link className="btn-primary w-full flex justify-center gap-2" to={`/devices/${device.id}/edit`}><Pencil size={16} />Bearbeiten</Link>
            <button className="btn-secondary w-full" onClick={copyQrLink}><Copy size={16} />Link kopieren</button>
            <button className="btn-secondary w-full" onClick={downloadQr}><Download size={16} />QR-Code (PNG)</button>
            <button className="btn-secondary w-full" onClick={downloadLabel}><Download size={16} />Label (SVG)</button>
            <Link className="btn-secondary w-full flex justify-center gap-2" to={`/devices/${device.id}/print`}><Printer size={16} />Druckansicht</Link>
            <Link className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 w-full flex justify-center gap-2" to={`/issues/new?deviceId=${device.id}`}><AlertCircle size={16} />Fehler melden</Link>
          </div>
        </aside>
      ) : (
        <aside className="card p-6 flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-12 w-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">Gibt es ein Problem?</h3>
            <p className="text-sm text-gray-500 mt-1">Du kannst hier einen Defekt oder Fehler für dieses Gerät an die IT melden.</p>
          </div>
          <Link className="btn-primary w-full flex justify-center gap-2 mt-2" to={`/issues/new?deviceId=${device.id}`}><AlertCircle size={16} />Fehler melden</Link>
        </aside>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-[#fafafa] p-4">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-gray-800">{value || '-'}</dd>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-2xl bg-[#fafafa] p-4">
      <div className="mb-3 text-sm font-semibold text-gray-800">{title}</div>
      {children}
    </section>
  );
}
