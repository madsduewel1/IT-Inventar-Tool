import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save } from 'lucide-react';
import { api } from '../../api/client';
import { PageLoader } from '../../components/Loading';
import { AdminPage } from './Users';

const OPTIONS = [
  {
    key: 'tickets.notifyReporterOnUpdate',
    label: 'Melder bei Statusänderungen informieren',
    description: 'Der Melder erhält eine E-Mail, wenn sein Ticket bearbeitet oder geschlossen wird.'
  },
  {
    key: 'tickets.notifyReporterOnComment',
    label: 'Melder bei neuen Kommentaren informieren',
    description: 'Der Melder erhält eine E-Mail, wenn jemand auf sein Ticket antwortet.'
  },
  {
    key: 'tickets.notifyAssignees',
    label: 'Bearbeiter informieren',
    description: 'Zugewiesene Bearbeiter und der Hauptverantwortliche erhalten E-Mails zu neuen Tickets, Kommentaren und Änderungen.'
  },
  {
    key: 'tickets.notifyAreaRecipients',
    label: 'Bereichs-Empfänger informieren',
    description: 'Empfänger eines Gerätebereichs werden bei neuen Tickets benachrichtigt, sofern die Bereichsbenachrichtigung aktiv ist.'
  },
  {
    key: 'tickets.notifyTypeRecipients',
    label: 'Ticketart-Empfänger informieren',
    description: 'Zuständige Empfänger einer Ticketart (WLAN, Dienstgerät, Software) werden bei neuen Tickets benachrichtigt.'
  },
  {
    key: 'tickets.notifyTemplateRecipients',
    label: 'Vorlagen-Empfänger informieren',
    description: 'Zusätzliche E-Mail-Empfänger aus einer Ticket-Vorlage werden bei neuen Tickets benachrichtigt.'
  }
];

function isEnabled(value) {
  return value !== 'false';
}

export default function TicketNotifications() {
  const [values, setValues] = useState(() => Object.fromEntries(OPTIONS.map((option) => [option.key, true])));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/settings')
      .then(({ data }) => {
        setValues(Object.fromEntries(OPTIONS.map((option) => [option.key, isEnabled(data.settings?.[option.key])])));
      })
      .catch(() => setError('Einstellungen konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key) {
    setMessage('');
    setValues((current) => ({ ...current, [key]: !current[key] }));
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.patch('/settings', Object.fromEntries(
        OPTIONS.map((option) => [option.key, values[option.key] ? 'true' : 'false'])
      ));
      setMessage('Benachrichtigungseinstellungen gespeichert.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Einstellungen konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader text="Benachrichtigungseinstellungen werden geladen…" />;

  return (
    <AdminPage
      title="Ticket-Benachrichtigungen"
      subtitle="Wer wird bei neuen Tickets, Kommentaren und Statusänderungen per E-Mail informiert?"
    >
      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {message && <div className="rounded-xl bg-green-50 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-300">{message}</div>}

      <section className="card overflow-hidden">
        <div className="border-b border-black/5 px-5 py-4 dark:border-zinc-700">
          <h2 className="font-semibold text-gray-800 dark:text-zinc-100">E-Mail-Benachrichtigungen</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Diese Schalter gelten global. Wer genau zuständig ist, legen Sie unter
            {' '}<Link className="font-medium text-violet-600 hover:underline dark:text-violet-300" to="/admin/ticket-responsibilities">Ticket-Zuständigkeiten</Link>,
            {' '}<Link className="font-medium text-violet-600 hover:underline dark:text-violet-300" to="/admin/areas">Bereichen</Link>
            {' '}und{' '}
            <Link className="font-medium text-violet-600 hover:underline dark:text-violet-300" to="/admin/ticket-templates">Ticket-Vorlagen</Link> fest.
          </p>
        </div>
        <div className="divide-y divide-black/5 dark:divide-zinc-700">
          {OPTIONS.map((option) => (
            <label key={option.key} className="flex cursor-pointer items-start gap-3 px-5 py-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={values[option.key]}
                onChange={() => toggle(option.key)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-800 dark:text-zinc-100">{option.label}</span>
                <span className="mt-0.5 block text-sm text-gray-500 dark:text-zinc-400">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end border-t border-black/5 px-5 py-4 dark:border-zinc-700">
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </section>

      <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500 dark:bg-zinc-800/60 dark:text-zinc-400">
        Der Versand setzt eine konfigurierte SMTP-Verbindung voraus. Systemmeldungen an Administratoren
        (z. B. zu Ausleihen) bleiben von diesen Schaltern unberührt.
      </div>
    </AdminPage>
  );
}
