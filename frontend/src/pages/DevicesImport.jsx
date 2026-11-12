import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Table2, Check, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { validateRows } from '../components/CsvImport/csvValidator';

import StepWelcome from '../components/CsvImport/StepWelcome';
import StepUpload  from '../components/CsvImport/StepUpload';
import StepReview  from '../components/CsvImport/StepReview';
import StepDone    from '../components/CsvImport/StepDone';

const STEPS = ['welcome', 'upload', 'review', 'done'];

const STEP_TITLES = {
  welcome: 'CSV Import / Export',
  upload:  'Datei hochladen',
  review:  'Vorschau & Bestätigen',
  done:    'Import abgeschlossen',
};

/**
 * Vollständige Seite für den CSV-Import von Geräten.
 */
export default function DevicesImport() {
  const navigate = useNavigate();

  const [existingDevices, setExistingDevices] = useState([]);
  const [step,       setStep]       = useState('welcome');
  const [parsedRows, setParsedRows] = useState([]);
  const [validated,  setValidated]  = useState([]);
  const [fileName,   setFileName]   = useState('');
  const [importing,  setImporting]  = useState(false);
  const [importErr,  setImportErr]  = useState('');
  const [doneCount,  setDoneCount]  = useState(0);

  useEffect(() => {
    api.get('/devices')
      .then(({ data }) => {
        setExistingDevices((data.devices || []).map(d => ({ id: d.id, inventoryId: d.inventoryId })));
      })
      .catch(() => {});
  }, []);

  function handleFileParsed(rows, name) {
    setParsedRows(rows);
    setFileName(name);
    const result = validateRows(rows, existingDevices);
    setValidated(result);
    setStep('review');
  }

  async function handleConfirm() {
    const validRows = validated.filter(r => r._status !== 'error');
    setImporting(true);
    setImportErr('');
    try {
      const { data } = await api.post('/devices/bulk', { devices: validRows });
      setDoneCount(data?.imported ?? validRows.length);
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

  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link to="/devices" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main">
          <ArrowLeft size={16} />
          Zurück zur Liste
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">CSV Importieren</h1>
        <p className="mt-1 text-sm text-gray-500">
          Assets im Batch hinzufügen, Räume zuweisen und Status festlegen.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-black/5 bg-[#fafafa] dark:bg-zinc-900/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-800 dark:text-zinc-200">
            <Table2 size={20} className="text-blue-500" />
            <span className="font-semibold">{STEP_TITLES[step]}</span>
            {fileName && step === 'review' && (
              <span className="text-xs text-muted">· {fileName}</span>
            )}
          </div>

          {(step === 'upload' || step === 'review') && (
            <div className="flex items-center gap-3">
              {['Hochladen', 'Prüfen', 'Importieren'].map((label, i) => (
                <div key={label} className={`flex items-center gap-1.5 text-xs ${i < stepIdx ? 'text-green-600 font-medium' : i === stepIdx - 1 ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                    i < stepIdx - 1
                      ? 'bg-green-600 border-green-600 text-white'
                      : i === stepIdx - 1
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-300'
                  }`}>
                    {i < stepIdx - 1 ? <Check size={12} /> : i + 1}
                  </div>
                  <span>{label}</span>
                  {i < 2 && <span className="text-gray-300">/</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {importErr && (
          <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900/50 px-5 py-3 text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={16} /> {importErr}
          </div>
        )}

        <div className="p-1">
          {step === 'welcome' && <StepWelcome onUpload={() => setStep('upload')} />}
          {step === 'upload'  && <StepUpload onParsed={handleFileParsed} onBack={() => setStep('welcome')} />}
          {step === 'review'  && (
            <StepReview
              rows={validated}
              fileName={fileName}
              onConfirm={handleConfirm}
              onBack={() => setStep('upload')}
              importing={importing}
            />
          )}
          {step === 'done' && <StepDone count={doneCount} onClose={() => navigate('/devices')} onReset={handleReset} />}
        </div>
      </div>
    </div>
  );
}
