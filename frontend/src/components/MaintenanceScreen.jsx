import { Loader2, Wrench } from 'lucide-react';

export default function MaintenanceScreen({ maintenance }) {
  const startedAt = maintenance?.startedAt ? new Date(maintenance.startedAt).toLocaleString('de-DE') : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-app,#f5f6f8)] px-6 py-10 dark:bg-zinc-950">
      <div className="w-full max-w-lg rounded-2xl border border-black/5 bg-white p-8 text-center shadow-xl dark:border-white/10 dark:bg-zinc-900">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <Wrench size={30} />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-gray-900 dark:text-zinc-100">Wartungsmodus</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-zinc-300">
          {maintenance?.message || 'Das System wird gerade gewartet. Bitte versuchen Sie es in wenigen Minuten erneut.'}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-gray-500 dark:text-zinc-400">
          <Loader2 size={14} className="animate-spin" />
          Die Seite wird automatisch neu geladen, sobald das System wieder verfügbar ist.
        </div>
        {startedAt && (
          <p className="mt-4 text-[11px] text-gray-400 dark:text-zinc-500">Wartung gestartet: {startedAt}</p>
        )}
        <a
          href="?bypassMaintenance=1"
          className="mt-5 inline-block text-[11px] font-medium text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          Als Administrator anmelden
        </a>
      </div>
    </div>
  );
}
