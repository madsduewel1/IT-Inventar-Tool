import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Barcode, Camera, CameraOff, Flashlight, FlashlightOff, ImageUp, LoaderCircle, QrCode, RotateCw } from 'lucide-react';
import Modal from './Modal';
import { api } from '../api/client';
import { decodeCodeFromImageFile, decodeCodeFromSource, extractDeviceId, isCameraAvailable, scanCandidates } from '../utils/scan';

// Timing-Werte für den Hardware-Barcode-Scanner (Keyboard-Wedge) und die
// Kamera-Auswertung. Ein Scanner tippt Tasten mit wenigen Millisekunden
// Abstand – deutlich schneller als eine Person tippen kann.
const FAST_KEYSTROKE_MS = 60;
const AUTO_SUBMIT_DELAY_MS = 400;
const MIN_CODE_LENGTH = 3;
const DETECT_INTERVAL_MS = 120;
// Nach einem Treffer wird derselbe Code kurz ignoriert – sonst löst ein im
// Bild stehendes Label im Sekundentakt weitere API-Abfragen aus.
const RESCAN_COOLDOWN_MS = 5000;

export default function LabelScanModal({ open, onClose, onFound }) {
  const [mode, setMode] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [cameras, setCameras] = useState([]);
  const [cameraDeviceId, setCameraDeviceId] = useState('');
  const [stream, setStream] = useState(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torch, setTorch] = useState(false);

  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const detectingRef = useRef(false);
  const lookingUpRef = useRef(false);
  const codeRef = useRef('');
  const keyTimesRef = useRef([]);
  const autoSubmitRef = useRef(null);
  const lookupRef = useRef(null);
  const startCameraRef = useRef(null);
  const cameraDeviceIdRef = useRef('');
  const lastAttemptRef = useRef({ value: '', at: 0 });

  const setCodeSafe = useCallback((value) => {
    codeRef.current = value;
    setCode(value);
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const active = streamRef.current;
    streamRef.current = null;
    active?.getTracks?.().forEach((track) => track.stop());
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    lastAttemptRef.current = { value: '', at: 0 };
    setHasTorch(false);
    setTorch(false);
  }, []);

  // Schlüsselt den Scan-Wert über die API auf ein echtes Gerät auf.
  // Erkannte QR-URLs, aufgefüllte Barcode-IDs und Inventarnummern werden
  // nacheinander geprüft, damit alle Label-Formate funktionieren.
  const lookup = useCallback(async (raw) => {
    const value = String(raw || '').trim();
    if (!value || lookingUpRef.current) return;
    lookingUpRef.current = true;
    setBusy(true);
    setError('');
    try {
      for (const candidate of scanCandidates(value)) {
        try {
          const { data } = await api.get(`/devices/${encodeURIComponent(candidate)}`);
          if (data?.device?.id) {
            stopCamera();
            onFound(data.device.id);
            return;
          }
        } catch (requestError) {
          if (requestError.response?.status === 401) throw requestError;
        }
      }
      const label = extractDeviceId(value) || value;
      setError(`Zu „${label}“ wurde kein Gerät gefunden. Bitte prüfen, ob das Etikett zu diesem Inventar-Tool gehört.`);
    } catch {
      setError('Gerät konnte nicht geladen werden. Bitte erneut versuchen.');
    } finally {
      lookingUpRef.current = false;
      setBusy(false);
    }
  }, [onFound, stopCamera]);

  useEffect(() => { lookupRef.current = lookup; }, [lookup]);

  const detectFromVideo = useCallback(async (video) => decodeCodeFromSource(video), []);

  const startDetectLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const tick = async (timestamp) => {
      rafRef.current = requestAnimationFrame(tick);
      if (timestamp - lastFrameRef.current < DETECT_INTERVAL_MS) return;
      lastFrameRef.current = timestamp;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      if (detectingRef.current || lookingUpRef.current) return;
      detectingRef.current = true;
      try {
        const text = await detectFromVideo(video);
        if (!text) return;
        const now = Date.now();
        const last = lastAttemptRef.current;
        if (text === last.value && now - last.at < RESCAN_COOLDOWN_MS) return;
        lastAttemptRef.current = { value: text, at: now };
        navigator.vibrate?.(60);
        lookupRef.current?.(text);
      } catch {
      } finally {
        detectingRef.current = false;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [detectFromVideo]);

  const startCamera = useCallback(async (deviceId) => {
    stopCamera();
    setCameraError('');
    if (!isCameraAvailable()) {
      setCameraStatus('error');
      setCameraError(window.isSecureContext
        ? 'Dieser Browser unterstützt keinen Kamerazugriff.'
        : 'Der Kamerazugriff ist nur über HTTPS oder auf localhost erlaubt. Lade stattdessen ein Foto des Etiketts hoch.');
      return;
    }

    setCameraStatus('requesting');
    // Ohne ausdrückliche Auswahl wird die zuletzt gewählte Kamera bevorzugt,
    // damit ein erneutes Öffnen nicht auf die Frontkamera zurückspringt.
    const target = deviceId || cameraDeviceIdRef.current || '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: target
          ? { deviceId: { exact: target }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      setStream(stream);
      const [track] = stream.getVideoTracks();
      if (track) {
        const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
        setHasTorch(Boolean(capabilities.torch));
        const activeDeviceId = track.getSettings?.().deviceId || target;
        if (activeDeviceId && activeDeviceId !== cameraDeviceIdRef.current) {
          cameraDeviceIdRef.current = activeDeviceId;
          setCameraDeviceId(activeDeviceId);
        }
      }
      setCameraStatus('active');
      startDetectLoop();

      try {
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((entry) => entry.kind === 'videoinput');
        setCameras(devices);
      } catch {
      }
    } catch (cameraFailure) {
      setCameraStatus('error');
      setCameraError(cameraErrorText(cameraFailure));
      if (target && cameraFailure?.name === 'OverconstrainedError') {
        cameraDeviceIdRef.current = '';
        setCameraDeviceId('');
      }
    }
  }, [startDetectLoop, stopCamera]);

  useEffect(() => { startCameraRef.current = startCamera; }, [startCamera]);

  // Kamerastream an das <video>-Element hängen (React mountet es erst nach dem
  // Statuswechsel auf "active").
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [stream, mode]);

  // Kamera-Start/-Stopp an den Modus koppeln und beim Schließen freigeben.
  useEffect(() => {
    if (open && mode === 'qr') {
      startCameraRef.current?.();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, mode, stopCamera]);

  useEffect(() => {
    if (open && mode === 'barcode') inputRef.current?.focus();
  }, [open, mode]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(autoSubmitRef.current);
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  function close() {
    setMode('');
    setCodeSafe('');
    setError('');
    setBusy(false);
    setCameraStatus('idle');
    setCameraError('');
    keyTimesRef.current = [];
    clearTimeout(autoSubmitRef.current);
    onClose();
  }

  function chooseMode(next) {
    setMode(next);
    setError('');
    setCodeSafe('');
    keyTimesRef.current = [];
  }

  // Foto statt Kamera: funktioniert auch ohne Kameraberechtigung und ohne
  // HTTPS, weil das Bild lokal im Browser ausgewertet wird.
  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await decodeFile(file);
  }

  async function decodeFile(file) {
    setError('');
    setBusy(true);
    try {
      const text = await decodeCodeFromImageFile(file);
      if (!text) {
        setError('Im Bild wurde kein lesbarer Code gefunden. Bitte das Etikett schärfer und größer fotografieren – oder den Code unten von Hand eintragen.');
        return;
      }
      navigator.vibrate?.(60);
      await lookup(text);
    } catch {
      setError('Das Bild konnte nicht ausgewertet werden. Bitte eine JPG- oder PNG-Datei verwenden.');
    } finally {
      setBusy(false);
    }
  }

  // Erkennt am Tastatur-Tempo, ob ein Hardware-Scanner tippt, und reicht den
  // Code nach kurzer Ruhe automatisch ein – auch ohne Enter-Taste am Scanner.
  function registerKeystroke(value) {
    const now = Date.now();
    const times = keyTimesRef.current;
    const previous = times[times.length - 1];
    times.push(now);
    if (times.length > 32) times.shift();
    clearTimeout(autoSubmitRef.current);
    const gaps = times.slice(1).map((time, index) => time - times[index]);
    const isScanner = previous !== undefined && gaps.length > 0 && gaps.every((gap) => gap < FAST_KEYSTROKE_MS);
    if (isScanner && String(value || '').trim().length >= MIN_CODE_LENGTH) {
      autoSubmitRef.current = setTimeout(() => lookupRef.current?.(value), AUTO_SUBMIT_DELAY_MS);
    }
  }

  // Fängt Tastatureingaben ab, auch wenn das Eingabefeld gerade nicht fokussiert ist.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target === inputRef.current) return;
      if (event.key === 'Enter') {
        if (codeRef.current.trim()) {
          event.preventDefault();
          clearTimeout(autoSubmitRef.current);
          lookupRef.current?.(codeRef.current);
        }
        return;
      }
      if (event.key.length !== 1) return;
      event.preventDefault();
      const next = `${codeRef.current}${event.key}`;
      setCodeSafe(next);
      registerKeystroke(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, mode, setCodeSafe]);

  // Bilder per Zwischenablage einfügen (Strg+V / Cmd+V). Praktisch, wenn ein
  // Label-Screenshot oder ein Foto aus der Galerie direkt ausgewertet werden soll.
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (event) => {
      const file = Array.from(event.clipboardData?.items || [])
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile?.();
      if (!file) return;
      event.preventDefault();
      decodeFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorch(next);
    } catch {
      setCameraError('Das Blitzlicht lässt sich nicht steuern.');
    }
  }

  function submitCode() {
    clearTimeout(autoSubmitRef.current);
    lookupRef.current?.(codeRef.current);
  }

  return (
    <Modal
      open={open}
      title="Label scannen"
      subtitle="Barcode per angeschlossenem Scanner, QR-Code per Kamera oder per Foto des Etiketts erfassen."
      onClose={close}
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-badge-red px-3 py-2 text-sm font-medium text-text-badge-red">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!mode && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            icon={<Barcode size={22} />}
            title="Barcode"
            text="Am Gerät angeschlossener Scanner. Einmal scannen – das Gerät öffnet sich automatisch."
            onClick={() => chooseMode('barcode')}
          />
          <ModeCard
            icon={<QrCode size={22} />}
            title="QR-Code"
            text={isCameraAvailable()
              ? 'Kamera des Endgeräts (Handy, Tablet, Laptop). Der Browser fragt die Erlaubnis ab.'
              : 'Kamera nur über HTTPS oder localhost. Ohne HTTPS funktioniert der Weg über das Foto.'}
            onClick={() => chooseMode('qr')}
          />
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-4 text-center transition hover:border-primary hover:bg-surface-container-high">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container-high text-primary">
                {busy ? <LoaderCircle size={22} className="animate-spin" /> : <ImageUp size={22} />}
              </span>
              <span className="text-base font-semibold text-on-surface">Foto vom Etikett</span>
              <span className="text-xs leading-relaxed text-on-surface-variant">
                Bild vom QR-Code auswählen – funktioniert immer, auch ohne Kamera und ohne HTTPS.
              </span>
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={handleFile} />
            </label>
          </div>
        </div>
      )}

      {mode === 'barcode' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface">
              <Barcode size={20} />
            </div>
            <div className="text-xs leading-relaxed text-on-surface-variant">
              Der Scanner muss als Tastatur (Keyboard-Wedge) eingerichtet sein und
              Sendung per <strong className="text-on-surface">Enter</strong> beenden.
              Auch eine manuelle Eingabe ist möglich.
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant" htmlFor="label-scan-code">
              Barcode / Geräte-ID / Inventarnummer
            </label>
            <input
              id="label-scan-code"
              ref={inputRef}
              className="field font-mono"
              placeholder="Scanner bereit – einfach scannen"
              value={code}
              autoComplete="off"
              autoFocus
              onChange={(event) => {
                setCodeSafe(event.target.value);
                registerKeystroke(event.target.value);
              }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitCode(); } }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn-secondary" onClick={() => chooseMode('')}>
              Zurück zur Auswahl
            </button>
            <div className="flex gap-2">
              {code && <button type="button" className="btn-secondary" onClick={() => setCodeSafe('')}>Feld leeren</button>}
              <button type="button" className="btn-primary" onClick={submitCode} disabled={busy || !code.trim()}>
                {busy ? <><LoaderCircle size={17} className="animate-spin" />Suche läuft…</> : 'Gerät öffnen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'qr' && (
        <div className="space-y-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
            {cameraStatus !== 'active' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white/90">
                {cameraStatus === 'requesting' && (
                  <>
                    <LoaderCircle size={26} className="animate-spin" />
                    <span className="text-sm">Kamerazugriff wird angefragt … bitte im Browser bestätigen.</span>
                  </>
                )}
                {cameraStatus === 'error' && (
                  <>
                    <CameraOff size={26} />
                    <span className="text-sm">{cameraError}</span>
                    <button type="button" className="btn-secondary mt-1" onClick={() => startCameraRef.current?.()}>
                      <RotateCw size={16} />Erneut versuchen
                    </button>
                  </>
                )}
                {cameraStatus === 'idle' && (
                  <>
                    <Camera size={26} />
                    <span className="text-sm">Kamera wird vorbereitet …</span>
                  </>
                )}
              </div>
            )}
            {cameraStatus === 'active' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[54%] w-[54%]">
                  <span className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-white/90" />
                  <span className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-white/90" />
                  <span className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-white/90" />
                  <span className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-white/90" />
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-on-surface-variant">
            QR-Code des Labels in den Rahmen halten. Das Gerät öffnet sich automatisch.
          </div>

          {cameraStatus === 'error' && cameraError && (
            <div className="rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant">{cameraError}</div>
          )}

          <ManualEntry
            id="label-scan-qr-code"
            inputRef={inputRef}
            code={code}
            busy={busy}
            onChange={(value) => {
              setCodeSafe(value);
              registerKeystroke(value);
            }}
            onSubmit={submitCode}
            onClear={() => setCodeSafe('')}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn-secondary" onClick={() => chooseMode('')}>
              Zurück zur Auswahl
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-secondary cursor-pointer">
                <ImageUp size={16} />Foto statt Kamera
                <input type="file" accept="image/*" className="sr-only" onChange={handleFile} disabled={busy} />
              </label>
              {cameras.length > 1 && (
                <select
                  className="field max-w-[190px]"
                  value={cameraDeviceId}
                  onChange={(event) => {
                    setCameraDeviceId(event.target.value);
                    startCameraRef.current?.(event.target.value);
                  }}
                >
                  {cameras.map((entry, index) => (
                    <option key={entry.deviceId || index} value={entry.deviceId}>
                      {entry.label || `Kamera ${index + 1}`}
                    </option>
                  ))}
                </select>
              )}
              {hasTorch && (
                <button type="button" className="btn-secondary" onClick={toggleTorch}>
                  {torch ? <FlashlightOff size={16} /> : <Flashlight size={16} />}
                  {torch ? 'Licht aus' : 'Licht an'}
                </button>
              )}
              <button type="button" className="btn-primary" disabled={busy} onClick={() => startCameraRef.current?.()}>
                <RotateCw size={16} />Neu starten
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Eingabefeld für Code, Inventarnummer oder QR-URL. Es ist in beiden Modi
// sichtbar: Wenn keine Kamera zur Verfügung steht (internes LAN über HTTP),
// bleibt so immer ein Weg, ein Gerät zu öffnen – per Hand, per Hardware-
// Scanner oder per Einfügen aus der Zwischenablage.
function ManualEntry({ id, inputRef, code, busy, onChange, onSubmit, onClear }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
      <label className="mb-1 block text-xs font-medium text-on-surface-variant" htmlFor={id}>
        Code manuell eingeben oder einfügen
      </label>
      <input
        id={id}
        ref={inputRef}
        className="field font-mono"
        placeholder="Geräte-ID, Inventarnummer oder QR-URL"
        value={code}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onSubmit(); } }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary min-h-11 sm:min-h-9" onClick={onSubmit} disabled={busy || !code.trim()}>
          {busy ? <><LoaderCircle size={16} className="animate-spin" />Suche läuft…</> : 'Gerät öffnen'}
        </button>
        {code && <button type="button" className="btn-secondary min-h-11 sm:min-h-9" onClick={onClear}>Feld leeren</button>}
        <span className="text-xs text-outline">Tipp: Bild mit Strg+V einfügen.</span>
      </div>
    </div>
  );
}

function ModeCard({ icon, title, text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-left transition hover:border-primary hover:bg-surface-container-high"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container-high text-primary">{icon}</span>
      <span className="text-base font-semibold text-on-surface">{title}</span>
      <span className="text-xs leading-relaxed text-on-surface-variant">{text}</span>
    </button>
  );
}

function cameraErrorText(failure) {
  switch (failure?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Kamerazugriff wurde verweigert. Bitte die Kamera in den Browser-Einstellungen erlauben und es erneut versuchen.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'An diesem Endgerät wurde keine Kamera gefunden.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Die Kamera wird bereits von einer anderen Anwendung verwendet.';
    case 'OverconstrainedError':
      return 'Es konnte keine passende Kamera gestartet werden.';
    default:
      return 'Die Kamera konnte nicht gestartet werden.';
  }
}
