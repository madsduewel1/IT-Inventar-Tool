import { useState } from 'react';
import { AlertCircle, Check, Table2, X } from 'lucide-react';
import { validateRows } from './csvValidator';
import StepWelcome from './StepWelcome';
import StepUpload  from './StepUpload';
import StepReview  from './StepReview';
import StepDone    from './StepDone';

const STEPS = ['welcome', 'upload', 'review', 'done'];

const STEP_TITLES = {
  welcome: 'CSV Import / Export',
  upload:  'Datei hochladen',
  review:  'Vorschau & Bestätigen',
  done:    'Import abgeschlossen',
};

export function CsvImportModal({ onClose, onImport, existingInventoryIds = [] }) {
  const [step,       setStep]       = useState('welcome');
  const [parsedRows, setParsedRows] = useState([]);
  const [validated,  setValidated]  = useState([]);
  const [fileName,   setFileName]   = useState('');
  const [importing,  setImporting]  = useState(false);
  const [importErr,  setImportErr]  = useState('');
  const [doneCount,  setDoneCount]  = useState(0);

  function handleFileParsed(rows, name) {
    setParsedRows(rows);
    setFileName(name);
    const result = validateRows(rows, existingInventoryIds);
    setValidated(result);
    setStep('review');
  }

  async function handleConfirm() {
    const validRows = validated.filter(r => r._status !== 'error');
    setImporting(true);
    setImportErr('');
    try {
      const result = await onImport(validRows);
      setDoneCount(result?.imported ?? validRows.length);
      setStep('done');
    } catch (err) {
      setImportErr(err?.response?.data?.error || err.message || 'Import fehlgeschlagen.');
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setParsedRows([]);
    setValidated([]);
    setFileName('');
    setImportErr('');
    setStep('welcome');
  }

  // Schritt-Index für Progress-Bar
  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="csv-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="csv-modal" role="dialog" aria-modal="true" aria-label="CSV Import">

        {/* Header */}
        <div className="csv-modal-header">
          <div className="csv-modal-header-left">
            <Table2 className="csv-modal-header-icon" size={18} />
            <span className="csv-modal-header-title">{STEP_TITLES[step]}</span>
            {fileName && step === 'review' && (
              <span className="csv-modal-header-file">· {fileName}</span>
            )}
          </div>
          <button type="button" className="csv-modal-close" onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        {/* Fortschritts-Indikatoren (nur bei upload/review) */}
        {(step === 'upload' || step === 'review') && (
          <div className="csv-progress">
            {['Hochladen', 'Prüfen', 'Importieren'].map((label, i) => (
              <div key={label} className={`csv-progress-step${i < stepIdx ? ' done' : i === stepIdx - 1 ? ' active' : ''}`}>
                <div className="csv-progress-dot">{i < stepIdx - 1 ? <Check size={12} /> : i + 1}</div>
                <span>{label}</span>
                {i < 2 && <div className="csv-progress-line" />}
              </div>
            ))}
          </div>
        )}

        {/* Fehler-Banner */}
        {importErr && (
          <div className="csv-import-err">
            <AlertCircle size={16} /> {importErr}
          </div>
        )}

        {/* Body */}
        <div className="csv-modal-body">
          {step === 'welcome' && <StepWelcome onUpload={() => setStep('upload')} />}
          {step === 'upload'  && <StepUpload  onParsed={handleFileParsed} onBack={() => setStep('welcome')} />}
          {step === 'review'  && (
            <StepReview
              rows={validated}
              fileName={fileName}
              onConfirm={handleConfirm}
              onBack={() => setStep('upload')}
              importing={importing}
            />
          )}
          {step === 'done' && <StepDone count={doneCount} onClose={onClose} onReset={handleReset} />}
        </div>
      </div>
    </div>
  );
}
