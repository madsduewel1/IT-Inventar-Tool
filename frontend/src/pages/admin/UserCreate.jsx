import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage } from './Users';

export default function UserCreate() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'VIEWER' });

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/users', form);
      navigate('/admin/users');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Benutzer konnte nicht angelegt werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title="Benutzer anlegen" subtitle="Konto und Startrolle erstellen">
      <form onSubmit={submit} className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/admin/users" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-main"><ArrowLeft size={16} />Zurück zur Benutzerliste</Link>
          <button className="btn-primary w-full sm:w-auto" disabled={saving}><Save size={17} />{saving ? 'Speichert...' : 'Benutzer speichern'}</button>
        </div>

        {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

        <section className="card p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field required label="Benutzername" value={form.username} onChange={(value) => setValue('username', value)} />
            <Field required label="E-Mail" type="email" value={form.email} onChange={(value) => setValue('email', value)} />
            <Field required label="Passwort" type="password" value={form.password} onChange={(value) => setValue('password', value)} />
            <label className="text-sm font-medium text-gray-700">Rolle
              <select className="field mt-1" value={form.role} onChange={(event) => setValue('role', event.target.value)}>
                <option value="VIEWER">Benutzer</option>
                <option value="STAFF">IT</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </label>
          </div>
        </section>
      </form>
    </AdminPage>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return <label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}<input className="field mt-1" required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
