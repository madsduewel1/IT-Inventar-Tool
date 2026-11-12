import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, CheckCircle2, XCircle, Loader2, Pencil, AlertCircle, CircleAlert } from 'lucide-react';
import { api } from '../api/client';
import { PageLoader } from '../components/Loading';
import Modal from '../components/Modal';

export default function DeviceUpdateDetail() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const [updateRun, setUpdateRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Die Problembeschreibung wird in einem Dialog bearbeitet, damit die
  // Ergebnisliste ruhig bleibt. null = Dialog geschlossen.
  const [reasonDialog, setReasonDialog] = useState(null);
  const [savingResultId, setSavingResultId] = useState(null);
  const [dialogError, setDialogError] = useState('');

  async function load() {
    try {
      setLoading(true);
      const { data } = await api.get(`/updates/${id}`);
      setUpdateRun(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Update-Protokoll konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function patchResultLocally(resultId, status, errorDetails) {
    setUpdateRun((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        results: prev.results.map((r) => (r.id === resultId ? { ...r, status, errorDetails } : r))
      };
    });
  }

  async function updateDeviceStatus(resultId, status, errorDetails) {
    setSavingResultId(resultId);
    try {
      await api.put(`/updates/${id}/results/${resultId}`, {
        status,
        errorDetails: status === 'FAILED' ? errorDetails : null
      });
      patchResultLocally(resultId, status, status === 'FAILED' ? errorDetails : null);
    } catch (err) {
      setError(err.response?.data?.error || 'Status konnte nicht gespeichert werden.');
      throw err;
    } finally {
      setSavingResultId(null);
    }
  }

  // "Erfolgreich" wird sofort übernommen, "Fehlgeschlagen" öffnet den Dialog,
  // weil zum Fehler immer eine Beschreibung dazugehört.
  function handleStatusClick(result, status) {
    if (savingResultId) return;
    setError('');
    if (status === 'SUCCESS') {
      updateDeviceStatus(result.id, 'SUCCESS', null).catch(() => {});
      return;
    }
    openReasonDialog(result);
  }

  function openReasonDialog(result) {
    setDialogError('');
    setReasonDialog({ resultId: result.id, value: result.errorDetails || '' });
  }

  async function saveReason() {
    if (!reasonDialog) return;
    const value = reasonDialog.value.trim();
    if (!value) {
      setDialogError('Bitte kurz beschreiben, was das Problem war.');
      return;
    }
    setDialogError('');
    try {
      await updateDeviceStatus(reasonDialog.resultId, 'FAILED', value);
      setReasonDialog(null);
    } catch {
      setDialogError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    }
  }

  if (loading && !updateRun) {
    return <PageLoader className="min-h-64" text="Lade Update-Details…" />;
  }

  if (error && !updateRun) {
    return (
      <div className="space-y-4">
        <Link to="/updates" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main">
          <ArrowLeft size={16} /> Zurück zur Liste
        </Link>
        <div className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">{error || 'Update-Protokoll nicht gefunden.'}</div>
      </div>
    );
  }

  const results = updateRun.results || [];
  const successCount = results.filter((r) => r.status === 'SUCCESS').length;
  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  const totalCount = results.length;
  const activeResult = reasonDialog ? results.find((r) => r.id === reasonDialog.resultId) : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Link to="/updates" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main">
            <ArrowLeft size={16} /> Zurück zur Liste
          </Link>
          <h1 className="text-2xl font-bold text-on-surface">Update-Protokoll</h1>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-on-surface-variant">
            <div className="flex items-center gap-1.5">
              <Calendar size={15} />
              <span>
                {new Date(updateRun.dateTime).toLocaleString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={15} />
              <span>{updateRun.location}</span>
            </div>
            {updateRun.rooms?.length > 0 && (
              <div className="text-outline">Räume: {updateRun.rooms.map((r) => r.name).join(', ')}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant p-3 rounded-2xl">
          <div className="text-right">
            <div className="text-xs text-on-surface-variant font-medium">Ergebnis</div>
            <div className="text-sm font-bold text-on-surface">
              {successCount} von {totalCount} erfolgreich
            </div>
          </div>
          <div className="h-8 w-px bg-outline-variant mx-1" />
          <span className={`inline-flex items-center justify-center h-6 px-2 rounded text-xs font-bold ${failedCount > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {failedCount} Fehler
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-badge-red px-4 py-3 text-sm font-medium text-text-badge-red">{error}</div>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-outline-variant bg-surface-container-low p-4 font-semibold text-on-surface flex flex-wrap justify-between items-center gap-2">
          <span>Einbezogene Geräte ({totalCount})</span>
          <span className="text-xs text-on-surface-variant font-normal">
            Auf „Fehlgeschlagen“ tippen, um die Problembeschreibung zu hinterlegen.
          </span>
        </div>

        <div className="divide-y divide-outline-variant">
          {results.map((result) => {
            const dev = result.device;
            const isSaving = savingResultId === result.id;
            const failed = result.status === 'FAILED';
            return (
              <div key={result.id} className="p-4 flex flex-col gap-3 transition-colors hover:bg-surface-container-low">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface font-bold text-xs">
                      {(dev.inventoryId || '?').slice(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <Link to={`/devices?id=${dev.id}`} className="font-bold text-on-surface hover:text-primary hover:underline inline-flex items-center gap-1">
                        {dev.inventoryId}
                      </Link>
                      <div className="text-xs text-on-surface-variant">
                        {[dev.manufacturer, dev.model].filter(Boolean).join(' ')}
                        {dev.room?.name ? ` • Raum: ${dev.room.name}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <StatusButton
                      active={!failed}
                      tone="success"
                      disabled={isSaving}
                      icon={CheckCircle2}
                      label="Erfolgreich"
                      onClick={() => handleStatusClick(result, 'SUCCESS')}
                    />
                    <StatusButton
                      active={failed}
                      tone="danger"
                      disabled={isSaving}
                      icon={XCircle}
                      label="Fehlgeschlagen"
                      onClick={() => handleStatusClick(result, 'FAILED')}
                    />
                    {failed && (
                      <button
                        type="button"
                        className="header-btn h-8 min-h-0 w-8 justify-center"
                        title="Problembeschreibung bearbeiten"
                        onClick={() => openReasonDialog(result)}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {isSaving && <Loader2 className="animate-spin text-gray-400" size={16} />}
                  </div>
                </div>

                {failed && (
                  <div className="sm:ml-13 border-l-2 border-red-300 pl-3 py-1 mt-1">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="text-red-500 shrink-0" size={14} />
                      <span className="text-xs font-bold text-red-700">Problembeschreibung</span>
                    </div>
                    <div className="text-sm text-on-surface">
                      {result.errorDetails || 'Noch keine Beschreibung hinterlegt.'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {results.length === 0 && (
            <div className="p-8 text-center text-on-surface-variant">Keine Geräte in diesem Update-Lauf.</div>
          )}
        </div>
      </section>

      <Modal
        open={Boolean(reasonDialog)}
        title="Fehler dokumentieren"
        subtitle={activeResult
          ? `${activeResult.device?.inventoryId || ''} ${[activeResult.device?.manufacturer, activeResult.device?.model].filter(Boolean).join(' ')}`.trim()
          : ''}
        onClose={() => setReasonDialog(null)}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
            <CircleAlert size={17} className="mt-0.5 shrink-0 text-red-500" />
            <span>Das Gerät wird als fehlgeschlagen markiert. Die Beschreibung erscheint direkt in der Ergebnisliste und wird mitgespeichert.</span>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-on-surface-variant" htmlFor="update-reason">Was war das Problem?</label>
            <textarea
              id="update-reason"
              className="field min-h-28 resize-y"
              autoFocus
              placeholder="z. B. Laptop hängt in der Bootschleife, BSOD nach Neustart …"
              value={reasonDialog?.value || ''}
              onChange={(event) => {
                setDialogError('');
                setReasonDialog((prev) => ({ ...prev, value: event.target.value }));
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') saveReason();
              }}
            />
            <div className="mt-1 text-xs text-outline">Tipp: Strg + Enter speichert direkt.</div>
          </div>

          {dialogError && <div className="rounded-lg bg-badge-red px-3 py-2 text-sm font-medium text-text-badge-red">{dialogError}</div>}

          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setReasonDialog(null)} disabled={savingResultId === reasonDialog?.resultId}>
              Abbrechen
            </button>
            <button type="button" className="btn-primary" onClick={saveReason} disabled={savingResultId === reasonDialog?.resultId}>
              {savingResultId === reasonDialog?.resultId ? 'Speichert…' : 'Als fehlgeschlagen speichern'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Status-Schaltfläche. Der inaktive Zustand nutzt bewusst die Theme-Farben des
// Panels statt eines festen Weißtons – sonst wirkt die Zeile beim Überfahren
// ausgegraut und die Schaltfläche deaktiviert.
function StatusButton({ active, tone, disabled, icon: Icon, label, onClick }) {
  const activeClass = tone === 'danger'
    ? 'bg-badge-red text-text-badge-red border-transparent'
    : 'bg-badge-green text-text-badge-green border-transparent';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
        active
          ? activeClass
          : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
      }`}
    >
      <Icon size={14} className={active ? '' : 'opacity-70'} />
      <span>{label}</span>
    </button>
  );
}