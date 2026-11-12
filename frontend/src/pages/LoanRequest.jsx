import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Send, Users } from 'lucide-react';
import { api } from '../api/client';

/**
 * Ausleihe anfragen (Konzept Abschnitt 12/14): Statt eines konkreten Assets
 * wird ein Gerätebereich gewählt – die IT weist bei der Freigabe ein Gerät aus
 * diesem Bereich zu. Ein Wunschmodell ist optional.
 */
export default function LoanRequest() {
  const navigate = useNavigate();
  const [areas, setAreas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    areaId: '',
    requestedModel: '',
    startDate: '',
    dueDate: '',
    requestReason: '',
    notes: ''
  });

  useEffect(() => {
    api.get('/areas', { params: { lendable: 'true' } })
      .then(({ data }) => setAreas((data.areas || []).filter((area) => area.lendEnabled)))
      .catch(() => setAreas([]));
  }, []);

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  }

  const selectedArea = useMemo(() => areas.find((area) => area.id === form.areaId) || null, [areas, form.areaId]);
  const areaHint = selectedArea
    ? selectedArea.freeCount > 0
      ? `${selectedArea.freeCount} von ${selectedArea.lendableCount} Geräten aktuell frei`
      : 'Aktuell ist kein Gerät frei – die IT meldet sich.'
    : null;

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/loans/request', {
        ...form,
        areaId: form.areaId || null,
        requestedModel: form.requestedModel.trim() || null
      });
      navigate('/loans/my');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Anfrage konnte nicht gesendet werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link to="/loans/my" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-200"><ArrowLeft size={16} />Zurück zu meinen Ausleihen</Link>
          <h1 className="text-2xl font-bold text-gray-800">Ausleihe anfragen</h1>
          <p className="mt-1 text-sm text-gray-500">Wähle einen Bereich, Zeitraum und Grund – die IT weist das Gerät zu.</p>
        </div>
        <button className="btn-primary" disabled={saving}><Send size={17} />{saving ? 'Sendet...' : 'Anfrage senden'}</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <Header title="Bereich und Gerätetyp" text="Wähle den Bereich, aus dem du ein Gerät benötigst." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 block">Bereich <span className="text-red-500">*</span>
            <select className="field mt-1" required value={form.areaId} onChange={(event) => setValue('areaId', event.target.value)}>
              <option value="">Bereich wählen</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}{area.freeCount !== undefined ? ` (${area.freeCount} frei)` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 block">Wunschmodell (optional)
            <input
              className="field mt-1"
              value={form.requestedModel}
              onChange={(event) => setValue('requestedModel', event.target.value)}
              placeholder="z. B. Lenovo ThinkPad, iPad"
            />
          </label>
          {areaHint && (
            <p className="flex items-center gap-2 text-xs text-gray-500 md:col-span-2">
              {selectedArea.freeCount > 0
                ? <CheckCircle2 size={14} className="text-emerald-500" />
                : <Users size={14} className="text-amber-500" />}
              {areaHint}
            </p>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Zeitraum" text="Gib an, ab wann und bis wann du das Gerät brauchst." />
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <Field required label="Startdatum" type="date" value={form.startDate} onChange={(value) => setValue('startDate', value)} />
          <Field required label="Rückgabe bis" type="date" value={form.dueDate} onChange={(value) => setValue('dueDate', value)} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <Header title="Grund" text="Beschreibe kurz, wofür du das Gerät benötigst." />
        <div className="grid gap-3 p-5">
          <label className="text-sm font-medium text-gray-700">Grund der Anfrage <span className="text-red-500">*</span>
            <textarea className="field mt-1" required rows="5" value={form.requestReason} onChange={(event) => setValue('requestReason', event.target.value)} />
          </label>
          <label className="text-sm font-medium text-gray-700">Zusätzliche Hinweise
            <textarea className="field mt-1" rows="4" value={form.notes} onChange={(event) => setValue('notes', event.target.value)} />
          </label>
        </div>
      </section>
    </form>
  );
}

function Header({ title, text }) {
  return <div className="border-b border-black/5 p-5"><div className="font-semibold text-gray-800">{title}</div><div className="mt-1 text-sm text-gray-500">{text}</div></div>;
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return <label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}<input className="field mt-1" required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
