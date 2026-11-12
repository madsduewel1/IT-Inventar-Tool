import { useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CloudUpload, FileType, Loader2 } from 'lucide-react';
import { parseCSV } from './csvParser';

export default function StepUpload({ onParsed, onBack }) {
  const inputRef  = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleFile(file) {
    setError('');
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Nur .csv-Dateien sind erlaubt.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Datei zu groß. Maximum: 2 MB.');
      return;
    }

    setLoading(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length > 500) {
        setError('Maximal 500 Zeilen pro Import erlaubt.');
        setLoading(false);
        return;
      }
      onParsed(rows, file.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="csv-upload">
      <div
        className={`csv-upload-zone${dragging ? ' dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <div className="csv-upload-zone-icon">
          {loading
            ? <Loader2 className="csv-spin" size={42} />
            : <CloudUpload size={42} />
          }
        </div>
        <p className="csv-upload-zone-title">
          {loading ? 'Datei wird verarbeitet...' : 'CSV-Datei hierher ziehen'}
        </p>
        <span className="csv-upload-zone-hint">
          {loading ? '' : 'oder klicken zum Auswählen'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {error && (
        <div className="csv-upload-error">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="csv-modal-footer">
        <button type="button" className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={17} /> Zurück
        </button>
        <span className="csv-upload-hint-small">
          <FileType size={15} /> .csv · max. 2 MB · max. 500 Zeilen
        </span>
      </div>
    </div>
  );
}
