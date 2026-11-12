import { Mail, PencilLine } from 'lucide-react';

/**
 * Gemeinsames Formular für Bereichsseiten (Anlegen + Detail):
 * Stammdaten, Ausleihe-/Benachrichtigungs-Einstellungen und die beiden
 * Personenlisten (E-Mail-Empfänger und Bearbeiter). Wird von den Seiten
 * `/admin/areas/new` und `/admin/areas/:id` verwendet.
 */
export default function AreaForm({ form, setForm, users, rooms, saving, error, submitLabel = 'Speichern', onSubmit }) {
  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function togglePerson(key, userId) {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(userId) ? current[key].filter((id) => id !== userId) : [...current[key], userId]
    }));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Name <span className="text-red-500">*</span>
            <input
              className="field mt-1"
              required
              value={form.name}
              onChange={(event) => setValue('name', event.target.value)}
              placeholder="z. B. Arbeitsplätze 5a"
            />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Raum / Standort
            <select className="field mt-1" value={form.roomId} onChange={(event) => setValue('roomId', event.target.value)}>
              <option value="">Kein Raum</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.building ? `${room.building} · ${room.name}` : room.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 md:col-span-2">Beschreibung
            <textarea
              className="field mt-1 min-h-20 resize-y"
              value={form.description}
              onChange={(event) => setValue('description', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <Toggle
            label="Ausleihe erlaubt"
            hint="Bereich in der Ausleihe-Anfrage wählbar"
            value={form.lendEnabled}
            onChange={(value) => setValue('lendEnabled', value)}
          />
          <Toggle
            label="Einzelverwaltung"
            hint="Jedes Gerät einzeln zuweisen"
            value={form.individualManagement}
            onChange={(value) => setValue('individualManagement', value)}
          />
          <Toggle
            label="Fehler-E-Mail"
            hint="Empfänger bei neuen Tickets informieren"
            value={form.issueMailEnabled}
            onChange={(value) => setValue('issueMailEnabled', value)}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <AreaUserPicker
          icon={<Mail size={16} />}
          title="E-Mail-Empfänger"
          hint="Erhalten E-Mails zu neuen Tickets aus diesem Bereich"
          users={users}
          selected={form.memberIds}
          onToggle={(id) => togglePerson('memberIds', id)}
        />
        <AreaUserPicker
          icon={<PencilLine size={16} />}
          title="Bearbeiter"
          hint="Dürfen Tickets der Geräte dieses Bereichs bearbeiten"
          users={users}
          selected={form.editorIds}
          onToggle={(id) => togglePerson('editorIds', id)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Speichert…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function AreaUserPicker({ icon, title, hint, users, selected, onToggle }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-black/5 px-5 py-4">
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
    </section>
  );
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-zinc-700">
      <button
        type="button"
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-emerald-500' : 'bg-gray-300'}`}
        onClick={() => onChange(!value)}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
      <div className="mt-2 text-sm font-medium text-gray-700 dark:text-zinc-300">{label}</div>
      <div className="text-xs text-gray-500 dark:text-zinc-500">{hint}</div>
    </div>
  );
}