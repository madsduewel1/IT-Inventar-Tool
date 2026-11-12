// Hilfsfunktionen zum Auswerten von Scan-Ergebnissen (Barcode & QR-Code).
// Gescannt werden können:
//   - die QR-URL aus dem Label:  https://host/inventar-tool/devices?id=42
//   - die ältere Label-URL:      https://host/fehler/show/device?id=42
//   - die Geräte-ID als Barcode: 0000000042
//   - die Inventarnummer:        INV-042

// jsQR wird erst bei Bedarf nachgeladen, damit der Decoder nicht im
// Start-Bundle der App landet.
let jsQrDecoder = null;
export async function loadJsQr() {
  if (!jsQrDecoder) jsQrDecoder = (await import('jsqr')).default;
  return jsQrDecoder;
}

// Kamerazugriff erlaubt der Browser nur in einem sicheren Kontext (HTTPS,
// localhost oder eine als "potenziell vertrauenswürdig" eingestufte Herkunft).
// Die interne Installation läuft häufig über einfaches HTTP auf dem LAN –
// dort gibt es keine Kamera, das Auslesen eines hochgeladenen Fotos bleibt aber
// möglich. Deshalb wird das an der Oberfläche auch ausdrücklich erklärt.
export function isCameraAvailable() {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

// Ermittelt die Geräte-ID aus einem beliebigen Scan-Ergebnis.
// URLs werden über den id-Parameter ausgewertet, alles andere gilt als ID/Inventarnummer.
export function extractDeviceId(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value) || value.startsWith('/')) {
    try {
      const parsed = new URL(value, window.location.origin);
      const fromQuery = parsed.searchParams.get('id')
        || parsed.searchParams.get('deviceId')
        || parsed.searchParams.get('device');
      if (fromQuery?.trim()) return fromQuery.trim();
      const segments = parsed.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && !['device', 'devices'].includes(last.toLowerCase())) {
        return decodeURIComponent(last);
      }
      return '';
    } catch {
      return value;
    }
  }

  return value;
}

// Mögliche Geräte-IDs für einen Scan-Wert, in Prüfreihenfolge.
// Numerische IDs werden als 10-stelliger Barcode gedruckt, das führende Nullen
// dürfen daher entfernt werden – und umgekehrt muss eine kurze ID auch als
// aufgefüllte Variante geprüft werden.
export function scanCandidates(raw) {
  const base = extractDeviceId(raw);
  const candidates = [];
  const push = (value) => {
    const trimmed = String(value ?? '').trim();
    if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
  };

  push(base);
  if (/^\d+$/.test(base)) {
    push(base.replace(/^0+(?=\d)/, ''));
    push(base.padStart(10, '0'));
  }
  return candidates;
}

// Kantenlänge, auf die ein Bild vor der Auswertung verkleinert wird. Der QR-Code
// muss danach noch mindestens ~40 Pixel Kantenlänge haben – alles darüber kostet
// nur Rechenzeit.
const DECODE_MAX_WIDTH = 900;
const DECODE_MIN_EDGE = 60;

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    image.src = src;
  });
}

/**
 * Liest einen Barcode/QR-Code aus einem bereits geladenen Bild oder Videoframe.
 * Der native BarcodeDetector des Browsers ist schneller und deckt auch
 * 1D-Barcodes ab – jsQR ist der universelle Fallback für alle anderen Browser.
 * Gibt einen leeren String zurück, wenn kein Code erkannt wurde.
 */
let _barcodeDetector = null;
let _detectorChecked = false;

function getBarcodeDetector() {
  if (_detectorChecked) return _barcodeDetector;
  _detectorChecked = true;
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    // Nicht jede Implementierung kennt alle Formate. Ein Format zu erbitten,
    // das nicht unterstützt wird, lässt den Konstruktor komplett scheitern –
    // deshalb vorher gegen die tatsächlich verfügbaren Formate filtern.
    const supported = typeof window.BarcodeDetector.getSupportedFormats === 'function'
      ? window.BarcodeDetector.getSupportedFormats()
      : null;
    const wanted = ['qr_code', 'code_128', 'code_39', 'ean_13'];
    const formats = supported ? wanted.filter((format) => supported.includes(format)) : wanted;
    _barcodeDetector = new window.BarcodeDetector(formats.length ? { formats } : undefined);
  } catch {
    _barcodeDetector = null;
  }
  return _barcodeDetector;
}

export async function decodeCodeFromSource(source) {
  const detector = getBarcodeDetector();
  if (detector) {
    try {
      const results = await detector.detect(source);
      if (results.length) return results[0].rawValue || '';
    } catch {
      // Manche Implementierungen kennen nur qr_code – dann bleibt es bei jsQR.
    }
  }

  const naturalWidth = source.naturalWidth || source.videoWidth || source.width;
  const naturalHeight = source.naturalHeight || source.videoHeight || source.height;
  if (!naturalWidth || !naturalHeight) return '';

  const scale = Math.min(1, DECODE_MAX_WIDTH / Math.max(naturalWidth, DECODE_MIN_EDGE));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';
  context.drawImage(source, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const jsQR = await loadJsQr();
  // Erst mit den Rohpixeln versuchen (jsQR binarisiert selbst). Erst wenn das
  // nichts findet, folgt ein zweiter Versuch mit angehobenem Kontrast – das
  // hilft bei matten Codes auf gedruckten Etiketten und bei Handyfotos.
  const direct = jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
  if (direct?.data) return direct.data;
  const contrast = boostContrast(imageData.data);
  return jsQR(contrast, width, height, { inversionAttempts: 'attemptBoth' })?.data || '';
}

// Minimale Kontrastanhebung (Graustufen + Spreizung), damit matte Codes auf
// gedruckten Etiketten zuverlässig erkannt werden.
function boostContrast(data) {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    const value = gray < 110 ? 0 : 255;
    out[i] = value;
    out[i + 1] = value;
    out[i + 2] = value;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Liest den Code aus einem hochgeladenen Foto aus. Das ist der Weg, wenn keine
 * Kamera zur Verfügung steht (kein HTTPS) oder die Kamera verweigert wurde.
 */
export async function decodeCodeFromImageFile(file) {
  if (!file) return '';
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    return await decodeCodeFromSource(image);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
