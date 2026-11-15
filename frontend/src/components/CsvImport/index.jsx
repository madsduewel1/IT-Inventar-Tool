import { useState } from 'react';
import { Check, Table2, X } from 'lucide-react';
import { validateRows } from './csvValidator';
import StepWelcome from './StepWelcome';
import StepUpload from './StepUpload';
import StepReview from './StepReview';
import StepImportProgress from './StepImportProgress';

const STEPS = ['welcome', 'upload', 'review', 'importing'];

const STEP_TITLES = {
  welcome: 'CSV Import / Export',
  upload: 'Datei hochladen',
  review: 'Import vorbereiten',
  importing: 'Live-Import',
};

export function CsvImportModal({ onClose, existingInventoryIds = [] }) {
  const [step, setStep] = useState('welcome');
  const [validated, setValidated] = useState([]);
  const [fileName, setFileName] = useState('');

  function handleFileParsed(rows, name) {
    setFileName(name);
    const result = validateRows(rows, existingInventoryIds);
    setValidated(result);
    setStep('review');
  }

  function handleReset() {
    setValidated([]);
    setFileName('');
    setStep('welcome');
  }

  const activeIndex = Math.max(0, STEPS.indexOf(step) - 1);

  return (
    <div className="csv-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="csv-modal" role="dialog" aria-modal="true" aria-label="CSV Import">

        <div className="csv-modal-header">
          <div className="csv-modal-header-left">
            <Table2 className="csv-modal-header-icon" size={18} />
            <span className="csv-modal-header-title">{STEP_TITLES[step]}</span>
            {fileName && ['review', 'importing'].includes(step) && (
              <span className="csv-modal-header-file">· {fileName}</span>
            )}
          </div>
          <button type="button" className="csv-modal-close" onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        {['upload', 'review', 'importing'].includes(step) && (
          <div className="csv-progress">
            {['Hochladen', 'Prüfen', 'Importieren'].map((label, i) => (
              <div key={label} className={`csv-progress-step${i < activeIndex ? ' done' : i === activeIndex ? ' active' : ''}`}>
                <div className="csv-progress-dot">{i < activeIndex ? <Check size={12} /> : i + 1}</div>
                <span>{label}</span>
                {i < 2 && <div className="csv-progress-line" />}
              </div>
            ))}
          </div>
        )}

        <div className="csv-modal-body">
          {step === 'welcome' && <StepWelcome onImport={() => setStep('upload')} />}
          {step === 'upload' && <StepUpload onParsed={handleFileParsed} onBack={() => setStep('welcome')} />}
          {step === 'review' && (
            <StepReview
              rows={validated}
              onConfirm={() => setStep('importing')}
              onBack={() => setStep('upload')}
            />
          )}
          {step === 'importing' && (
            <StepImportProgress
              rows={validated}
              onClose={onClose}
              onReset={handleReset}
            />
          )}
        </div>
      </div>
    </div>
  );
}
