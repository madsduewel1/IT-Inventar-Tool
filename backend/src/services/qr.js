const QRCode = require('qrcode');
const JsBarcode = require('jsbarcode');
const { DOMImplementation, XMLSerializer } = require('@xmldom/xmldom');
const prisma = require('../config/prisma');
const config = require('../config/config');

async function getSetting(key, fallback = '') {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value || fallback;
}

async function deviceUrl(device) {
  let appUrl = await getSetting('app.url', '');
  appUrl = appUrl.trim().replace(/\/+$/, '');
  const basePath = config.basePath.trim().replace(/\/+$/, '');
  const base = `${appUrl}${basePath.startsWith('/') ? basePath : '/' + basePath}`;
  return `${base}/devices/${encodeURIComponent(device.inventoryId)}`;
}

async function qrPng(device) {
  return QRCode.toBuffer(await deviceUrl(device), {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512
  });
}

function generateBarcodeSvg(text, height) {
  const document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, text, {
      format: 'CODE128',
      width: 1.5,
      height: height || 40,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
      xmlDocument: document
    });
  } catch {}
  return new XMLSerializer().serializeToString(svg);
}

async function generateLabelSvg(device) {
  const url = await deviceUrl(device);
  const inventoryId = device.inventoryId || 'INV-000';
  const orgLogo = await getSetting('org.logo', '');
  const labelWidth = 280;
  const labelHeight = 160;

  const qrDataUrl = await QRCode.toDataURL(url, {
    type: 'image/png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200
  });

  const barcodeSvg = generateBarcodeSvg(inventoryId, 60);

  const barcodeWidth = 140;
  const rightWidth = labelWidth - barcodeWidth - 10;
  const qrSize = 80;
  const logoSize = 36;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth}" height="${labelHeight}" viewBox="0 0 ${labelWidth} ${labelHeight}">
  <rect width="${labelWidth}" height="${labelHeight}" fill="#ffffff"/>
  <g transform="translate(8, ${Math.round((labelHeight - 60) / 2)})">
    ${barcodeSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}
  </g>
  <g transform="translate(${barcodeWidth + 12}, 12)">
    <text x="${rightWidth - 4}" y="16" text-anchor="end" font-family="Arial, sans-serif" font-weight="bold" font-size="14" fill="#000000">THOMAS-MANN-SCHULE</text>
    ${orgLogo ? `<image x="${rightWidth - logoSize}" y="22" width="${logoSize}" height="${logoSize}" href="${orgLogo}" />` : ''}
  </g>
  <g transform="translate(${labelWidth - qrSize - 12}, ${labelHeight - qrSize - 10})">
    <image width="${qrSize}" height="${qrSize}" href="${qrDataUrl}" />
  </g>
</svg>`;
}

module.exports = { deviceUrl, qrPng, generateLabelSvg };
