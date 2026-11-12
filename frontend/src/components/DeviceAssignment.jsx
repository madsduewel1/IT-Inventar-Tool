import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { DEVICE_CATEGORIES, VISIBILITY_LABELS } from './deviceMeta';
import { DEVICE_ICONS, deviceIconProps } from './deviceIcons';

/**
 * Gemeinsamer Block „Zuordnung und Sichtbarkeit" für Asset-anlegen und
 * Asset-bearbeiten (Konzept „Mein Gerät", Abschnitt 2.2/4/24):
 * Geräteart, Gerätename/Hostname, Symbol, Sichtbarkeit, Bereich und
 * zuständiger Administrator.
 */
export default function DeviceAssignment({ form, setValue }) {
  const [areas, setAreas] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    api.get('/areas').then(({ data }) => setAreas(data.areas || [])).catch(() => setAreas([]));
    api.get('/users/list').then(({ data }) => setUsers(data.users || [])).catch(() => setUsers([]));
  }, []);

  const staffUsers = users.filter((user) => ['STAFF', 'ADMIN'].includes(user.role));
  const preview = deviceIconProps({ icon: form.icon, category: form.category });

  return (
    <>
      <label className="text-sm font-medium text-gray-700">Geräteart
        <select className="field mt-1" value={form.category || 'OTHER'} onChange={(event) => setValue('category', event.target.value)}>
          {DEVICE_CATEGORIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
      </label>

      <label className="text-sm font-medium text-gray-700">Gerätename / Hostname
        <input
          className="field mt-1"
          value={form.hostname || ''}
          onChange={(event) => setValue('hostname', event.target.value)}
          placeholder="z. B. nb-lehrerzimmer-01"
        />
      </label>

      {/* Symbol-Auswahl: kein Eintrag = Standard aus der Geräteart */}
      <div className="md:col-span-2">
        <span className="text-sm font-medium text-gray-700">Symbol</span>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setValue('icon', '')}
            className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition ${
              !form.icon
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-200'
                : 'border-black/10 text-gray-600 hover:border-gray-400 dark:border-zinc-700 dark:text-zinc-300'
            }`}
          >
            <preview.Icon size={17} className={preview.cls} />
            Standard (aus Geräteart)
          </button>
          {DEVICE_ICONS.map((entry) => {
            const Icon = deviceIconProps({ icon: entry.value }).Icon;
            const active = form.icon === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                title={entry.label}
                onClick={() => setValue('icon', entry.value)}
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-200'
                    : 'border-black/10 text-gray-600 hover:border-gray-400 dark:border-zinc-700 dark:text-zinc-300'
                }`}
              >
                <Icon size={17} />
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="text-sm font-medium text-gray-700">Sichtbarkeit
        <select className="field mt-1" value={form.visibility || 'ALL'} onChange={(event) => setValue('visibility', event.target.value)}>
          {Object.entries(VISIBILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>

      <label className="text-sm font-medium text-gray-700">Bereich
        <select className="field mt-1" value={form.areaId || ''} onChange={(event) => setValue('areaId', event.target.value)}>
          <option value="">Kein Bereich</option>
          {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
        </select>
      </label>

      <label className="text-sm font-medium text-gray-700">Zuständiger Administrator
        <select className="field mt-1" value={form.adminId || ''} onChange={(event) => setValue('adminId', event.target.value)}>
          <option value="">Nicht festgelegt</option>
          {staffUsers.map((user) => (
            <option key={user.id} value={user.id}>{user.displayName || user.username}</option>
          ))}
        </select>
      </label>
    </>
  );
}
