import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '../../api/client';
import { PageLoader } from '../../components/Loading';
import { ISSUE_PRIORITIES } from '../../components/issueMeta';
import { AdminPage } from './Users';

const PRIORITY_ORDER = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

function parseList(value, fallback) {
  const entries = String(value || '')
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => PRIORITY_ORDER.includes(entry));
  return new Set(entries.length ? entries : fallback);
}

export default function TicketPriorities() {
  const [restricted, setRestricted] = useState(new Set(['LOW', 'NORMAL', 'HIGH']));
  const [defect, setDefect] = useState(new Set(['CRITICAL']));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/settings')
      .then(({ data }) => {
        setRestricted(parseList(data.settings?.['tickets.restrictedPriorities'], ['LOW', 'NORMAL', 'HIGH']));
        setDefect(parseList(data.settings?.['tickets.defectPriorities'], ['CRITICAL']));
      })
      .catch(() => setError('Einstellungen konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, []);

  function toggle(group, value) {
    setMessage('');
    if (group === 'restricted') {
      setRestricted((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value); else next.add(value);
        return next;
      });
      setDefect((prev) => {
        if (!prev.has(value)) return prev;
        const next = new Set(prev);
        next.delete(value);
        return next;
      });
    } else {
      setDefect((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value); else next.add(value);
        return next;
      });
      setRestricted((prev) => {
        if (!prev.has(value)) return prev;
        const next = new Set(prev);
        next.delete(value);
        return next;
      });
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.patch('/settings', {
        'tickets.restrictedPriorities': PRIORITY_ORDER.filter((value) => restricted.has(value)).join(','),
        'tickets.defectPriorities': PRIORITY_ORDER.filter((value) => defect.has(value)).join(',')
      });
      setMessage('Prioritäten gespeichert. Der Gerätezustand wird beim nächsten Ticket-Update neu berechnet.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Prioritäten konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader text="Ticket-Prioritäten werden geladen…" />;

  return (
    <AdminPage
      title="Ticket-Prioritäten"
      subtitle="Welche Dringlichkeit macht ein Gerät nur eingeschränkt und welche macht es defekt?"
    >
      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-xl bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-300">{message}</div>}

      <section className="card overflow-hidden">
        <div className="border-b border-black/5 px-5 py-4 dark:border-zinc-700">
          <h2 className="font-semibold text-gray-800 dark:text-zinc-100">Wirkung der Dringlichkeit</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Jede Priorität gehört genau einer Gruppe an. „Defekt“ hat Vorrang, falls doch einmal beide gesetzt sind.
          </p>
        </div>
        <div className="divide-y divide-black/5 dark:divide-zinc-700">
          {PRIORITY_ORDER.map((value) => {
            const meta = ISSUE_PRIORITIES[value];
            return (
              <div key={value} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className={`badge shrink-0 ${meta.badge}`}>{meta.label}</span>
                <span className="min-w-0 flex-1 text-sm text-gray-500 dark:text-zinc-400">{value}</span>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300">
                  <input type="checkbox" checked={restricted.has(value)} onChange={() => toggle('restricted', value)} />
                  Eingeschränkt
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300">
                  <input type="checkbox" checked={defect.has(value)} onChange={() => toggle('defect', value)} />
                  Defekt
                </label>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end border-t border-black/5 px-5 py-4 dark:border-zinc-700">
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </section>

      <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500 dark:bg-zinc-800/60 dark:text-zinc-400">
        Die Einstellung wirkt auf offene Tickets und die automatische Gerätezustands-Anzeige. Manuell gesperrte Gerätestatus
        werden nicht überschrieben.
      </div>
    </AdminPage>
  );
}
