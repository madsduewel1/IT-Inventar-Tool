import { useEffect, useState } from 'react';
import { AppWindow, Mail, PencilLine, User, Wifi, Save } from 'lucide-react';
import { api } from '../../api/client';
import { PageLoader } from '../../components/Loading';
import { AdminPage } from './Users';

/**
 * Ticket-Zuständigkeiten (/admin/ticket-responsibilities): Zuständige Personen
 * je Ticketart (Netzwerk, Dienstgerät, Software). Wie bei den Bereichen gibt
 * es je Ticketart zwei Listen: E-Mail-Empfänger (werden informiert) und
 * Bearbeiter (dürfen Tickets dieser Art bearbeiten). Schulgerät-Tickets
 * (DEVICE) laufen über die Bereiche und werden hier nicht gepflegt.
 */
const TYPE_ICONS = { WLAN: Wifi, PERSONAL: User, SOFTWARE: AppWindow };

export default function TicketResponsibilities() {
  const [types, setTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/ticket-types').catch(() => ({ data: { types: [] } })),
      api.get('/users/list').catch(() => ({ data: { users: [] } }))
    ])
      .then(([typesResult, usersResult]) => {
        const staff = (usersResult.data.users || []).filter((user) => ['STAFF', 'ADMIN'].includes(user.role));
        setUsers(staff);
        setTypes((typesResult.data.types || []).map((type) => ({
          ...type,
          memberIds: (type.members || []).map((member) => member.user?.id).filter(Boolean),
          editorIds: (type.editors || []).map((editor) => editor.user?.id).filter(Boolean)
        })));
        setError('');
      })
      .catch(() => setError('Zuständigkeiten konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, []);

  function togglePerson(type, key, userId) {
    setTypes((prev) => prev.map((entry) => {
      if (entry.type !== type) return entry;
      const list = entry[key].includes(userId) ? entry[key].filter((id) => id !== userId) : [...entry[key], userId];
      return { ...entry, [key]: list };
    }));
  }

  async function saveType(type) {
    const entry = types.find((t) => t.type === type);
    if (!entry) return;
    setSaving(type);
    setError('');
    try {
      await api.put(`/ticket-types/${type}/members`, { userIds: entry.memberIds });
      await api.put(`/ticket-types/${type}/editors`, { userIds: entry.editorIds });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Zuständigkeiten konnten nicht gespeichert werden.');
    } finally {
      setSaving('');
    }
  }

  if (loading) return <PageLoader text="Zuständigkeiten werden geladen…" />;

  return (
    <AdminPage title="Ticket-Zuständigkeiten" subtitle="Wer darf Tickets der einzelnen Ticketarten bearbeiten und informiert werden?">
      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}

      <div className="grid gap-5">
        {types.map((type) => {
          const Icon = TYPE_ICONS[type.type] || Mail;
          return (
            <section key={type.type} className="card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-black/5 px-5 py-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-100">
                  <Icon size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-800 dark:text-zinc-100">{type.label}</h2>
                  <p className="text-xs text-gray-500">
                    {type.memberCount || 0} E-Mail-Empfänger · {type.editorCount || 0} Bearbeiter
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary ml-auto shrink-0"
                  onClick={() => saveType(type.type)}
                  disabled={saving === type.type}
                >
                  <Save size={16} />{saving === type.type ? 'Speichert…' : 'Speichern'}
                </button>
              </div>

              <div className="grid gap-4 p-5 lg:grid-cols-2">
                <TypeUserPicker
                  icon={<Mail size={16} />}
                  title="E-Mail-Empfänger"
                  hint="Werden bei neuen Tickets dieser Art informiert"
                  users={users}
                  selected={type.memberIds}
                  onToggle={(userId) => togglePerson(type.type, 'memberIds', userId)}
                />
                <TypeUserPicker
                  icon={<PencilLine size={16} />}
                  title="Bearbeiter"
                  hint="Dürfen Tickets dieser Art bearbeiten"
                  users={users}
                  selected={type.editorIds}
                  onToggle={(userId) => togglePerson(type.type, 'editorIds', userId)}
                />
              </div>
            </section>
          );
        })}
      </div>
    </AdminPage>
  );
}

function TypeUserPicker({ icon, title, hint, users, selected, onToggle }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-zinc-700">
      <div className="border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-zinc-200">
          {icon} {title}
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{selected.length}</span>
        </div>
        <div className="mt-0.5 text-xs text-gray-500">{hint}</div>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto p-3">
        {users.map((user) => (
          <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={selected.includes(user.id)}
              onChange={() => onToggle(user.id)}
            />
            <span className="min-w-0 truncate">{user.displayName || user.username}</span>
          </label>
        ))}
        {!users.length && <p className="px-3 py-2 text-sm text-gray-500">Keine passenden Benutzer vorhanden.</p>}
      </div>
    </div>
  );
}