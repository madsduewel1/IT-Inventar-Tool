import { CheckCircle2, List, Repeat } from 'lucide-react';

export default function StepDone({ count, onClose, onReset }) {
  return (
    <div className="csv-done">
      <div className="csv-done-icon">
        <CheckCircle2 size={56} />
      </div>
      <h2 className="csv-done-title">
        {count} {count === 1 ? 'Gerät' : 'Geräte'} erfolgreich importiert
      </h2>
      <p className="csv-done-sub">
        {count === 1
          ? 'Das Gerät wurde dem Inventar hinzugefügt und ist ab sofort in der Geräteliste sichtbar.'
          : 'Die Geräte wurden dem Inventar hinzugefügt und sind ab sofort in der Geräteliste sichtbar.'
        }
      </p>
      <div className="csv-done-actions">
        <button type="button" className="btn-secondary" onClick={onReset}>
          <Repeat size={17} /> Weiteren Import
        </button>
        <button type="button" className="btn-primary" onClick={onClose}>
          <List size={17} /> Zur Geräteliste
        </button>
      </div>
    </div>
  );
}
