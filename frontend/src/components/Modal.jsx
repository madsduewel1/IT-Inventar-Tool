import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ open, title, subtitle, children, onClose }) {
  // Auf dem Handy ist der Dialog fast bildschirmfüllend und der Inhalt scrollt
  // für sich, damit Kopf- und Fußbereich immer erreichbar bleiben.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Das Overlay wird per Portal an den <body> gehängt: Seiten werden von einer
  // Animation (page-enter) umschlossen, die über eine Retained-Transform einen
  // Containing-Block für position:fixed erzeugt. Ohne Portal würde der Dialog
  // nicht viewport-füllend, sondern nur innerhalb des Seiteninhalts erscheinen.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <section
        className="card modal-max-h flex w-full flex-col overflow-hidden rounded-b-none sm:max-w-2xl sm:rounded-b-[0.25rem]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-outline-variant px-4 py-3.5 sm:px-5 sm:py-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface sm:text-lg">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>}
          </div>
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-outline transition hover:text-on-surface"
            onClick={onClose}
            title="Schließen"
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">{children}</div>
      </section>
    </div>,
    document.body
  );
}
