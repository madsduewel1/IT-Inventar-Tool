import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export default function MultiSelect({
  label,
  options = [],
  value = [],
  onChange,
  placeholder = 'Alle',
  searchPlaceholder = 'Suchen…',
  className = ''
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(() => options.filter((option) => selectedSet.has(option.value)), [options, selectedSet]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);
  const showSearch = options.length > 8;

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, 260);
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
      setPosition({
        left,
        width,
        top: openUp ? undefined : rect.bottom + 8,
        bottom: openUp ? window.innerHeight - rect.top + 8 : undefined,
        maxHeight: Math.max(160, Math.min(360, openUp ? spaceAbove : spaceBelow))
      });
    }

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  function toggleOption(optionValue) {
    if (selectedSet.has(optionValue)) {
      onChange(value.filter((entry) => entry !== optionValue));
      return;
    }
    onChange([...value, optionValue]);
  }

  const summary = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length <= 2
      ? selectedOptions.map((option) => option.label).join(', ')
      : `${selectedOptions.length} ausgewählt`;

  return (
    <div className={className}>
      {label && <div className="mb-1 text-xs font-medium text-on-surface-variant">{label}</div>}
      <button
        ref={triggerRef}
        type="button"
        className="field flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className={`truncate ${selectedOptions.length === 0 ? 'text-on-surface-variant' : ''}`}>{summary}</span>
        <ChevronDown size={16} className={`shrink-0 text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && position && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[80] overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom }}
        >
          {showSearch && (
            <div className="border-b border-black/5 p-2 dark:border-white/10">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  className="field h-9 min-h-9 pl-8 text-sm"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto p-1.5" style={{ maxHeight: Math.max(120, position.maxHeight - (showSearch ? 58 : 8)) }}>
            {filteredOptions.map((option) => {
              const selected = selectedSet.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleOption(option.value)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-surface-container-low ${selected ? 'font-medium text-primary' : 'text-on-surface'}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-primary bg-primary text-white' : 'border-outline'}`}>
                    {selected && <Check size={12} />}
                  </span>
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
            {!filteredOptions.length && <div className="px-3 py-4 text-center text-sm text-on-surface-variant">Keine Optionen gefunden.</div>}
          </div>
          {value.length > 0 && (
            <div className="border-t border-black/5 p-1.5 dark:border-white/10">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                onClick={() => onChange([])}
              >
                <X size={14} />Auswahl löschen
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
