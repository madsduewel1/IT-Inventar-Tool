import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../api/client';
import { PageLoader } from '../../components/Loading';
import AreaForm from '../../components/AreaForm';
import { AdminPage } from './Users';

const EMPTY_FORM = {
  name: '',
  description: '',
  roomId: '',
  lendEnabled: true,
  individualManagement: true,
  issueMailEnabled: false,
  memberIds: [],
  editorIds: []
};

/**
 * Bereichsseite „Anlegen" (/admin/areas/new): Alle Bereichseinstellungen
 * inkl. E-Mail-Empfänger und Bearbeiter. Nach dem Anlegen geht es direkt zur
 * Detailseite weiter.
 */
export default function AreaCreate() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/rooms').catch(() => ({ data: { rooms: [] } })),
      api.get('/users/list').catch(() => ({ data: { users: [] } }))
    ])
      .then(([roomsResult, usersResult]) => {
        setRooms(roomsResult.data.rooms || []);
        setUsers((usersResult.data.users || []).filter((user) => ['STAFF', 'ADMIN'].includes(user.role)));
      })
      .finally(() => setLoading(false));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/areas', {
        name: form.name.trim(),
        description: form.description.trim() || null,
        roomId: form.roomId || null,
        lendEnabled: form.lendEnabled,
        individualManagement: form.individualManagement,
        issueMailEnabled: form.issueMailEnabled
      });
      const areaId = data.area.id;
      await api.put(`/areas/${areaId}/members`, { userIds: form.memberIds });
      await api.put(`/areas/${areaId}/editors`, { userIds: form.editorIds });
      navigate(`/admin/areas/${encodeURIComponent(areaId)}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Bereich konnte nicht angelegt werden.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader text="Bereiche werden geladen…" />;

  return (
    <AdminPage title="Neuer Bereich" subtitle="Name, Standort, Ausleihe, E-Mail-Empfänger und Bearbeiter festlegen">
      <div className="mx-auto max-w-3xl space-y-6">

      <AreaForm
        form={form}
        setForm={setForm}
        users={users}
        rooms={rooms}
        saving={saving}
        error={error}
        submitLabel="Bereich anlegen"
        onSubmit={submit}
      />
      </div>
    </AdminPage>
  );
}