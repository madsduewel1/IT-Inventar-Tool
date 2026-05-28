import { useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import JsBarcode from 'jsbarcode';

export const labelDefaults = {
  widthMm: 70,
  heightMm: 40
};

export function normalizeLabelSettings(settings = {}) {
  return {
    widthMm: clampNumber(settings['label.widthMm'], 50, 160, labelDefaults.widthMm),
    heightMm: clampNumber(settings['label.heightMm'], 25, 100, labelDefaults.heightMm)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function AssetLabel({ device, settings = {}, qrValue, preview = false, align = 'center' }) {
  const label = normalizeLabelSettings(settings);
  const inventoryId = device?.inventoryId || 'INV-000';
  const basePath = import.meta.env.BASE_URL || '/';
  const baseUrl = `${window.location.origin}${basePath}`.replace(/\/+$/, '');
  const value = qrValue || `${baseUrl}/devices/${inventoryId}`;
  const qrSize = Math.max(36, Math.min(72, Math.round(label.heightMm * 1.6)));
  const previewScale = preview ? Math.min(1, 260 / (label.widthMm * 3.78)) : 1;
  const alignmentClass = align === 'start' ? 'mr-auto' : 'mx-auto';
  const barcodeRef = useRef(null);

  const logoUrl = settings['org.logo'] || `${basePath}tms-logo.png`;

  useEffect(() => {
    if (barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, inventoryId, {
          format: 'CODE128',
          width: 1.2,
          height: Math.max(16, Math.min(36, label.heightMm * 0.8)),
          displayValue: false,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000'
        });
      } catch {}
    }
  }, [inventoryId, label.heightMm]);

  return (
    <div
      className={`${alignmentClass} shrink-0 overflow-hidden bg-white text-black print:shadow-none`}
      style={{
        width: `${label.widthMm}mm`,
        height: `${label.heightMm}mm`,
        transform: preview ? `scale(${previewScale})` : undefined,
        transformOrigin: 'top center'
      }}
    >
      <div className="flex h-full" style={{ padding: `${label.heightMm * 0.08}mm ${label.widthMm * 0.04}mm` }}>
        <div className="flex shrink-0 items-center justify-center" style={{ width: `${Math.round(label.widthMm * 0.38)}mm` }}>
          <svg ref={barcodeRef} />
        </div>

        <div className="flex flex-1 flex-col items-end justify-between" style={{ paddingLeft: `${label.widthMm * 0.03}mm` }}>
          <div className="flex items-center" style={{ gap: `${label.widthMm * 0.03}mm` }}>
            <div className="font-bold tracking-tight text-black" style={{ fontSize: `${Math.max(6, Math.round(label.heightMm * 0.18))}px`, lineHeight: 1.1 }}>
              THOMAS-MANN-SCHULE
            </div>
            <img
              src={logoUrl}
              alt="TMS"
              style={{
                height: `${Math.max(10, Math.round(label.heightMm * 0.3))}px`,
                width: 'auto',
                maxWidth: `${Math.round(label.widthMm * 0.12)}mm`
              }}
              className="object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>

          <div className="flex items-center justify-center">
            <QRCode value={value} size={qrSize} bgColor="#ffffff" fgColor="#000000" />
          </div>
        </div>
      </div>
    </div>
  );
}