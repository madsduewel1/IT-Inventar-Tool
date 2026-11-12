import { useEffect, useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { api } from '../api/client';

// Fußzeile für die Dashboards: weist auf die Support-Kontaktmöglichkeit hin.
// Text und E-Mail-Adresse werden unter Administration -> System -> Support
// in den Einstellungen hinterlegt. Ohne hinterlegte Adresse bleibt die
// Fußzeile komplett unsichtbar.
export function SupportFooter() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let ignore = false;
    api.get('/settings/public')
      .then(({ data }) => {
        if (!ignore) setSettings(data.settings || {});
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  const email = (settings?.['support.email'] || '').trim();
  const note = (settings?.['support.text'] || '').trim();
  if (!email && !note) return null;

  return (
    <div className="mt-8 flex flex-col items-center gap-1.5 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-4 text-center text-xs text-on-surface-variant">
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
        <MessageSquareWarning size={15} className="text-badge-orange" />
        <span>Fehler aufgefallen?</span>
        {email && (
          <>
            <span>Melde ihn bitte bei</span>
            <a href={`mailto:${email}`} className="font-semibold text-primary underline hover:no-underline">{email}</a>
          </>
        )}
      </p>
      {note && <p className="max-w-2xl text-on-surface-variant/80">{note}</p>}
    </div>
  );
}
