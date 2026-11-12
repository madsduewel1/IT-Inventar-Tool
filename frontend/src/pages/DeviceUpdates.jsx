import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Plus, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { ListSkeleton } from '../components/Loading';

export default function DeviceUpdates() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      setLoading(true);
      const updatesRes = await api.get('/updates');
      setUpdates(updatesRes.data || []);
    } catch (err) {
      setError('Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Aggregate stats
  const totalUpdates = updates.length;
  const totalDevicesUpdated = updates.reduce((sum, u) => sum + (u.counts?.total || 0), 0);
  const totalFailures = updates.reduce((sum, u) => sum + (u.counts?.failed || 0), 0);

  if (loading && updates.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="h-7 w-48 skeleton rounded-lg" />
            <div className="mt-2 h-4 w-72 max-w-full skeleton rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="card p-4"><div className="h-3 w-1/3 skeleton rounded" /><div className="mt-2 h-8 w-16 skeleton rounded" /></div>)}
        </div>
        <ListSkeleton rows={4} card />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-zinc-100">Geräte-Updates</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">System-Updates auf Geräten erfassen, verwalten und auf Fehler überprüfen.</p>
        </div>
        <Link to="/updates/new" className="btn-primary">
          <Plus size={17} />Update durchführen
        </Link>
      </div>

      {/* Metrics */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 md:text-sm">Durchgeführte Updates</div>
          <div className="mt-1 text-3xl font-bold text-gray-800 dark:text-zinc-200">{totalUpdates}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 md:text-sm">Aktualisierte Geräte</div>
          <div className="mt-1 text-3xl font-bold text-green-600 dark:text-green-400">{totalDevicesUpdated}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 md:text-sm">Fehlerhafte Updates</div>
          <div className={`mt-1 text-3xl font-bold ${totalFailures > 0 ? 'text-red-500 dark:text-red-400 animate-pulse' : 'text-gray-800 dark:text-zinc-200'}`}>
            {totalFailures}
          </div>
        </div>
      </section>

      {/* overflow-x-auto statt overflow-hidden: zwischen md (768px) und ca. 1100px
          passt das 5-Spalten-Raster noch nicht, es soll dann aber scrollen
          statt abgeschnitten zu werden. */}
      <section className="card overflow-x-auto">
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{error}</div>}
        
        {/* Desktop Header */}
        <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_minmax(180px,1.5fr)_minmax(180px,1fr)_120px] gap-3 border-b border-black/5 dark:border-white/5 bg-[#fafafa] dark:bg-zinc-900 px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 md:grid">
          <div>Datum / Uhrzeit</div>
          <div>Ort</div>
          <div>Räume</div>
          <div>Ergebnis</div>
          <div className="text-right">Aktion</div>
        </div>

        <div className="divide-y divide-black/5 dark:divide-white/5">
          {updates.map((update) => (
            <div key={update.id} className="grid gap-3 p-4 md:grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_minmax(180px,1.5fr)_minmax(180px,1fr)_120px] md:items-center hover:bg-[#fafafa] dark:hover:bg-[var(--bg-sidebar-item-hover)] transition-colors">
              
              {/* Datum */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400">
                  <Calendar size={18} />
                </div>
                <div>
                  <div className="font-semibold text-gray-800 dark:text-zinc-200">
                    {new Date(update.dateTime).toLocaleString('de-DE', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>

              {/* Ort */}
              <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-zinc-300">
                <MapPin size={15} className="text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="truncate">{update.location}</span>
              </div>

              {/* Räume */}
              <div className="text-sm text-gray-600 dark:text-zinc-400 line-clamp-2 md:truncate">
                {update.rooms?.length > 0 
                  ? update.rooms.map(r => r.name).join(', ') 
                  : 'Alle updateberechtigten Geräte'}
              </div>

              {/* Ergebnis */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                  update.counts?.failed > 0 
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
                    : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                }`}>
                  {update.counts?.success} / {update.counts?.total} erfolgreich
                </span>
                {update.counts?.failed > 0 && (
                  <span className="text-xs font-semibold text-red-500 dark:text-red-400">
                    ({update.counts.failed} fehlerhaft)
                  </span>
                )}
              </div>

              {/* Aktion */}
              <div className="mt-2 md:mt-0 md:text-right">
                <Link 
                  to={`/updates?id=${update.id}`} 
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Protokoll <ArrowRight size={14} />
                </Link>
              </div>

            </div>
          ))}

          {updates.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Noch keine Update-Protokolle vorhanden. Klicken Sie oben auf "Update durchführen", um das erste Protokoll zu erstellen.
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
