import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Keyboard, Play, Search, Square } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

export default function Scanner() {
  const navigate = useNavigate();
  const scannerRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [lastScan, setLastScan] = useState('');
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  useEffect(() => {
    refreshCameras(false);
    return () => {
      stopScanner();
    };
  }, []);

  function resolveScan(decodedText) {
    const scan = decodedText.trim();
    setLastScan(scan);
    try {
      const looksLikeUrl = /^https?:\/\//i.test(scan) || scan.startsWith('/');
      if (looksLikeUrl) {
        const url = new URL(scan, window.location.origin);
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        const path = url.pathname.replace(base, '') || '/devices';
        if (path.startsWith('/devices')) {
          navigate(path);
          return;
        }
      }
    } catch {
      // Fall through to inventory search.
    }
    navigate(`/devices?search=${encodeURIComponent(scan)}`);
  }

  async function startScanner() {
    setError('');
    try {
      if (!isCameraContextAllowed()) {
        setError('Kamerazugriff ist nur über HTTPS oder localhost möglich. Öffne die App über eine sichere Adresse.');
        return;
      }

      let availableCameras = cameras;
      if (!availableCameras.length) availableCameras = await refreshCameras(true);
      if (!availableCameras.length) {
        setError('Keine Kamera gefunden. Prüfe, ob eine Kamera verbunden und im Browser erlaubt ist.');
        return;
      }

      const preferredCamera = chooseCamera(availableCameras, selectedCameraId);
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        preferredCamera.id,
        { fps: 10, qrbox: { width: 260, height: 260 } },
        async (decodedText) => {
          await stopScanner();
          resolveScan(decodedText);
        }
      );
      setSelectedCameraId(preferredCamera.id);
      setRunning(true);
    } catch (scannerError) {
      setError(cameraErrorMessage(scannerError));
      setRunning(false);
    }
  }

  async function refreshCameras(requestPermission = true) {
    try {
      if (requestPermission && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      const devices = await Html5Qrcode.getCameras();
      setCameras(devices);
      if (devices.length && !selectedCameraId) setSelectedCameraId(chooseCamera(devices).id);
      return devices;
    } catch (cameraError) {
      if (requestPermission) setError(cameraErrorMessage(cameraError));
      return [];
    }
  }

  async function stopScanner() {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.stop();
      await scannerRef.current.clear();
    } catch {
      // Scanner may already be stopped.
    } finally {
      scannerRef.current = null;
      setRunning(false);
    }
  }

  function submitManual(event) {
    event.preventDefault();
    if (!manual.trim()) return;
    resolveScan(manual.trim());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">QR-Scanner</h1>
          <p className="mt-1 text-sm text-gray-500">Kamera starten oder Inventarnummer/QR-Link manuell eingeben</p>
        </div>
        <div className="flex gap-2">
          {!running ? (
            <button className="btn-primary" onClick={startScanner}><Play size={17} />Scanner starten</button>
          ) : (
            <button className="btn-secondary" onClick={stopScanner}><Square size={17} />Scanner stoppen</button>
          )}
        </div>
      </div>

      {error && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="card overflow-hidden">
          <div className="border-b border-black/5 p-5">
            <div className="flex items-center gap-2 font-semibold text-gray-800"><Camera size={18} />Kamera</div>
            <div className="mt-1 text-sm text-gray-500">Nach erfolgreichem Scan wird automatisch zur Assetseite gewechselt.</div>
          </div>
          <div className="space-y-4 p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="text-sm font-medium text-gray-700">Kamera auswählen
                <select className="field mt-1" value={selectedCameraId} onChange={(event) => setSelectedCameraId(event.target.value)} disabled={running}>
                  {cameras.length ? cameras.map((camera, index) => (
                    <option key={camera.id} value={camera.id}>{camera.label || `Kamera ${index + 1}`}</option>
                  )) : <option value="">Noch keine Kamera erkannt</option>}
                </select>
              </label>
              <button type="button" className="btn-secondary self-end" onClick={() => refreshCameras(true)} disabled={running}>
                <Search size={16} />Kameras suchen
              </button>
            </div>
            <div id="qr-reader" className="min-h-[320px] overflow-hidden rounded-2xl bg-[#fafafa]" />
          </div>
        </section>

        <aside className="space-y-6">
          <section className="card p-5">
            <div className="mb-4 flex items-center gap-2 font-semibold text-gray-800"><Keyboard size={18} />Manuelle Eingabe</div>
            <form onSubmit={submitManual} className="space-y-3">
              <input className="field" placeholder="INV-042 oder kompletter QR-Link" value={manual} onChange={(event) => setManual(event.target.value)} />
              <button className="btn-primary w-full">Öffnen oder suchen</button>
            </form>
          </section>

          <section className="card p-5">
            <div className="font-semibold text-gray-800">Letzter Scan</div>
            <div className="mt-3 min-h-12 rounded-2xl bg-[#fafafa] p-3 font-mono text-sm text-gray-700">
              {lastScan || 'Noch kein Scan.'}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function chooseCamera(cameras, selectedCameraId = '') {
  return cameras.find((camera) => camera.id === selectedCameraId)
    || cameras.find((camera) => /back|rear|environment|umgebung|rück/i.test(camera.label || ''))
    || cameras[0];
}

function isCameraContextAllowed() {
  return window.isSecureContext || ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function cameraErrorMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError') return 'Kamerazugriff wurde blockiert. Erlaube die Kamera in den Browser-Rechten und starte den Scanner erneut.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Keine Kamera gefunden. Prüfe, ob eine Kamera verbunden ist.';
  if (name === 'NotReadableError') return 'Die Kamera wird bereits von einer anderen App verwendet oder ist nicht verfügbar.';
  return 'Kamera konnte nicht gestartet werden. Prüfe Browser-Rechte oder nutze die manuelle Eingabe.';
}
