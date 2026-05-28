import { X } from 'lucide-react';

export default function Modal({ open, title, subtitle, children, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={onClose}>
      <section className="card w-full max-w-2xl overflow-hidden" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-black/5 p-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fafafa] text-gray-500 hover:text-gray-800" onClick={onClose} title="Schließen">
            <X size={20} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}
