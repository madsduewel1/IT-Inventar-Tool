import { useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import JsBarcode from 'jsbarcode';

export const labelDefaults = {
  widthMm: 64,
  heightMm: 34,
  marginTopMm: 0,
  marginBottomMm: 0,
  marginLeftMm: 0,
  marginRightMm: 0
};

export function normalizeLabelSettings(settings = {}) {
  return {
    widthMm: clampNumber(settings['label.widthMm'], 20, 210, labelDefaults.widthMm),
    heightMm: clampNumber(settings['label.heightMm'], 15, 297, labelDefaults.heightMm),
    marginTopMm: clampNumber(settings['label.marginTopMm'], 0, 100, labelDefaults.marginTopMm),
    marginBottomMm: clampNumber(settings['label.marginBottomMm'], 0, 100, labelDefaults.marginBottomMm),
    marginLeftMm: clampNumber(settings['label.marginLeftMm'], 0, 100, labelDefaults.marginLeftMm),
    marginRightMm: clampNumber(settings['label.marginRightMm'], 0, 100, labelDefaults.marginRightMm)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

// Maximale Balkendicke (X-Dimension) für Code 128. Die Balken laufen bis zu
// dieser Obergrenze oder bis sie die volle Breite der linken Spalte füllen –
// je nachdem, was der begrenzende Faktor ist. So bleibt der Strichcode maximal
// groß und trotz ohne Verzerrung.
const MAX_MODULE_MM = 0.38;
const PX_PER_MM = 3.78;
const BARCODE_FONT = 'monospace';

const moduleCountCache = new Map();
const textWidthCache = new Map();
let measureContext = null;

// Ermittelt die Anzahl der Balkenmodule eines Textes. Wichtig: die Messung darf
// nicht über getBoundingClientRect() laufen – ein noch nicht eingehängtes SVG
// liefert dort immer 0, wodurch der Strichcode anschließend auf volle Breite
// gestreckt würde. Gelesen wird daher das width-Attribut, das JsBarcode setzt.
function barcodeModuleCount(text) {
  if (moduleCountCache.has(text)) return moduleCountCache.get(text);
  let count = 0;
  try {
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(probe, text, { format: 'CODE128', width: 1, height: 1, displayValue: false, fontSize: 0, textMargin: 0, margin: 0 });
    count = parseFloat(probe.getAttribute('width')) || 0;
  } catch {
    count = 0;
  }
  moduleCountCache.set(text, count);
  return count;
}

// Breite des unter den Balken gedruckten Textes (die AssetID). JsBarcode
// rechnet die SVG-Breite als Maximum aus Balken und Text, deshalb muss die
// Textbreite bekannt sein, damit die Box nicht zu klein ausfällt und der
// Strichcode aus der Symmetrie kippt.
function barcodeTextWidthPx(text, fontSizePx) {
  const key = `${fontSizePx}|${text}`;
  if (textWidthCache.has(key)) return textWidthCache.get(key);
  let width = 0;
  try {
    if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
    measureContext.font = `bold ${fontSizePx}px ${BARCODE_FONT}`;
    width = measureContext.measureText(text).width || 0;
  } catch {
    width = 0;
  }
  textWidthCache.set(key, width);
  return width;
}

function clampMm(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ── Aufteilung des Etiketts ─────────────────────────────────────────────────
// Rechteckiges Etikett im Querformat, in zwei Spalten aufgeteilt:
//   links  – oben das Schullogo, darunter der Strichcode über fast die gesamte
//            Breite der linken Spalte, mit der AssetID klein und mittig darunter
//   rechts – oben der große, quadratische QR-Code
// Alle Maße sind Anteile der Etikettengröße, die in den Einstellungen gewählt
// wird – ändert man die Labelgröße, skaliert der komplette Aufbau proportional
// mit. Identische Formeln wie im Backend (backend/src/services/qr.js), damit
// Druckbogen, Vorschau und exportiertes SVG gleich aussehen.
export function labelLayoutMm(widthMm, heightMm, moduleCount, textWidthMm) {
  const padX = clampMm(widthMm * 0.035, 1.2, 3);
  const padY = clampMm(heightMm * 0.06, 1.2, 3);
  const contentW = Math.max(4, widthMm - padX * 2);
  const contentH = Math.max(3, heightMm - padY * 2);
  // Linke Spalte (Logo + Strichcode) und rechte Spalte (QR-Code) mit festem
  // Steg dazwischen; die Anteile addieren sich auf die Inhaltsbreite. Der
  // Strichcode bekommt den größeren Anteil, damit er über die Etikettenbreite
  // gut scanbar bleibt.
  const gapXmm = clampMm(widthMm * 0.025, 0.8, 2.2);
  const columnWmm = Math.max(4, contentW - gapXmm);
  const leftWmm = columnWmm * 0.62;
  const rightWmm = columnWmm - leftWmm;
  // QR-Code rechts: quadratisch, mittig in der Spalte – waagerecht über den
  // Spaltenrest, senkrecht über die Inhaltshöhe.
  const qrSizeMm = Math.max(3, Math.min(contentH * 0.88, rightWmm * 0.95));
  const qrTopMm = padY + (contentH - qrSizeMm) / 2;
  const qrBottomMm = qrTopMm + qrSizeMm;
  // Logo oben links, innerhalb der vertikalen Höhenlinien des QR-Codes.
  const logoTopMm = qrTopMm;
  const logoMaxHmm = Math.max(3, qrBottomMm - logoTopMm);
  const logoHmm = clampMm(leftWmm * 0.3, 3, logoMaxHmm * 0.8);
  const gapYmm = clampMm(heightMm * 0.025, 0.4, 1.2);
  // Strichcode über fast die gesamte Breite der linken Spalte: pro Modell so
  // dick, bis die Spalte voll ist (gedeckelt durch MAX_MODULE_MM).
  const barcodeMaxMm = leftWmm;
  const moduleMm = moduleCount > 0 ? Math.min(MAX_MODULE_MM, barcodeMaxMm / moduleCount) : 0;
  const barsMm = moduleCount > 0 ? moduleCount * moduleMm : 0;
  // AssetID-Zeile unter den Balken – exakt dieselbe Größe wie der von JsBarcode
  // tatsächlich gedruckte Text (siehe fontPx in AssetLabel), damit Aufteilung
  // und gerendertes Ergebnis zusammenpassen.
  const textMm = clampMm(heightMm * 0.1, 1.3, 4.5);
  const barcodeWidthMm = Math.max(barsMm, textWidthMm);
  const barcodeBoxMm = barcodeWidthMm + 0.4;
  // Balken und AssetID teilen sich den Platz unter dem Logo – und zwar bis
  // knapp an den unteren Inhaltsrand des Etiketts, damit der Strichcode
  // möglichst groß wird.
  const stackBottomMm = padY + contentH - 1.5;
  const stackHmm = Math.max(0.7, stackBottomMm - logoTopMm - logoHmm - gapYmm);
  const barHeightMm = Math.max(0.8, stackHmm - textMm - 0.15);
  return {
    padX,
    padY,
    contentW,
    contentH,
    gapXmm,
    gapYmm,
    leftWmm,
    rightWmm,
    qrSizeMm,
    qrLeftMm: padX + leftWmm + gapXmm + (rightWmm - qrSizeMm) / 2,
    qrTopMm,
    logoLeftMm: padX,
    logoTopMm,
    logoWMm: leftWmm,
    logoHmm,
    moduleMm,
    barHeightMm,
    textMm,
    barcodeBoxMm,
    barcodeLeftMm: padX + (leftWmm - barcodeBoxMm) / 2,
    barcodeTopMm: logoTopMm + logoHmm + gapYmm + (stackHmm - (barHeightMm + textMm)) / 2
  };
}

// Logo für das Etikett: es wird ausschließlich aus den Systemeinstellungen
// gelesen. Vorrang hat das Label-Logo (label.logo), danach das Zentrallogo der
// Organisation (org.logo). Ist dort kein Logo hinterlegt, bleibt der Platz frei.
export function resolveLabelLogo(settings = {}) {
  const labelLogo = String(settings['label.logo'] || '').trim();
  if (labelLogo) return labelLogo;
  const orgLogo = String(settings['org.logo'] || '').trim();
  return orgLogo;
}

// AssetID des Geräts: reine numerische IDs werden auf 10 Stellen aufgefüllt
// (0000000234 statt 234), damit der Strichcode unter allen Geräten dieselbe
// Länge und Breite hat. Bewusst NICHT der Gerätename – auf dem Etikett steht
// ausschließlich die AssetID.
function assetId(device) {
  const raw = String(device?.id || '').trim();
  if (/^\d+$/.test(raw)) return raw.padStart(10, '0');
  return raw;
}

export function AssetLabel({ device, settings = {}, qrValue, preview = false, align = 'center' }) {
  const label = normalizeLabelSettings(settings);
  const barcodeText = assetId(device);
  const value = qrValue || `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/devices?id=${encodeURIComponent(device.id)}`;
  const previewScale = preview ? Math.min(1, 300 / (label.widthMm * 3.78), 180 / (label.heightMm * 3.78)) : 1;
  // alignmentClass: 'mx-auto' zentriert das Label in der Einzelansicht (z.B. Gerätedetails).
  // Bei align === 'start' (wird beim Druckbogen verwendet) entfernen wir jegliche Margins (vorher 'mr-auto'),
  // damit die Etiketten auf dem A4-Druckbogen direkt aneinandergrenzen und sich berühren.
  const alignmentClass = align === 'start' ? '' : 'mx-auto';
  const barcodeRef = useRef(null);

  const logoUrl = resolveLabelLogo(settings);

  // Aufteilung der Etikettenfläche – vollständig aus der Labelgröße abgeleitet,
  // damit Logo, Strichcode und QR-Code bei jeder eingestellten Größe gleich
  // aussehen und an ihren Plätzen bleiben.
  const moduleCount = barcodeModuleCount(barcodeText);
  const textMm = clampMm(label.heightMm * 0.1, 1.3, 4.5);
  const fontPx = Math.max(4, Math.round(textMm * PX_PER_MM));
  const textWidthMm = barcodeTextWidthPx(barcodeText, fontPx) / PX_PER_MM;
  const layout = labelLayoutMm(label.widthMm, label.heightMm, moduleCount, textWidthMm);

  useEffect(() => {
    const el = barcodeRef.current;
    if (!el || !barcodeText) return;
    try {
      // Der Strichcode wird direkt in der berechneten Balkendicke gerendert (kein
      // nachträgliches Skalieren), damit die Balkenproportionen erhalten bleiben.
      // Balken plus AssetID darunter ergeben zusammen die Höhe der Box.
      JsBarcode(el, barcodeText, {
        format: 'CODE128',
        width: layout.moduleMm * PX_PER_MM,
        height: layout.barHeightMm * PX_PER_MM,
        displayValue: true,
        font: BARCODE_FONT,
        fontOptions: 'bold',
        fontSize: fontPx,
        textAlign: 'center',
        textMargin: 0,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000'
      });
    } catch {
      // Barcode-Text nicht encodierbar: leere Fläche statt Absturz.
      el.innerHTML = '';
    }
  }, [barcodeText, fontPx, layout.moduleMm, layout.barHeightMm]);

  return (
    <div
      className={`${alignmentClass} asset-label relative shrink-0 overflow-hidden bg-white text-black print:shadow-none`}
      style={{
        width: `${label.widthMm}mm`,
        height: `${label.heightMm}mm`,
        transform: preview ? `scale(${previewScale})` : undefined,
        // Die Vorschau skaliert nach unten; die Labelmitte soll dabei stehen
        // bleiben, damit das Label zentriert in der Vorschau erscheint.
        transformOrigin: 'center top'
      }}
    >
      {/* Schullogo oben links – kommt aus den Systemeinstellungen. */}
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          className="absolute"
          style={{
            left: `${layout.logoLeftMm}mm`,
            top: `${layout.logoTopMm}mm`,
            width: `${layout.logoWMm}mm`,
            height: `${layout.logoHmm}mm`,
            objectFit: 'contain',
            // wie preserveAspectRatio="xMinYMid" im exportierten SVG: Logo links
            // angedockt, Seitenverhältnis bleibt erhalten
            objectPosition: 'left center'
          }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}

      {/* Strichcode über fast die gesamte Breite der linken Spalte, AssetID klein
          und mittig darunter. */}
      <svg
        ref={barcodeRef}
        className="absolute block"
        style={{ left: `${layout.barcodeLeftMm}mm`, top: `${layout.barcodeTopMm}mm` }}
      />

      {/* QR-Code oben rechts. */}
      <div
        className="absolute"
        style={{
          left: `${layout.qrLeftMm}mm`,
          top: `${layout.qrTopMm}mm`,
          width: `${layout.qrSizeMm}mm`,
          height: `${layout.qrSizeMm}mm`
        }}
      >
        <QRCode value={value} size={256} bgColor="#ffffff" fgColor="#000000" style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  );
}
