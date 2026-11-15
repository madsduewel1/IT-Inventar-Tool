import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Table2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { validateRows } from '../components/CsvImport/csvValidator';

import StepWelcome from '../components/CsvImport/StepWelcome';
import StepUpload from '../components/CsvImport/StepUpload';
import StepReview from '../components/CsvImport/StepReview';
import StepImportProgress from '../components/CsvImport/StepImportProgress';
import StepExport from '../components/CsvImport/StepExport';

const STEP_TITLES = {
  menu: 'Import / Export',
  upload: 'Datei hochladen',
  review: 'Import vorbereiten',
  importing: 'Live-Import',
  export: 'CSV exportieren',
};

export default function DevicesImport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canImport = (user?.effectivePermissions || []).includes('DEVICE_CREATE');
  const [devices, setDevices] = useState([]);
  const [step, setStep] = useState('menu');
  const [validated, setValidated] = useState([]);
  const [fileName, setFileName] = useState('');

  const loadDevices = useCallback(async () => {
    const { data } = await api.get('/devices');
    const nextDevices = data.devices || [];
    setDevices(nextDevices);
    return nextDevices;
  }, []);

  useEffect(() => {
    loadDevices().catch(() => {});
  }, [loadDevices]);

  function handleFileParsed(rows, name) {
    setFileName(name);
    const existingDevices = devices.map((device) => ({ id: device.id, inventoryId: device.inventoryId }));
    setValidated(validateRows(rows, existingDevices));
    setStep('review');
  }

  function handleReset() {
    setValidated([]);
    setFileName('');
    setStep('menu');
  }

  async function closeAfterImport() {
    await loadDevices().catch(() => {});
    navigate('/devices');
  }

  async function resetAfterImport() {
    await loadDevices().catch(() => {});
    handleReset();
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <Link to="/devices" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-main">
          <ArrowLeft size={16} />
          Zurück zur Liste
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">Import / Export</h1>
        <p className="mt-1 text-sm text-gray-500">
          Assets per CSV importieren oder mit frei wählbaren Spalten exportieren.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-black/5 bg-[#fafafa] dark:bg-zinc-900/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-800 dark:text-zinc-200">
            <Table2 size={20} className="text-blue-500" />
            <span className="font-semibold">{STEP_TITLES[step]}</span>
            {fileName && ['review', 'importing'].includes(step) && <span className="text-xs text-muted">· {fileName}</span>}
          </div>

          {['upload', 'review', 'importing'].includes(step) && (
            <div className="flex items-center gap-3">
              {['Hochladen', 'Prüfen', 'Importieren'].map((label, index) => {
                const activeIndex = step === 'upload' ? 0 : step === 'review' ? 1 : 2;
                return (
                  <div key={label} className={`flex items-center gap-1.5 text-xs ${index < activeIndex ? 'text-green-600 font-medium' : index === activeIndex ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                      index < activeIndex
                        ? 'bg-green-600 border-green-600 text-white'
                        : index === activeIndex
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300'
                    }`}>
                      {index < activeIndex ? <Check size={12} /> : index + 1}
                    </div>
                    <span>{label}</span>
                    {index < 2 && <span className="text-gray-300">/</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-1">
          {step === 'menu' && <StepWelcome canImport={canImport} onImport={() => setStep('upload')} onExport={() => setStep('export')} />}
          {step === 'upload' && <StepUpload onParsed={handleFileParsed} onBack={() => setStep('menu')} />}
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
              onClose={closeAfterImport}
              onReset={resetAfterImport}
            />
          )}
          {step === 'export' && <StepExport devices={devices} onBack={() => setStep('menu')} />}
        </div>
      </div>
    </div>
  );
}
