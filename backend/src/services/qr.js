const QRCode = require('qrcode');
const JsBarcode = require('jsbarcode');
const { DOMImplementation, XMLSerializer } = require('@xmldom/xmldom');
const config = require('../config/config');
const { getSettingCached } = require('./settingsCache');

// Etiketten-Maßstab des Label-SVGs: 5 Einheiten entsprechen 1 mm.
const UNITS_PER_MM = 5;
// Standardmaße des Labels, falls in den Einstellungen nichts hinterlegt ist.
const DEFAULT_LABEL_WIDTH_MM = 64;
const DEFAULT_LABEL_HEIGHT_MM = 34;
// Maximale Balkendicke (X-Dimension) für Code 128. Der Strichcode wird nie über
// seine Zielbreite hinaus gestreckt, sondern behält seine natürlichen
// Proportionen – dadurch wirkt er wie ein ganz normaler Strichcode. Etwas
// dickere Balken machen ihn zugleich breiter (10-stellige ID: 90 Module) und
// zuverlässiger scanbar.
const MAX_MODULE_MM = 0.38;
const BARCODE_FONT = 'monospace';

async function getSetting(key, fallback = '') {
  const value = await getSettingCached(key);
  return value || fallback;
}

// Erzeugt die QR-Code-URL für ein Device.
// Der QR-Code zeigt direkt auf die Gerätedetailseite der App
// ({basePath}/devices?id={id}). Der ältere Endpunkt /fehler/show/device bleibt
// als Weiterleitung erhalten, damit bereits gedruckte Etiketten weiter funktionieren.
async function deviceUrl(device) {
  let appUrl = await getSetting('app.url', '');
  appUrl = appUrl.trim();
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      // Nur http/https erlauben – verhindert javascript:- oder file:-Vektoren im QR-Code
      if (!['http:', 'https:'].includes(parsed.protocol)) appUrl = '';
      else appUrl = parsed.origin;
    } catch {
      appUrl = '';
    }
  }
  const basePath = (config.basePath || '').replace(/\/+$/, '');
  return `${appUrl}${basePath}/devices?id=${encodeURIComponent(device.id)}`;
}

async function qrPng(device) {
  return QRCode.toBuffer(await deviceUrl(device), {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512
  });
}

// AssetID als Barcode-Text: rein numerische IDs werden auf 10 Stellen gebracht
// (0000000234 statt 234, 0000000012 statt 12, 0000000001 statt 1), damit der
// Barcode breit ist und unter allen Geräten eine einheitliche Länge hat.
function padDeviceId(id) {
  const value = String(id ?? '').trim();
  if (/^\d+$/.test(value)) return value.padStart(10, '0');
  return value;
}

// Erzeugt den Barcode als SVG-Fragment und liefert zusätzlich die natürliche
// Größe zurück, damit der Aufrufer ihn exakt platzieren kann. `inner` enthält
// nur den Inhalt ohne <svg>-Hülle.
function renderBarcode(text, height, moduleWidth, fontSize) {
  const document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, text, {
      format: 'CODE128',
      width: moduleWidth,
      height,
      displayValue: true,
      font: BARCODE_FONT,
      fontOptions: 'bold',
      fontSize,
      // die AssetID steht klein und mittig unter den Balken
      textAlign: 'center',
      textMargin: 0,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
      xmlDocument: document
    });
  } catch {}
  const markup = new XMLSerializer().serializeToString(svg);
  return {
    inner: markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
    width: parseFloat(markup.match(/\bwidth="([\d.]+)/)?.[1] || '0'),
    height: parseFloat(markup.match(/\bheight="([\d.]+)/)?.[1] || String(height))
  };
}

const moduleCountCache = new Map();

// Anzahl der Balkenmodule eines Textes. Wird gebraucht, um die Balkendicke so zu
// wählen, dass der Strichcode seine Zielbreite ohne Verzerrung trifft.
function countModules(text) {
  if (moduleCountCache.has(text)) return moduleCountCache.get(text);
  const document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, text, {
      format: 'CODE128',
      width: 1,
      height: 1,
      displayValue: false,
      fontSize: 0,
      textMargin: 0,
      margin: 0,
      xmlDocument: document
    });
  } catch {}
  const markup = new XMLSerializer().serializeToString(svg);
  const count = Math.round(parseFloat(markup.match(/\bwidth="([\d.]+)/)?.[1] || '0'));
  moduleCountCache.set(text, count);
  return count;
}

// Breite des unter den Balken gedruckten Textes (die AssetID). Im Browser
// misst das Canvas, im Backend steht kein Canvas zur Verfügung – für die
// Monospace-Schrift von JsBarcode genügt die übliche Zeichenbreite von ~0,6 em.
function measureBarcodeText(text, fontSizePx) {
  return text.length * fontSizePx * 0.6;
}

function clampMm(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

// ── Aufteilung des Etiketts ─────────────────────────────────────────────────
// Rechteckiges Etikett im Querformat, in zwei Spalten aufgeteilt:
//   links  – oben das Schullogo, darunter der Strichcode über fast die gesamte
//            Breite der linken Spalte, mit der AssetID klein und mittig darunter
//   rechts – oben der große, quadratische QR-Code
// Alle Maße sind Anteile der in den Einstellungen gewählten Etikettengröße, das
// Label skaliert also vollständig mit. Identische Formeln wie im Frontend
// (frontend/src/components/AssetLabel.jsx), damit Druckbogen, Vorschau und
// exportiertes SVG gleich aussehen.
function labelLayoutMm(widthMm, heightMm, moduleCount, textWidthMm) {
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
  // Spaltenrest, senkrecht über die Inhaltshöhe. Dadurch steht er rundum gleich
  // weit vom Etikettenrand ab und das Label wirkt links wie rechts ausgewogen.
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
  // tatsächlich gedruckte Text (fontSize in generateLabelSvg), damit Aufteilung
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

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Logo-Auflösung für Etiketten: ausschließlich aus den Systemeinstellungen.
// Vorrang hat das Label-Logo (label.logo), danach das Zentrallogo der
// Organisation (org.logo). Im Code ist bewusst kein Logo hinterlegt – wer in
// den Einstellungen keines pflegt, bekommt ein Etikett ohne Logo. Wird das Logo
// dort geändert, gilt die Änderung automatisch für jedes neu erzeugte Label.
async function resolveLabelLogo() {
  const labelLogo = (await getSetting('label.logo')).trim();
  if (labelLogo) return labelLogo;
  const orgLogo = (await getSetting('org.logo')).trim();
  return orgLogo;
}

// Etikettengröße aus den Einstellungen (Labeldruck) – das exportierte SVG muss
// dieselbe Größe haben wie Vorschau und Druckbogen.
async function resolveLabelSize() {
  return {
    widthMm: clampNumber(await getSetting('label.widthMm', ''), 20, 210, DEFAULT_LABEL_WIDTH_MM),
    heightMm: clampNumber(await getSetting('label.heightMm', ''), 15, 297, DEFAULT_LABEL_HEIGHT_MM)
  };
}

async function generateLabelSvg(device) {
  const url = await deviceUrl(device);
  // Der Strichcode wird aus der AssetID erzeugt; unter den Balken steht
  // ausschließlich die AssetID – kein Gerätename, keine Gerätebezeichnung.
  const barcodeText = padDeviceId(device.id);
  const labelLogo = await resolveLabelLogo();
  const size = await resolveLabelSize();
  const labelWidth = Math.round(size.widthMm * UNITS_PER_MM);
  const labelHeight = Math.round(size.heightMm * UNITS_PER_MM);

  const qrDataUrl = await QRCode.toDataURL(url, {
    type: 'image/png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 210
  });

  // Gleiche Aufteilung wie im Frontend (AssetLabel): links oben das Logo, darunter
  // der Strichcode über die Breite der linken Spalte, rechts oben der QR-Code.
  const moduleCount = barcodeText ? countModules(barcodeText) : 0;
  const textMm = clampMm(size.heightMm * 0.1, 1.3, 4.5);
  const fontSize = Math.max(4, Math.round(textMm * UNITS_PER_MM));
  const textWidthMm = measureBarcodeText(barcodeText, fontSize) / UNITS_PER_MM;
  const layout = labelLayoutMm(size.widthMm, size.heightMm, moduleCount, textWidthMm);

  // Strichcode direkt in der berechneten Balkendicke rendern (kein nachträgliches
  // Skalieren), damit die Balkenproportionen erhalten bleiben.
  const barcode = barcodeText
    ? renderBarcode(barcodeText, layout.barHeightMm * UNITS_PER_MM, layout.moduleMm * UNITS_PER_MM, fontSize)
    : { inner: '' };
  const u = (value) => (Math.round(value * UNITS_PER_MM * 100) / 100);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${labelWidth}" height="${labelHeight}" viewBox="0 0 ${labelWidth} ${labelHeight}">
  <rect width="${labelWidth}" height="${labelHeight}" fill="#ffffff"/>
  ${labelLogo ? `<image x="${u(layout.logoLeftMm)}" y="${u(layout.logoTopMm)}" width="${u(layout.logoWMm)}" height="${u(layout.logoHmm)}" preserveAspectRatio="xMinYMid meet" href="${escapeXml(labelLogo)}" xlink:href="${escapeXml(labelLogo)}" />` : ''}
  <g transform="translate(${u(layout.barcodeLeftMm)}, ${u(layout.barcodeTopMm)})">
    ${barcode.inner}
  </g>
  <g transform="translate(${u(layout.qrLeftMm)}, ${u(layout.qrTopMm)})">
    <image width="${u(layout.qrSizeMm)}" height="${u(layout.qrSizeMm)}" href="${qrDataUrl}" xlink:href="${qrDataUrl}" />
  </g>
</svg>`;
}

module.exports = { deviceUrl, qrPng, generateLabelSvg };
