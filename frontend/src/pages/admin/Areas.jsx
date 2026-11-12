import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FolderTree, Mail, PencilLine, Plus, Trash2, Users } from 'lucide-react';
import { api } from '../../api/client';
import { useConfirm } from '../../components/ConfirmDialog';
import { PageLoader } from '../../components/Loading';
import { AdminPage } from './Users';

/**
 * Bereichsliste (Konzept Abschnitt 9/11): Überblick über alle Gerätebereiche.
 * Anlegen und Bearbeiten laufen über die eigenen Seiten
 * `/admin/areas/new` und `/admin/areas/:id` (statt eines Popups).
 */
export default function Areas() {
  const confirm = useConfirm();
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/areas');
      setAreas(data.areas || []);
      setError('');
    } catch {
      setError('Bereiche konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total: areas.length,
    devices: areas.reduce((sum, area) => sum + (area.deviceCount || 0), 0),
    lendable: areas.filter((area) => area.lendEnabled).length,
    mail: areas.filter((area) => area.issueMailEnabled).length
  }), [areas]);

  async function deleteArea(area) {
    const ok = await confirm({
      title: 'Bereich löschen',
      message: `Bereich „${area.name}“ wirklich löschen?`,
      tone: 'danger',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    setError('');
    try {
      await api.delete(`/areas/${area.id}`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Bereich konnte nicht gelöscht werden.');
    }
  }

  if (loading) return <PageLoader text="Bereiche werden geladen…" />;

  return (
    <AdminPage title="Gerätebereiche" subtitle="Bereiche für Ausleihe, Fehlerbenachrichtigung und Zuordnung von Geräten">
      <div className="flex justify-end">
        <Link to="/admin/areas/new" className="btn-primary"><Plus size={17} />Neuer Bereich</Link>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Bereiche" value={stats.total} />
        <Metric label="Geräte zugeordnet" value={stats.devices} tone="green" />
        <Metric label="Ausleihe aktiv" value={stats.lendable} tone="orange" />
        <Metric label="Fehler-E-Mails" value={stats.mail} tone="red" />
      </section>

      <section className="card overflow-hidden">
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">{error}</div>}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Bereich</th>
                <th className="p-4 text-left font-medium">Raum</th>
                <th className="p-4 text-left font-medium">Ausleihe</th>
                <th className="p-4 text-left font-medium">Fehler-Mail</th>
                <th className="p-4 text-left font-medium">E-Mail-Empfänger</th>
                <th className="p-4 text-left font-medium">Bearbeiter</th>
                <th className="p-4 text-left font-medium">Geräte</th>
                <th className="p-4 text-left font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => (
                <tr key={area.id} className="table-row">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-100">
                        <FolderTree size={19} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{area.name}</div>
                        {area.description && <div className="max-w-xs truncate text-xs text-gray-500">{area.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-gray-600">{area.room?.name || '-'}</td>
                  <td className="p-4"><Badge active={area.lendEnabled} yes="Aktiv" no="Gesperrt" /></td>
                  <td className="p-4"><Badge active={area.issueMailEnabled} yes="An" no="Aus" /></td>
                  <td className="p-4 text-gray-600">
                    <div className="flex items-center gap-1.5"><Users size={14} className="text-gray-400" />{area.memberCount || 0}</div>
                    {area.memberCount > 0 && (
                      <div className="mt-0.5 max-w-[12rem] truncate text-xs text-gray-500">
                        {(area.members || []).map((member) => member.user?.displayName || member.user?.username).filter(Boolean).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-gray-600">
                    <div className="flex items-center gap-1.5"><PencilLine size={14} className="text-gray-400" />{area.editorCount || 0}</div>
                    {area.editorCount > 0 && (
                      <div className="mt-0.5 max-w-[12rem] truncate text-xs text-gray-500">
                        {(area.editors || []).map((editor) => editor.user?.displayName || editor.user?.username).filter(Boolean).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="p-4 font-semibold text-gray-800">
                    {area.deviceCount || 0}
                    {area.freeCount !== undefined && <span className="ml-1 text-xs font-normal text-gray-500">({area.freeCount} frei)</span>}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-3">
                      <Link
                        className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                        to={`/admin/areas/${encodeURIComponent(area.id)}`}
                      >
                        Öffnen <ExternalLink size={13} />
                      </Link>
                      <button className="font-medium text-red-600 hover:underline" onClick={() => deleteArea(area)}>Löschen</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!areas.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="8">Noch keine Bereiche angelegt.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobil: Kartenliste */}
        <div className="divide-y divide-black/5 md:hidden">
          {areas.map((area) => (
            <div key={area.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-100">
                  <FolderTree size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-800 dark:text-gray-100">{area.name}</div>
                  <div className="text-xs text-gray-500">
                    {area.room?.name || 'Ohne Raum'} · {area.deviceCount || 0} Geräte · {area.memberCount || 0} Empfänger · {area.editorCount || 0} Bearbeiter
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Link className="btn-secondary min-h-11 flex-1 justify-center" to={`/admin/areas/${encodeURIComponent(area.id)}`}>Öffnen</Link>
                <button className="btn-secondary min-h-11 flex-1 justify-center text-red-600" onClick={() => deleteArea(area)}>Löschen</button>
              </div>
            </div>
          ))}
          {!areas.length && <div className="p-5 text-sm text-gray-500">Noch keine Bereiche angelegt.</div>}
        </div>
      </section>
    </AdminPage>
  );
}

function Badge({ active, yes, no }) {
  return (
    <span className={`badge ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
      {active ? yes : no}
    </span>
  );
}

function Metric({ label, value, tone = 'purple' }) {
  const tones = {
    purple: 'text-gray-800 dark:text-gray-200',
    green: 'text-green-600 dark:text-green-400',
    orange: 'text-orange-500 dark:text-orange-400',
    red: 'text-red-500 dark:text-red-400'
  };
  return (
    <div className="card p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}