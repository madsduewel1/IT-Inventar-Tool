import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '../api/client';
import { AssetLabel, normalizeLabelSettings } from '../components/AssetLabel';
import { PageLoader } from '../components/Loading';

// A4 in Pixeln (96 dpi) – Grundlage für die skalierte Bildschirmvorschau.
const A4_WIDTH_PX = 210 * 3.7795;
const A4_HEIGHT_PX = 297 * 3.7795;

export default function DevicesPrint() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [devices, setDevices] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  // Der A4-Bogen bleibt immer 210 mm breit (nur so druckt er korrekt), wird auf
  // dem Bildschirm aber herunter skaliert, damit das Handy nicht waagerecht
  // scrollen muss.
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      const available = Math.max(220, window.innerWidth - 24);
      setPreviewScale(Math.min(1, available / A4_WIDTH_PX));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  useEffect(() => {
    const idsParam = searchParams.get('ids') || '';
    const ids = idsParam.split(',').filter(Boolean);

    if (ids.length === 0) {
      setLoading(false);
      return;
    }

    Promise.all([
      Promise.allSettled(ids.map(id => api.get(`/devices/${id}`).then(res => res.data.device))),
      api.get('/settings/public').catch(() => ({ data: { settings: {} } }))
    ])
      .then(([results, settingsResult]) => {
        const loadedDevices = results
          .filter(r => r.status === 'fulfilled')
          .map(r => r.value)
          .filter(Boolean);
        setDevices(loadedDevices);
        setSettings(settingsResult.data.settings || {});
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <PageLoader text="Lade Druckansicht…" />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app p-4 text-center">
        <div className="text-lg font-semibold text-gray-800 dark:text-zinc-200">Keine Geräte ausgewählt</div>
        <p className="text-sm text-gray-500 max-w-sm">Wähle Geräte in der Asset-Liste aus und klicke auf "Druckansicht anzeigen".</p>
        <button onClick={() => navigate('/devices')} className="btn-secondary flex items-center gap-2">
          <ArrowLeft size={16} /> Zurück zu Assets
        </button>
      </div>
    );
  }

  // Calculate layout dynamics
  const label = normalizeLabelSettings(settings);
  const w = label.widthMm;
  const h = label.heightMm;
  const availableWidth = Math.max(0, 210 - label.marginLeftMm - label.marginRightMm);
  const availableHeight = Math.max(0, 297 - label.marginTopMm - label.marginBottomMm);
  const cols = Math.max(1, Math.floor(availableWidth / w));
  const rows = Math.max(1, Math.floor(availableHeight / h));
  const labelsPerPage = cols * rows;

  // Chunk devices into pages
  const pages = [];
  for (let i = 0; i < devices.length; i += labelsPerPage) {
    pages.push(devices.slice(i, i + labelsPerPage));
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-zinc-950 print:bg-white flex flex-col items-center gap-4 py-4 print:py-0 print:gap-0">
      {/* Print view controls (hidden when printing) */}
      <div className="flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-sm print:hidden sm:gap-4 sm:p-4">
        <button onClick={() => navigate('/devices')} className="btn-secondary flex min-h-11 flex-1 items-center justify-center gap-2 text-gray-700 dark:text-zinc-300 sm:flex-none">
          <ArrowLeft size={16} /> Zurück
        </button>
        <span className="order-last w-full text-center text-xs font-semibold text-gray-800 dark:text-zinc-200 sm:order-none sm:w-auto sm:flex-1 sm:text-sm">
          {devices.length} Label(s) auf {pages.length} Seite(n) ({cols} × {rows} pro Bogen)
        </span>
        <button onClick={() => window.print()} className="btn-primary flex min-h-11 flex-1 items-center justify-center gap-2 sm:flex-none">
          <Printer size={16} /> Drucken
        </button>
      </div>

      {/* Pages sheets – auf dem Bildschirm skaliert, im Druck original 210 mm */}
      {pages.map((pageDevices, pageIndex) => (
        <div
          key={pageIndex}
          className="print-page w-full overflow-hidden"
          style={{ height: `${A4_HEIGHT_PX * previewScale}px` }}
        >
          <div
            className="label-sheet bg-white shadow-xl print:shadow-none print:m-0"
            style={{
              boxSizing: 'border-box',
              paddingTop: `${label.marginTopMm}mm`,
              paddingBottom: `${label.marginBottomMm}mm`,
              paddingLeft: `${label.marginLeftMm}mm`,
              paddingRight: `${label.marginRightMm}mm`,
              breakAfter: 'page',
              pageBreakAfter: 'always',
              transform: `scale(${previewScale})`,
              transformOrigin: 'top center'
            }}
          >
            {pageDevices.map((device) => {
              const qrValue = device.qrCode || `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/devices?id=${device.inventoryId}`;
              return (
                <AssetLabel
                  key={device.id}
                  align="start"
                  device={device}
                  settings={settings}
                  qrValue={qrValue}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
