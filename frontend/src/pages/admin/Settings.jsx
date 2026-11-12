import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, ExternalLink, Frame, KeyRound, LifeBuoy, Mail, MessageSquareWarning, Monitor, Save, ShieldCheck, SlidersHorizontal, Tag, UsersRound, Upload, Grid, FileText, Layers, Image } from 'lucide-react';
import { api } from '../../api/client';
import { AdminPage } from './Users';
import { AssetLabel, normalizeLabelSettings } from '../../components/AssetLabel';

const defaults = {
  'org.name': '',
  'org.email': '',
  'org.logo': '',
  'org.favicon': '',
  'label.logo': '',
  'label.widthMm': '70',
  'label.heightMm': '35',
  'label.marginTopMm': '0',
  'label.marginBottomMm': '0',
  'label.marginLeftMm': '0',
  'label.marginRightMm': '0',
  'app.url': '',
  'app.locale': 'de',
  'ui.defaultView': 'list',
  'loans.defaultDueDays': '14',
  'notifications.overdueEnabled': 'true',
  'sso.enabled': 'false',
  'sso.promoteSso': 'false',
  'sso.provider': 'oidc',
  'sso.clientId': '',
  'sso.clientSecret': '',
  'sso.issuerUrl': '',
  'sso.redirectUri': `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/api/auth/sso/callback`,
  'sso.buttonLabel': 'Mit SSO anmelden',
  'sso.force': 'false',
  'sso.groupSource': 'claim',
  'sso.adminApiUrl': '',
  'sso.adminApiToken': '',
  'sso.groupClaim': 'groups',
  'sso.availableGroups': '[]',
  'sso.groupMappings': '[]',
  'login.infoText': '',
  'mail.smtp.fromName': '',
  'mail.inboundAutoReply': 'true',
  'mail.signature': '',
  'customModule.enabled': 'false',
  'customModule.label': '',
  'customModule.url': '',
  'embed.allowedOrigins': '',
  'embed.hideHeader': 'false',
  'support.email': '',
  'support.text': ''
};

const sections = [
  { id: 'general', label: 'Organisation', icon: Building2 },
  { id: 'usage', label: 'Bedienung', icon: SlidersHorizontal },
  { id: 'labels', label: 'Labeldruck', icon: Tag },
  { id: 'mail', label: 'Mail', icon: Mail },
  { id: 'sso', label: 'SSO', icon: KeyRound },
  { id: 'roles', label: 'Rechte & Gruppen', icon: ShieldCheck },
  { id: 'embed', label: 'Einbettung', icon: Frame },
  { id: 'system', label: 'Systemübersicht', icon: Monitor },
  { id: 'support', label: 'Support', icon: LifeBuoy }
];

export default function Settings() {
  const params = useParams();
  const navigate = useNavigate();
  const activeSection = sections.some((entry) => entry.id === params.section) ? params.section : 'general';
  const [settings, setSettings] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [labelPreviewTab, setLabelPreviewTab] = useState('single');

  function handleImageUpload(e, key, maxWidth, maxHeight) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Ziel zurücksetzen, damit dieselbe Datei direkt erneut gewählt werden kann.
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (event) => {
      // window.Image ist zwingend: `Image` ist in dieser Datei das lucide-Icon.
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/png');
        setValue(key, dataUrl);
      };
      img.onerror = () => setError('Die Datei konnte nicht als Bild gelesen werden. Bitte eine PNG-, JPG- oder SVG-Datei wählen.');
      img.src = event.target.result;
    };
    reader.onerror = () => setError('Die Datei konnte nicht gelesen werden.');
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    api.get('/settings')
      .then(({ data }) => setSettings({ ...defaults, ...(data.settings || {}) }))
      .catch(() => setError('Einstellungen konnten nicht geladen werden.'));
  }, []);

  const availableGroups = useMemo(() => parseJson(settings['sso.availableGroups'], []), [settings]);

  function setValue(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    try {
      const { data } = await api.patch('/settings', settings);
      setSettings({ ...defaults, ...(data.settings || {}) });
      setSaved(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Einstellungen konnten nicht gespeichert werden.');
    }
  }

  async function syncGroups() {
    setSyncing(true);
    setError('');
    try {
      const { data } = await api.post('/settings/sso/groups/sync', {
        adminApiUrl: settings['sso.adminApiUrl'],
        adminApiToken: settings['sso.adminApiToken']
      });
      setValue('sso.availableGroups', JSON.stringify(data.groups || []));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'SSO-Gruppen konnten nicht geladen werden.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AdminPage title="Systemeinstellungen" subtitle="Rubriken für Organisation, SSO, Gruppenmapping und Systemverhalten">
      <form onSubmit={save} className="page-enter space-y-6">
        {error && <div className="rounded bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

          {activeSection === 'general' && (
            <section className="card overflow-hidden">
              <Header title="Organisation" text="Diese Daten erscheinen in Setup, QR-URLs und Systemkontext." />
              <div className="grid gap-3 p-5 md:grid-cols-2">
                <Field label="Organisationsname" value={settings['org.name']} onChange={(value) => setValue('org.name', value)} />
                <Field label="Kontakt-E-Mail" type="email" value={settings['org.email']} onChange={(value) => setValue('org.email', value)} />
                
                {/* Custom Logo Upload Section */}
                <div className="md:col-span-2 space-y-2">
                  <span className="text-sm font-medium text-gray-700 block">System-Logo</span>
                  <div className="flex items-center gap-4 border border-color p-3 bg-white">
                    {settings['org.logo'] ? (
                      <div className="flex-shrink-0 border border-color p-1 bg-[#fafafa] flex items-center justify-center h-16 w-32 overflow-hidden">
                        <img src={settings['org.logo']} alt="Logo Preview" className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex-shrink-0 border border-dashed border-color flex items-center justify-center h-16 w-32 text-xs text-muted font-mono">
                        Standard Logo
                      </div>
                    )}
                    <div className="flex-1 flex gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        id="org-logo-upload"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, 'org.logo', 400, 120)}
                      />
                      <label
                        htmlFor="org-logo-upload"
                        className="btn-secondary h-9 min-h-0 px-3 flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
                        style={{ borderRadius: '0px' }}
                      >
                        <Upload size={13} />
                        Logo hochladen...
                      </label>
                      {settings['org.logo'] && (
                        <button
                          type="button"
                          onClick={() => setValue('org.logo', '')}
                          className="btn-secondary h-9 min-h-0 px-3 text-red-600 text-xs font-semibold"
                          style={{ borderRadius: '0px' }}
                        >
                          Entfernen
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Custom Favicon Upload Section */}
                <div className="md:col-span-2 space-y-2">
                  <span className="text-sm font-medium text-gray-700 block">Favicon (Browser-Icon)</span>
                  <div className="flex items-center gap-4 border border-color p-3 bg-white">
                    {settings['org.favicon'] ? (
                      <div className="flex-shrink-0 border border-color p-1 bg-[#fafafa] flex items-center justify-center h-16 w-16 overflow-hidden">
                        <img src={settings['org.favicon']} alt="Favicon Preview" className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex-shrink-0 border border-dashed border-color flex items-center justify-center h-16 w-16 text-xs text-muted font-mono">
                        Standard
                      </div>
                    )}
                    <div className="flex-1 flex gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        id="org-favicon-upload"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, 'org.favicon', 64, 64)}
                      />
                      <label
                        htmlFor="org-favicon-upload"
                        className="btn-secondary h-9 min-h-0 px-3 flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
                        style={{ borderRadius: '0px' }}
                      >
                        <Upload size={13} />
                        Favicon hochladen...
                      </label>
                      {settings['org.favicon'] && (
                        <button
                          type="button"
                          onClick={() => setValue('org.favicon', '')}
                          className="btn-secondary h-9 min-h-0 px-3 text-red-600 text-xs font-semibold"
                          style={{ borderRadius: '0px' }}
                        >
                          Entfernen
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <Field label="App-URL" value={settings['app.url']} onChange={(value) => setValue('app.url', value)} placeholder="https://mz.example.de" />
                <label className="text-sm font-medium text-gray-700 md:col-span-2 block">Info-Text auf dem Login-Screen
                  <textarea className="field mt-1 min-h-24 bg-white" placeholder="Hier können z.B. Kontaktdaten der IT oder Öffnungszeiten stehen..." value={settings['login.infoText'] || ''} onChange={(event) => setValue('login.infoText', event.target.value)} />
                </label>
              </div>
            </section>
          )}

          {activeSection === 'usage' && (
            <section className="card overflow-hidden">
              <Header title="Bedienung" text="Standardansichten, Sprache und Benachrichtigungen steuern." />
              <div className="grid gap-3 p-5 md:grid-cols-3">
                <label className="text-sm font-medium text-gray-700">Sprache
                  <select className="field mt-1" value={settings['app.locale']} onChange={(event) => setValue('app.locale', event.target.value)}>
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">Standardansicht
                  <select className="field mt-1" value={settings['ui.defaultView']} onChange={(event) => setValue('ui.defaultView', event.target.value)}>
                    <option value="list">Liste</option>
                    <option value="cards">Karten</option>
                  </select>
                </label>
                <Field label="Standard-Leihdauer Tage" type="number" value={settings['loans.defaultDueDays']} onChange={(value) => setValue('loans.defaultDueDays', value)} />
                <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm font-medium text-gray-700 md:col-span-3">
                  <input type="checkbox" checked={settings['notifications.overdueEnabled'] === 'true'} onChange={(event) => setValue('notifications.overdueEnabled', String(event.target.checked))} />
                  Überfällige Ausleihen in Benachrichtigungen anzeigen
                </label>
              </div>

              <div className="border-t border-black/5 dark:border-white/5 p-5">
                <div className="mb-3 font-semibold text-gray-800 dark:text-gray-200">Eigener Link in der Sidebar</div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] dark:bg-slate-800/50 p-4 text-sm font-medium text-gray-700 dark:text-gray-300 md:col-span-3">
                    <input type="checkbox" checked={settings['customModule.enabled'] === 'true'} onChange={(event) => setValue('customModule.enabled', String(event.target.checked))} />
                    Eigener Link in der Sidebar aktivieren
                  </label>
                  <Field label="Modulname / Label" value={settings['customModule.label'] || ''} onChange={(value) => setValue('customModule.label', value)} placeholder="z.B. IT-Wiki" />
                  <div className="md:col-span-2">
                    <Field label="Ziel-URL (externe Webseite)" value={settings['customModule.url'] || ''} onChange={(value) => setValue('customModule.url', value)} placeholder="https://wiki.example.com" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'labels' && (() => {
            const normLabel = normalizeLabelSettings(settings);
            const availW = Math.max(0, 210 - normLabel.marginLeftMm - normLabel.marginRightMm);
            const availH = Math.max(0, 297 - normLabel.marginTopMm - normLabel.marginBottomMm);
            const cols = Math.max(1, Math.floor(availW / normLabel.widthMm));
            const rows = Math.max(1, Math.floor(availH / normLabel.heightMm));
            const totalPerSheet = cols * rows;

            return (
              <section className="card overflow-hidden">
                <Header title="Labeldruck & Bogenlayout" text="Abmessungen für einzelne Etiketten sowie Seitenränder für DIN-A4-Stickerpapier." />
                <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px]">
                  <div className="space-y-6">
                    {/* Logo für die Labels – zentral aus den Systemeinstellungen */}
                    <div>
                      <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-zinc-200 flex items-center gap-2">
                        <Image size={16} className="text-blue-500" />
                        Logo auf den Labels
                      </div>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">
                        Das Logo wird links oben auf jedes Etikett gedruckt und zentral hier in den Systemeinstellungen verwaltet – es ist nicht im Label fest hinterlegt. Ohne eigenes Logo greift das Zentrallogo aus der Rubrik „Organisation“. Wird das Logo hier oder dort geändert, gilt die Änderung automatisch für alle neu erzeugten Labels.
                      </p>
                      <div className="flex items-center gap-4 border border-color p-3 bg-white">
                        {settings['label.logo'] || settings['org.logo'] ? (
                          <div className="flex-shrink-0 border border-color p-1 bg-[#fafafa] flex items-center justify-center h-16 w-32 overflow-hidden">
                            <img src={settings['label.logo'] || settings['org.logo']} alt="Label-Logo Vorschau" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="flex-shrink-0 border border-dashed border-color flex items-center justify-center h-16 w-32 text-xs text-muted font-mono text-center px-1">
                            Kein Logo hinterlegt
                          </div>
                        )}
                        <div className="flex-1 flex flex-wrap gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            id="label-logo-upload"
                            className="hidden"
                            onChange={(e) => handleImageUpload(e, 'label.logo', 400, 120)}
                          />
                          <label
                            htmlFor="label-logo-upload"
                            className="btn-secondary h-9 min-h-0 px-3 flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
                            style={{ borderRadius: '0px' }}
                          >
                            <Upload size={13} />
                            Logo hochladen...
                          </label>
                          {settings['label.logo'] && (
                            <button
                              type="button"
                              onClick={() => setValue('label.logo', '')}
                              className="btn-secondary h-9 min-h-0 px-3 text-red-600 text-xs font-semibold"
                              style={{ borderRadius: '0px' }}
                            >
                              Entfernen
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Label Abmessungen */}
                    <div>
                      <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-zinc-200 flex items-center gap-2">
                        <Tag size={16} className="text-blue-500" />
                        Etiketten-Abmessungen (Einzel-Label)
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Label-Breite in mm"
                          type="number"
                          min="20"
                          max="210"
                          value={settings['label.widthMm']}
                          onChange={(value) => setValue('label.widthMm', value)}
                        />
                        <Field
                          label="Label-Höhe in mm"
                          type="number"
                          min="15"
                          max="297"
                          value={settings['label.heightMm']}
                          onChange={(value) => setValue('label.heightMm', value)}
                        />
                      </div>
                    </div>

                    {/* Stickerpapier Ränder */}
                    <div>
                      <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-zinc-200 flex items-center gap-2">
                        <Layers size={16} className="text-blue-500" />
                        Stickerpapier-Ränder (DIN-A4 Seitenabstände)
                      </div>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">
                        Gibt an, wie viel Millimeter Abstand das erste Label vom Papierrand oben, links, rechts und unten hat.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Rand Oben (mm)"
                          type="number"
                          min="0"
                          max="100"
                          value={settings['label.marginTopMm'] || '0'}
                          onChange={(value) => setValue('label.marginTopMm', value)}
                        />
                        <Field
                          label="Rand Unten (mm)"
                          type="number"
                          min="0"
                          max="100"
                          value={settings['label.marginBottomMm'] || '0'}
                          onChange={(value) => setValue('label.marginBottomMm', value)}
                        />
                        <Field
                          label="Rand Links (mm)"
                          type="number"
                          min="0"
                          max="100"
                          value={settings['label.marginLeftMm'] || '0'}
                          onChange={(value) => setValue('label.marginLeftMm', value)}
                        />
                        <Field
                          label="Rand Rechts (mm)"
                          type="number"
                          min="0"
                          max="100"
                          value={settings['label.marginRightMm'] || '0'}
                          onChange={(value) => setValue('label.marginRightMm', value)}
                        />
                      </div>
                    </div>

                    {/* Automatische Layout-Kalkulation */}
                    <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-3">
                        Berechnetes DIN-A4 Bogen-Layout
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white dark:bg-zinc-800 p-2.5 shadow-sm border border-black/5 dark:border-white/5">
                          <div className="text-lg font-bold text-gray-900 dark:text-white">
                            {cols} × {rows}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-zinc-400">Spalten × Zeilen</div>
                        </div>
                        <div className="rounded-lg bg-white dark:bg-zinc-800 p-2.5 shadow-sm border border-black/5 dark:border-white/5">
                          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {totalPerSheet}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-zinc-400">Labels / Bogen</div>
                        </div>
                        <div className="rounded-lg bg-white dark:bg-zinc-800 p-2.5 shadow-sm border border-black/5 dark:border-white/5">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                            {availW.toFixed(0)} × {availH.toFixed(0)} mm
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-zinc-400">Nutzfläche</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Vorschau-Panel */}
                  <div className="rounded-xl bg-[#fafafa] dark:bg-zinc-900/50 border border-gray-200/80 dark:border-zinc-800 p-4 flex flex-col">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Vorschau</span>
                      <div className="flex rounded-lg bg-gray-200/70 dark:bg-zinc-800 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setLabelPreviewTab('single')}
                          className={`rounded-md px-2.5 py-1 font-medium transition ${labelPreviewTab === 'single' ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-xs' : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                          Einzeln
                        </button>
                        <button
                          type="button"
                          onClick={() => setLabelPreviewTab('sheet')}
                          className={`rounded-md px-2.5 py-1 font-medium transition ${labelPreviewTab === 'sheet' ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-xs' : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                          A4-Bogen
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-white dark:bg-zinc-950 p-4 border border-gray-100 dark:border-zinc-800/80 min-h-[260px]">
                      {labelPreviewTab === 'single' ? (
                        <div className="flex items-center justify-center overflow-hidden">
                          <AssetLabel
                            preview
                            settings={settings}
                            device={{ id: '042', inventoryId: 'INV-042', model: 'Beispielgerät', room: { name: 'Medienraum 1' } }}
                            qrValue={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/devices?id=INV-042`}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          {/* Mini DIN-A4 Sheet (Proportional 210mm x 297mm) */}
                          <div
                            className="relative bg-white border border-gray-300 dark:border-zinc-700 shadow-sm rounded-sm"
                            style={{
                              width: '154px',
                              height: '218px',
                              boxSizing: 'border-box',
                              paddingTop: `${(normLabel.marginTopMm / 297) * 218}px`,
                              paddingBottom: `${(normLabel.marginBottomMm / 297) * 218}px`,
                              paddingLeft: `${(normLabel.marginLeftMm / 210) * 154}px`,
                              paddingRight: `${(normLabel.marginRightMm / 210) * 154}px`
                            }}
                          >
                            {/* Printable Grid Area */}
                            <div
                              className="h-full w-full grid bg-blue-50/30 dark:bg-blue-900/10 border border-dashed border-blue-300 dark:border-blue-800"
                              style={{
                                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
                              }}
                            >
                              {Array.from({ length: Math.min(totalPerSheet, 60) }).map((_, idx) => (
                                <div
                                  key={idx}
                                  className="border border-blue-400/40 bg-white/80 dark:bg-zinc-900/80 flex items-center justify-center p-[1px] overflow-hidden"
                                >
                                  <div className="text-[6px] text-gray-400 font-mono scale-90">{idx + 1}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="mt-2 text-center text-[11px] text-gray-500 dark:text-zinc-400">
                            DIN A4 ({cols} × {rows} = {totalPerSheet} Etiketten)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {activeSection === 'mail' && (
            <section className="card overflow-hidden">
              <Header title="Mail-Konfiguration" text="SMTP für ausgehende Mails, IMAP für eingehende Mails und DKIM-Signatur." />
              <div className="border-b border-black/5 p-5">
                <div className="mb-3 font-semibold text-gray-800">SMTP (Ausgehend)</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="SMTP-Host" value={settings['mail.smtp.host']} onChange={(value) => setValue('mail.smtp.host', value)} placeholder="smtp.example.com" />
                  <Field label="SMTP-Port" type="number" value={settings['mail.smtp.port']} onChange={(value) => setValue('mail.smtp.port', value)} placeholder="587" />
                  <Field label="SMTP-Benutzer" value={settings['mail.smtp.user']} onChange={(value) => setValue('mail.smtp.user', value)} />
                  <Field label="SMTP-Passwort" type="password" value={settings['mail.smtp.pass']} onChange={(value) => setValue('mail.smtp.pass', value)} />
                  <Field label="Absender-Adresse" type="email" value={settings['mail.smtp.from']} onChange={(value) => setValue('mail.smtp.from', value)} placeholder="noreply@example.com" />
                  <Field label="Absender-Name" value={settings['mail.smtp.fromName'] || ''} onChange={(value) => setValue('mail.smtp.fromName', value)} placeholder="z.B. Helpdesk Schnikdu Systems" />
                  <label className="text-sm font-medium text-gray-700">Verschlüsselung
                    <select className="field mt-1" value={settings['mail.smtp.secure'] || 'false'} onChange={(event) => setValue('mail.smtp.secure', event.target.value)}>
                      <option value="false">STARTTLS (Port 587)</option>
                      <option value="true">SSL/TLS (Port 465)</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="border-b border-black/5 p-5">
                <div className="mb-3 font-semibold text-gray-800">Standard-E-Mail-Signatur</div>
                <p className="mb-3 text-sm text-gray-500">Diese Signatur wird unter jeder System-E-Mail angehängt. Die Zeile "Diese E-Mail wurde automatisch verschickt." wird immer und unabhängig von der Signatur ergänzt.</p>
                <label className="text-sm font-medium text-gray-700 block">Signatur
                  <textarea className="field mt-1 min-h-24 font-mono text-xs" placeholder="z.B.&#10;Max Mustermann&#10;IT-Support, Beispiel GmbH" value={settings['mail.signature'] || ''} onChange={(event) => setValue('mail.signature', event.target.value)} />
                </label>
              </div>
              <div className="border-b border-black/5 p-5">
                <div className="mb-3 font-semibold text-gray-800">IMAP (Eingehend)</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="IMAP-Host" value={settings['mail.imap.host']} onChange={(value) => setValue('mail.imap.host', value)} placeholder="imap.example.com" />
                  <Field label="IMAP-Port" type="number" value={settings['mail.imap.port']} onChange={(value) => setValue('mail.imap.port', value)} placeholder="993" />
                  <Field label="IMAP-Benutzer" value={settings['mail.imap.user']} onChange={(value) => setValue('mail.imap.user', value)} />
                  <Field label="IMAP-Passwort" type="password" value={settings['mail.imap.pass']} onChange={(value) => setValue('mail.imap.pass', value)} />
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                    checked={(settings['mail.inboundAutoReply'] || 'true') === 'true'}
                    onChange={(event) => setValue('mail.inboundAutoReply', event.target.checked ? 'true' : 'false')}
                  />
                  <span>
                    <span className="font-medium text-gray-700">Automatische Antwort auf eingehende E-Mails</span>
                    <span className="block text-xs text-gray-500">Bei jeder neuen E-Mail im Support-Postfach wird eine Empfangsbestätigung an den Absender geschickt („Vielen Dank für Ihre Anfrage …“).</span>
                  </span>
                </label>
              </div>
              <div className="p-5">
                <div className="mb-3 font-semibold text-gray-800">DKIM (E-Mail-Signatur)</div>
                <p className="mb-3 text-sm text-gray-500">DKIM-Signatur verbessert die Zustellbarkeit und verhindert Spam-Einstufung. Ergänze auch SPF- und DMARC-Einträge in deiner DNS-Zone.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="DKIM-Domain" value={settings['mail.dkim.domain']} onChange={(value) => setValue('mail.dkim.domain', value)} placeholder="example.com" />
                  <Field label="DKIM-Selector" value={settings['mail.dkim.selector']} onChange={(value) => setValue('mail.dkim.selector', value)} placeholder="default" />
                  <label className="text-sm font-medium text-gray-700 md:col-span-2">DKIM-Private-Key
                    <textarea className="field mt-1 min-h-24 font-mono text-xs" placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..." value={settings['mail.dkim.privateKey'] || ''} onChange={(event) => setValue('mail.dkim.privateKey', event.target.value)} />
                  </label>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'sso' && (
            <section className="card overflow-hidden">
              <Header title="SSO" text="OpenID Connect, Keycloak, Authentik oder Microsoft Login konfigurieren." />
              <div className="grid gap-3 p-5 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm font-medium text-gray-700 md:col-span-2">
                  <input type="checkbox" checked={settings['sso.enabled'] === 'true'} onChange={(event) => setValue('sso.enabled', String(event.target.checked))} />
                  SSO auf dem Login-Screen anzeigen
                </label>
                <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm font-medium text-gray-700 md:col-span-2">
                  <input type="checkbox" checked={settings['sso.promoteSso'] === 'true'} onChange={(event) => setValue('sso.promoteSso', String(event.target.checked))} />
                  SSO-Button hervorheben (Lokale Anmeldung standardmäßig ausblenden)
                </label>
                <div className="space-y-2 md:col-span-2">
                  <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm font-medium text-gray-700">
                    <input type="checkbox" checked={settings['sso.force'] === 'true'} onChange={(event) => setValue('sso.force', String(event.target.checked))} />
                    Benutzer direkt zum SSO-Provider weiterleiten (Login-Seite überspringen)
                  </label>
                  <p className="px-1 text-xs text-gray-500">
                    Notfall-Zugang: Die lokale Anmeldung bleibt unter <code className="font-mono text-gray-600">/login/no-sso-login</code> erreichbar, falls der SSO-Provider nicht verfügbar ist.
                  </p>
                </div>
                <label className="text-sm font-medium text-gray-700">Provider
                  <select className="field mt-1" value={settings['sso.provider']} onChange={(event) => setValue('sso.provider', event.target.value)}>
                    <option value="oidc">Generisches OpenID Connect</option>
                    <option value="keycloak">Keycloak</option>
                    <option value="authentik">Authentik</option>
                    <option value="microsoft">Microsoft Entra ID</option>
                  </select>
                </label>
                <Field label="Button-Text" value={settings['sso.buttonLabel']} onChange={(value) => setValue('sso.buttonLabel', value)} />
                <Field label="Issuer-URL" value={settings['sso.issuerUrl']} onChange={(value) => setValue('sso.issuerUrl', value)} placeholder="https://id.example.de/realms/mz" />
                <Field label="Redirect-URI" value={settings['sso.redirectUri']} onChange={(value) => setValue('sso.redirectUri', value)} />
                <Field label="Client-ID" value={settings['sso.clientId']} onChange={(value) => setValue('sso.clientId', value)} />
                <Field label="Client-Secret" type="password" value={settings['sso.clientSecret']} onChange={(value) => setValue('sso.clientSecret', value)} />
              </div>
              <div className="grid gap-4 border-t border-black/5 p-5 text-sm text-gray-600 lg:grid-cols-3">
                <Guide title="1. Client erstellen" text="Im Identity Provider einen OIDC-Client für MZ-Inventory anlegen. Authorization Code Flow aktivieren." />
                <Guide title="2. Redirect eintragen" text={`Diese Redirect-URI beim Provider hinterlegen: ${settings['sso.redirectUri'] || defaults['sso.redirectUri']}`} />
                <Guide title="3. Gruppen liefern" text={`Gruppen per Claim "${settings['sso.groupClaim']}" oder über die Admin-API in Rechte & Gruppen importieren.`} />
              </div>
            </section>
          )}

          {activeSection === 'embed' && (
            <section className="card overflow-hidden">
              <Header title="Einbettung (iFrame)" text="Das Inventar-Tool in externe Web-Frameworks einbetten. Nur explizit erlaubte Origins dürfen das Tool einbetten." />
              <div className="p-5 space-y-4">
                <label className="text-sm font-medium text-gray-700 block">
                  Erlaubte Origins (Komma-getrennt)
                  <input
                    className="field mt-1 font-mono text-xs"
                    placeholder="https://wiki.example.com, https://portal.example.de"
                    value={settings['embed.allowedOrigins'] || ''}
                    onChange={(e) => setValue('embed.allowedOrigins', e.target.value)}
                  />
                  <span className="mt-1 block text-xs text-gray-400 font-normal">
                    Nur diese Origins dürfen das Tool per iFrame einbetten. Leer lassen = kein Embedding erlaubt.
                  </span>
                </label>

                <label className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings['embed.hideHeader'] === 'true'}
                    onChange={(e) => setValue('embed.hideHeader', String(e.target.checked))}
                  />
                  Sidebar &amp; Header im Einbettungs-Modus ausblenden
                </label>

                <div className="rounded-xl bg-gray-50 border border-black/5 p-4 text-xs text-gray-500 space-y-2">
                  <div className="font-semibold text-gray-700 text-sm">Einbettung per iFrame</div>
                  <p>
                    Mit aktiviertem Embedding kann das Tool in externen Seiten eingebettet werden.
                    Die folgenden CSP-Header werden automatisch gesetzt:
                  </p>
                  <code className="block bg-white rounded-lg p-3 font-mono text-[11px] text-gray-600 border border-black/5">
                    Content-Security-Policy: frame-ancestors 'self' https://wiki.example.com<br/>
                    X-Frame-Options: ALLOW-FROM https://wiki.example.com
                  </code>
                  <p className="text-amber-600 font-medium">
                    Sicherheitshinweis: Trage nur vertrauenswürdige Origins ein. Jeder eingetragene Origin kann das Tool in einem iFrame laden und Benutzerinteraktionen beobachten.
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 border border-black/5 p-4 text-xs text-gray-500 space-y-2">
                  <div className="font-semibold text-gray-700 text-sm">Beispiel: Einbettung</div>
                  <code className="block bg-white rounded-lg p-3 font-mono text-[11px] text-gray-600 border border-black/5 whitespace-pre">{`<iframe
  src="https://inventory.example.de/inventory?embed=1"
  width="100%"
  height="800"
  frameborder="0"
  title="Inventar-Tool"
></iframe>`}</code>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'system' && (
            <section className="card overflow-hidden">
              <Header title="Systemübersicht" text="Server- und Datenbank-Informationen des Hostsystems." />
              <div className="p-5">
                {!systemInfo && !systemLoading && (
                  <button type="button" className="btn-primary" onClick={async () => {
                    setSystemLoading(true);
                    try {
                      const { data } = await api.get('/system/overview');
                      setSystemInfo(data);
                    } catch {
                      setError('Systemdaten konnten nicht geladen werden.');
                    } finally {
                      setSystemLoading(false);
                    }
                  }}><Monitor size={17} />Systemdaten laden</button>
                )}
                {systemLoading && <div className="text-sm text-gray-500">Lade Systemdaten...</div>}
                {systemInfo && (
                  <div className="grid gap-6">
                    <SysCard title="Betriebssystem" items={[
                      ['Hostname', systemInfo.os.hostname],
                      ['Distribution', systemInfo.os.distro],
                      ['Kernel', systemInfo.os.release],
                      ['Architektur', systemInfo.os.arch],
                      ['Betriebszeit', formatUptime(systemInfo.os.uptime)]
                    ]} />
                    <SysCard title="Prozessor" items={[
                      ['Modell', systemInfo.cpu.model],
                      ['Kerne', String(systemInfo.cpu.cores)],
                      ['Auslastung (1m)', String(systemInfo.cpu.loadAvg?.[0]?.toFixed(2) || 'N/A')]
                    ]} />
                    <SysCard title="Arbeitsspeicher" items={[
                      ['Gesamt', formatBytes(systemInfo.memory.total)],
                      ['Belegt', formatBytes(systemInfo.memory.used)],
                      ['Frei', formatBytes(systemInfo.memory.free)]
                    ]} />
                    {systemInfo.disk && (
                      <SysCard title="Festplatte (/)"
                        items={[
                          ['Gesamt', formatBytes(systemInfo.disk.total)],
                          ['Belegt', formatBytes(systemInfo.disk.used)],
                          ['Frei', formatBytes(systemInfo.disk.free)]
                        ]}
                        bar={{ used: systemInfo.disk.used, total: systemInfo.disk.total }}
                      />
                    )}
                    <SysCard title="Datenbank" items={[
                      ['Typ', systemInfo.database.type],
                      ['Version', systemInfo.database.version || 'N/A'],
                      ['Größe', systemInfo.database.size ? formatBytes(systemInfo.database.size) : 'N/A']
                    ]} />
                    <SysCard title="Installierte Pakete" items={[
                      ['Node.js', systemInfo.packages.node || 'N/A'],
                      ['npm', systemInfo.packages.npm || 'N/A'],
                      ['MySQL', systemInfo.packages.mysql || 'N/A'],
                      ['DB-Treiber', systemInfo.packages.mysql2 || 'mysql2']
                    ]} />
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === 'support' && (
            <section className="card overflow-hidden">
              <Header title="Support" text="Hinweis für alle Benutzer: Hier konfigurierst du, an wen sich Fehler im Tool melden lassen. Der Hinweis erscheint auf jedem Dashboard." />
              <div className="p-5 space-y-5">
                <Field
                  label="Support-E-Mail-Adresse"
                  type="email"
                  placeholder="it-support@example.de"
                  value={settings['support.email'] || ''}
                  onChange={(value) => setValue('support.email', value)}
                />
                <p className="-mt-3 text-xs text-gray-400">
                  Wird als klickbarer Mail-Link in der Fußzeile jedes Dashboards angezeigt. Leer lassen = keine E-Mail-Anzeige.
                </p>

                <label className="block text-sm font-medium text-gray-700">
                  Zusätzlicher Hinweistext
                  <textarea
                    className="field mt-1 min-h-24"
                    placeholder="z. B. Bitte in der Fehlermeldung Gerät, Standort und eine kurze Beschreibung angeben."
                    value={settings['support.text'] || ''}
                    onChange={(event) => setValue('support.text', event.target.value)}
                  />
                  <span className="mt-1 block text-xs text-gray-400 font-normal">
                    Optionaler Zusatz für die Fußzeile. Wird direkt hinter dem Link angezeigt.
                  </span>
                </label>

                <div className="rounded-xl bg-[#fafafa] border border-black/5 p-4 text-xs text-gray-500 space-y-2">
                  <div className="font-semibold text-gray-700 text-sm">Vorschau der Fußzeile</div>
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <MessageSquareWarning size={15} className="text-amber-500" />
                    <span>Fehler gefunden? Du kannst ihn hier melden:</span>
                    {settings['support.email'] ? (
                      <a href={`mailto:${settings['support.email']}`} className="font-semibold text-primary underline">{settings['support.email']}</a>
                    ) : (
                      <span className="italic text-gray-400">noch keine E-Mail hinterlegt</span>
                    )}
                  </p>
                  {settings['support.text'] && <p>{settings['support.text']}</p>}
                </div>
              </div>
            </section>
          )}

          {activeSection === 'roles' && (
            <section className="card overflow-hidden">
              <Header title="Rechte & Gruppen" text="SSO-Gruppen aus Claims oder Admin-APIs laden und auf lokale Rollen/Rechte mappen." />
              <div className="grid gap-3 p-5 md:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">Gruppenquelle
                  <select className="field mt-1" value={settings['sso.groupSource']} onChange={(event) => setValue('sso.groupSource', event.target.value)}>
                    <option value="claim">OIDC Claim</option>
                    <option value="adminApi">Admin-API</option>
                  </select>
                </label>
                <Field label="Gruppen-Claim / Scope" value={settings['sso.groupClaim']} onChange={(value) => setValue('sso.groupClaim', value)} placeholder="groups" />
                {settings['sso.groupSource'] === 'adminApi' && (
                  <>
                    <Field label="Admin-API Gruppen-URL" value={settings['sso.adminApiUrl']} onChange={(value) => setValue('sso.adminApiUrl', value)} placeholder="https://id.example.de/api/v3/core/groups/" />
                    <Field label="Admin-API Token" type="password" value={settings['sso.adminApiToken']} onChange={(value) => setValue('sso.adminApiToken', value)} />
                    <div className="flex items-center gap-3 md:col-span-2">
                      <button type="button" className="btn-secondary" onClick={syncGroups} disabled={syncing}><UsersRound size={17} />{syncing ? 'Lade Gruppen...' : 'Gruppen aus SSO laden'}</button>
                      <span className="text-sm text-gray-500">{availableGroups.length} Gruppen gespeichert</span>
                    </div>
                  </>
                )}
                {settings['sso.groupSource'] === 'claim' && (
                  <div className="md:col-span-2 rounded-xl bg-[#fafafa] p-4 text-sm text-gray-500">
                    Gruppen werden automatisch aus dem OIDC-Claim <strong className="text-gray-700">"{settings['sso.groupClaim'] || 'groups'}"</strong> gelesen, der beim SSO-Login mitgeliefert wird. Es ist keine Admin-API nötig.
                  </div>
                )}
              </div>

              <div className="border-t border-black/5 p-5">
                <div className="flex flex-col gap-3 rounded-xl bg-[#fafafa] p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-gray-800">Gruppen-Mappings</div>
                    <p className="mt-1 text-sm text-gray-500">SSO-Gruppen auf Rollen und Rechte mappen, Zusatzrechte erteilen (+) oder gezielt entziehen (-).</p>
                  </div>
                  <Link to="/admin/roles" className="btn-secondary text-xs shrink-0"><ShieldCheck size={14} className="inline mr-1" />Rechte & Gruppen verwalten</Link>
                </div>
              </div>
            </section>
          )}

          <div className="flex items-center justify-between gap-3">
            <button type="button" className="btn-secondary" onClick={() => navigate('/admin/dashboard')}>Zur Administration</button>
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm text-green-700">Gespeichert.</span>}
              <button className="btn-primary"><Save size={17} />Einstellungen speichern</button>
            </div>
          </div>
        </form>
    </AdminPage>
  );
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function Header({ title, text }) {
  return <div className="border-b border-black/5 p-5"><div className="font-semibold text-gray-800">{title}</div><div className="mt-1 text-sm text-gray-500">{text}</div></div>;
}

function Field({ label, value, onChange, type = 'text', placeholder = '', min, max }) {
  return <label className="text-sm font-medium text-gray-700">{label}<input className="field mt-1" type={type} min={min} max={max} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Guide({ title, text }) {
  return <div className="rounded-xl bg-[#fafafa] p-4"><div className="mb-2 flex items-center gap-2 font-semibold text-gray-800"><ExternalLink size={15} />{title}</div><p>{text}</p></div>;
}

function SysCard({ title, items, bar }) {
  return (
    <div className="rounded-xl border border-black/5 bg-[#fafafa] p-4">
      <div className="mb-3 text-sm font-semibold text-gray-800">{title}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="text-sm">
            <span className="text-gray-500">{label}: </span>
            <span className="font-medium text-gray-800">{value}</span>
          </div>
        ))}
      </div>
      {bar && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min((bar.used / bar.total) * 100, 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}
