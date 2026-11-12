import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Info, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { Spinner } from '../components/Loading';

export default function DeviceUpdateCreate() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const [location, setLocation] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [targetType, setTargetType] = useState('global');
  const [selectedRoomIds, setSelectedRoomIds] = useState([]);

  useEffect(() => {
    api.get('/rooms')
      .then(res => setRooms(res.data.rooms || []))
      .catch(() => setError('Räume konnten nicht geladen werden.'))
      .finally(() => setLoading(false));

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setDateTime(now.toISOString().slice(0, 16));
  }, []);

  function handleRoomToggle(roomId) {
    setSelectedRoomIds(prev => 
      prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]
    );
  }

  async function handleCreateUpdate(e) {
    e.preventDefault();
    if (!location.trim()) {
      alert('Bitte geben Sie einen Ort an.');
      return;
    }
    if (targetType === 'rooms' && selectedRoomIds.length === 0) {
      alert('Bitte wählen Sie mindestens einen Raum aus.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        location: location.trim(),
        dateTime: dateTime ? new Date(dateTime).toISOString() : new Date().toISOString(),
        roomIds: targetType === 'rooms' ? selectedRoomIds : []
      };

      const { data } = await api.post('/updates', payload);
      navigate(`/updates?id=${data.id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Update-Lauf konnte nicht gestartet werden.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400">
          <ClipboardCheck size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-zinc-100">Neuen Update-Lauf anlegen</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Planen Sie ein neues Update für Geräte.</p>
        </div>
      </div>

      <div className="card">
        {error && <div className="border-b border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
        <form onSubmit={handleCreateUpdate}>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Ort des Updates (z.B. Raumname oder Gebäude) <span className="text-red-500">*</span></label>
              <input 
                type="text" 
                required
                placeholder="z.B. Computerraum 1, Lehrerzimmer"
                className="field"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Datum &amp; Uhrzeit <span className="text-red-500">*</span></label>
              <input 
                type="datetime-local" 
                required
                className="field"
                value={dateTime}
                onChange={e => setDateTime(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">Zielgruppe der Geräte</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={`p-4 text-left rounded-xl border text-sm transition ${
                    targetType === 'global' 
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 font-semibold' 
                      : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                  }`}
                  onClick={() => setTargetType('global')}
                >
                  <div className="font-semibold">Alle Geräte</div>
                  <div className={`text-xs mt-0.5 font-normal ${targetType === 'global' ? 'text-blue-600/70 dark:text-blue-400/70' : 'text-gray-500 dark:text-zinc-500'}`}>Alle updateberechtigten Geräte einbeziehen.</div>
                </button>
                <button
                  type="button"
                  className={`p-4 text-left rounded-xl border text-sm transition ${
                    targetType === 'rooms' 
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 font-semibold' 
                      : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                  }`}
                  onClick={() => setTargetType('rooms')}
                >
                  <div className="font-semibold">Räume wählen</div>
                  <div className={`text-xs mt-0.5 font-normal ${targetType === 'rooms' ? 'text-blue-600/70 dark:text-blue-400/70' : 'text-gray-500 dark:text-zinc-500'}`}>Nur Geräte in ausgewählten Räumen aktualisieren.</div>
                </button>
              </div>
            </div>

            {targetType === 'rooms' && (
              <div className="border border-black/10 dark:border-white/10 rounded-xl p-4 bg-gray-50 dark:bg-zinc-800/50 max-h-60 overflow-y-auto space-y-2">
                <div className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">Räume auswählen</div>
                {loading ? (
                   <div className="flex items-center gap-2 text-xs text-gray-500"><Spinner size={16} />Lade Räume…</div>
                ) : rooms.map(room => (
                  <label key={room.id} className="flex items-center gap-3 text-sm text-gray-700 dark:text-zinc-300 cursor-pointer py-1">
                    <input 
                      type="checkbox"
                      className="rounded border-gray-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 dark:bg-zinc-700 h-4 w-4"
                      checked={selectedRoomIds.includes(room.id)}
                      onChange={() => handleRoomToggle(room.id)}
                    />
                    <span>{room.name} <span className="text-gray-400 dark:text-zinc-500 text-xs ml-1">({room.devices?.length || 0} Geräte)</span></span>
                  </label>
                ))}
                {!loading && rooms.length === 0 && (
                  <div className="text-xs text-gray-500 dark:text-zinc-500 text-center py-2">Keine Räume angelegt.</div>
                )}
              </div>
            )}
            
            <div className="flex items-start gap-2 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-400">
              <Info size={18} className="shrink-0 mt-0.5" />
              <p>
                Bei der Erstellung werden alle berechtigten Geräte des gewählten Bereichs diesem Update-Lauf zugeordnet. Der Standardstatus ist initial <strong className="font-semibold">Erfolgreich</strong>. Fehler können im Anschluss markiert werden.
              </p>
            </div>
          </div>

          <div className="bg-[#fafafa] dark:bg-zinc-900/50 border-t border-black/5 dark:border-white/10 p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:p-6 sm:gap-3">
            <button 
              type="button" 
              onClick={() => navigate('/updates')}
              className="btn-secondary w-full sm:w-auto"
              disabled={submitting}
            >
              Abbrechen
            </button>
            <button 
              type="submit"
              className="btn-primary w-full sm:w-auto"
              disabled={submitting}
            >
              {submitting && <Loader2 className="animate-spin" size={16} />}
              Update-Lauf starten
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
