import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FolderTree, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { PageLoader } from '../../components/Loading';
import { useConfirm } from '../../components/ConfirmDialog';
import StatusPill from '../../components/StatusPill';
import AreaForm from '../../components/AreaForm';
import { AdminPage } from './Users';

/**
 * Bereichs-Detailseite (/admin/areas/:id): Sämtliche Einstellungen des
 * Bereichs (Stammdaten, Ausleihe, E-Mail-Empfänger und Bearbeiter) sowie die
 * zugeordneten Geräte und das Löschen des Bereichs.
 */
export default function AreaDetail() {
  const { id } = useParams();
  const confirm = useConfirm();
  const [area, setArea] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function loadArea() {
    return api.get(`/areas/${encodeURIComponent(id)}`)
      .then(({ data }) => setArea(data.area));
  }

  useEffect(() => {
    Promise.all([
      loadArea(),
      api.get('/rooms').catch(() => ({ data: { rooms: [] } })),
      api.get('/users/list').catch(() => ({ data: { users: [] } }))
    ])
      .then(([, roomsResult, usersResult]) => {
        const staff = (usersResult.data.users || []).filter((user) => ['STAFF', 'ADMIN'].includes(user.role));
        setRooms(roomsResult.data.rooms || []);
        setUsers(staff);
      })
      .catch(() => setError('Bereich konnte nicht geladen werden.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Formular aus dem geladenen Bereich initialisieren
  useEffect(() => {
    if (!area) return;
    setForm({
      name: area.name,
      description: area.description || '',
      roomId: area.roomId || '',
      lendEnabled: Boolean(area.lendEnabled),
      individualManagement: Boolean(area.individualManagement),
      issueMailEnabled: Boolean(area.issueMailEnabled),
      memberIds: (area.members || []).map((member) => member.user?.id).filter(Boolean),
      editorIds: (area.editors || []).map((editor) => editor.user?.id).filter(Boolean)
    });
  }, [area]);

  async function submit(event) {
    event.preventDefault();
    if (!area) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.patch(`/areas/${area.id}`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        roomId: form.roomId || null,
        lendEnabled: form.lendEnabled,
        individualManagement: form.individualManagement,
        issueMailEnabled: form.issueMailEnabled
      });
      await api.put(`/areas/${area.id}/members`, { userIds: form.memberIds });
      await api.put(`/areas/${area.id}/editors`, { userIds: form.editorIds });
      const { data } = await api.get(`/areas/${encodeURIComponent(area.id)}`);
      setArea(data.area);
      setNotice('Bereich gespeichert.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Bereich konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteArea() {
    const ok = await confirm({
      title: 'Bereich löschen',
      message: `Bereich „${area.name}“ wirklich löschen?`,
      tone: 'danger',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    setDeleteError('');
    try {
      await api.delete(`/areas/${area.id}`);
      window.location.href = '/admin/areas';
    } catch (requestError) {
      setDeleteError(requestError.response?.data?.error || 'Bereich konnte nicht gelöscht werden.');
    }
  }

  if (loading || !area || !form) return <PageLoader text="Bereich wird geladen…" />;

  return (
    <AdminPage
      title={area.name}
      subtitle={`${area.deviceCount || 0} Geräte · ${area.memberCount || 0} E-Mail-Empfänger · ${area.editorCount || 0} Bearbeiter`}
    >
      <div className="mx-auto max-w-5xl space-y-6">

      {deleteError && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{deleteError}</div>}
      {notice && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{notice}</div>}

      <AreaForm
        form={form}
        setForm={setForm}
        users={users}
        rooms={rooms}
        saving={saving}
        error={error}
        submitLabel="Speichern"
        onSubmit={submit}
      />

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <h2 className="text-sm font-medium text-gray-800 dark:text-zinc-200">Geräte im Bereich ({area.deviceCount || 0})</h2>
          <Link to="/devices" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Alle Geräte</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-gray-500">
              <tr>
                <th className="p-4 text-left font-medium">Inventarnummer</th>
                <th className="p-4 text-left font-medium">Bezeichnung</th>
                <th className="p-4 text-left font-medium">Status</th>
                <th className="p-4 text-left font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {(area.devices || []).map((device) => (
                <tr key={device.id} className="table-row">
                  <td className="p-4 font-mono text-gray-800">{device.inventoryId}</td>
                  <td className="p-4 text-gray-600">{device.model || '–'}</td>
                  <td className="p-4"><StatusPill status={device.status} /></td>
                  <td className="p-4">
                    <Link
                      to={`/devices?id=${encodeURIComponent(device.id)}`}
                      className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Öffnen <ExternalLink size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
              {!area.devices?.length && <tr className="table-row"><td className="p-6 text-gray-500" colSpan="4">Noch keine Geräte zugeordnet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </AdminPage>
  );
}