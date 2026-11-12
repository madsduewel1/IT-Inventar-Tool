import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../components/ConfirmDialog';
import { PageLoader } from '../components/Loading';

export default function RoomEdit() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', building: '', description: '' });

  useEffect(() => {
    api.get(`/rooms/${id}`)
      .then(({ data }) => {
        const room = data.room;
        setForm({
          name: room.name || '',
          building: room.building || '',
          description: room.description || ''
        });
      })
      .catch(() => setError('Raum konnte nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [id]);

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/rooms/${id}`, form);
      navigate('/rooms');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Raum konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoom() {
    const ok = await confirm({
      title: 'Raum löschen',
      message: 'Raum unwiderruflich löschen? Verknüpfte Geräte verlieren ihren Standort.',
      tone: 'danger',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    try {
      await api.delete(`/rooms/${id}`);
      navigate('/rooms', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Raum konnte nicht gelöscht werden.');
    }
  }

  if (loading) return <PageLoader className="min-h-48" text="Lade Raum…" />;

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to="/rooms" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main"><ArrowLeft size={16} />Zurück zu Räumen</Link>
          <h1 className="text-2xl font-bold text-gray-800">Raum bearbeiten</h1>
          <p className="mt-1 text-sm text-gray-500">Standort, Gebäudeteil und Beschreibung aktualisieren.</p>
        </div>
        <button className="btn-primary" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}{saving ? 'Speichert...' : 'Änderungen speichern'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field required label="Name" value={form.name} onChange={(value) => setValue('name', value)} />
          <Field label="Gebäude" value={form.building} onChange={(value) => setValue('building', value)} />
          <label className="text-sm font-medium text-gray-700 md:col-span-2">Beschreibung
            <textarea className="field mt-1" rows="6" value={form.description} onChange={(event) => setValue('description', event.target.value)} />
          </label>
        </div>
      </section>

      {((user?.effectiveRole || user?.role) === 'ADMIN' || user?.effectivePermissions?.includes('ROOM_DELETE')) && (
        <div className="pt-4 mt-8 border-t border-red-100 flex justify-end">
          <button type="button" onClick={deleteRoom} className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 w-full md:w-auto">
            Raum endgültig löschen
          </button>
        </div>
      )}
    </form>
  );
}

function Field({ label, value, onChange, required = false }) {
  return <label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}<input className="field mt-1" required={required} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
