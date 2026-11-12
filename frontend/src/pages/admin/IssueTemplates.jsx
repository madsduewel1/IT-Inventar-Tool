import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { PageLoader } from '../../components/Loading';
import { useConfirm } from '../../components/ConfirmDialog';
import { ISSUE_TYPES, ISSUE_PRIORITIES } from '../../components/issueMeta';
import { AdminPage } from './Users';

const VISIBILITIES = [
  { value: 'ALL', label: 'Alle Benutzer' },
  { value: 'STAFF', label: 'Nur IT und Administration' },
  { value: 'ADMIN', label: 'Nur Administration' }
];

const EMPTY_FORM = {
  name: '',
  description: '',
  type: 'DEVICE',
  areaId: '',
  icon: '',
  color: '',
  visibility: 'ALL',
  visibilityGroups: '',
  priority: 'NORMAL',
  descriptionHint: '',
  confirmationMessage: '',
  fieldHelpTitle: '',
  fieldHelpDescription: '',
  fieldHelpPriority: '',
  fieldHelpAttachments: '',
  attachmentsAllowed: true,
  maxAttachments: 10,
  active: true,
  sortOrder: 0,
  assigneeIds: [],
  recipients: ''
};

function toForm(template) {
  return {
    name: template.name || '',
    description: template.description || '',
    type: template.type || (template.areaId ? 'DEVICE' : ''),
    areaId: template.areaId || '',
    icon: template.icon || '',
    color: template.color || '',
    visibility: template.visibility || 'ALL',
    visibilityGroups: (template.visibilityGroups || []).join(', '),
    priority: template.priority || 'NORMAL',
    descriptionHint: template.descriptionHint || '',
    confirmationMessage: template.confirmationMessage || '',
    fieldHelpTitle: template.fieldHelp?.title || '',
    fieldHelpDescription: template.fieldHelp?.description || '',
    fieldHelpPriority: template.fieldHelp?.priority || '',
    fieldHelpAttachments: template.fieldHelp?.attachments || '',
    attachmentsAllowed: template.attachmentsAllowed !== false,
    maxAttachments: template.maxAttachments ?? 10,
    active: template.active !== false,
    sortOrder: template.sortOrder ?? 0,
    assigneeIds: (template.assignees || []).map((entry) => entry.id),
    recipients: (template.recipients || []).map((entry) => entry.name ? `${entry.email} (${entry.name})` : entry.email).join(', ')
  };
}

function parseRecipients(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^([^\s(]+)\s*\(([^)]*)\)$/);
      return match ? { email: match[1], name: match[2] } : { email: entry, name: null };
    });
}

export default function IssueTemplates() {
  const confirm = useConfirm();
  const [templates, setTemplates] = useState([]);
  const [areas, setAreas] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [templatesResult, areasResult, usersResult] = await Promise.all([
        api.get('/issue-templates/all'),
        api.get('/areas').catch(() => ({ data: { areas: [] } })),
        api.get('/users/list').catch(() => ({ data: { users: [] } }))
      ]);
      setTemplates(templatesResult.data.templates || []);
      setAreas(areasResult.data.areas || []);
      setUsers((usersResult.data.users || []).filter((user) => ['STAFF', 'ADMIN'].includes(user.role)));
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Vorlagen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) || null,
    [templates, selectedId]
  );

  function startNew() {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  function selectTemplate(template) {
    setSelectedId(template.id);
    setForm(toForm(template));
    setError('');
  }

  function change(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function toggleAssignee(userId) {
    setForm((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(userId)
        ? prev.assigneeIds.filter((id) => id !== userId)
        : [...prev.assigneeIds, userId]
    }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      name: form.name,
      description: form.description,
      type: form.areaId ? 'DEVICE' : (form.type || null),
      areaId: form.areaId || null,
      icon: form.icon,
      color: form.color,
      visibility: form.visibility,
      visibilityGroups: form.visibilityGroups.split(',').map((entry) => entry.trim()).filter(Boolean),
      priority: form.priority,
      descriptionHint: form.descriptionHint,
      confirmationMessage: form.confirmationMessage,
      fieldHelp: {
        title: form.fieldHelpTitle,
        description: form.fieldHelpDescription,
        priority: form.fieldHelpPriority,
        attachments: form.fieldHelpAttachments
      },
      attachmentsAllowed: form.attachmentsAllowed,
      maxAttachments: Number(form.maxAttachments) || 0,
      active: form.active,
      sortOrder: Number(form.sortOrder) || 0,
      assigneeIds: form.assigneeIds,
      recipients: parseRecipients(form.recipients)
    };
    try {
      if (selectedId) {
        await api.patch(`/issue-templates/${selectedId}`, payload);
      } else {
        await api.post('/issue-templates', payload);
      }
      await load();
      setSelectedId(null);
      setForm(EMPTY_FORM);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Vorlage konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(template) {
    const ok = await confirm({
      title: 'Vorlage löschen',
      message: `Soll die Vorlage „${template.name}“ wirklich gelöscht werden? Bereits erstellte Tickets bleiben unverändert.`,
      tone: 'danger',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen'
    });
    if (!ok) return;
    try {
      await api.delete(`/issue-templates/${template.id}`);
      if (selectedId === template.id) startNew();
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Vorlage konnte nicht gelöscht werden.');
    }
  }

  function duplicate(template) {
    setSelectedId(null);
    setForm({ ...toForm(template), name: `${template.name} (Kopie)` });
  }

  if (loading) return <PageLoader text="Ticket-Vorlagen werden geladen…" />;

  return (
    <AdminPage
      title="Ticket-Vorlagen"
      subtitle="Vordefinierte Meldungen für Gerätebereiche und Ticketarten – mit Priorität, Hinweisen und Standardbearbeitern."
    >
      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-3 dark:border-zinc-700">
            <h2 className="font-semibold text-gray-800 dark:text-zinc-100">Vorlagen ({templates.length})</h2>
            <button type="button" className="btn-secondary" onClick={startNew}>
              <Plus size={15} /> Neu
            </button>
          </div>
          <div className="max-h-[70vh] divide-y divide-black/5 overflow-y-auto dark:divide-zinc-700">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template)}
                className={`block w-full px-4 py-3 text-left transition ${selectedId === template.id ? 'bg-violet-50/70 dark:bg-violet-950/30' : 'hover:bg-gray-50 dark:hover:bg-zinc-800/60'}`}
              >
                <div className="flex items-center gap-2">
                  {template.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: template.color }} aria-hidden="true" />}
                  {template.icon && <span aria-hidden="true">{template.icon}</span>}
                  <span className="min-w-0 flex-1 truncate font-semibold text-gray-800 dark:text-zinc-100">{template.name}</span>
                  {!template.active && <span className="badge bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">Inaktiv</span>}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  {template.area?.name || template.typeLabel || 'Ohne Zuordnung'}
                  {template.assignees?.length ? ` · ${template.assignees.length} Bearbeiter` : ''}
                  {template.recipientCount ? ` · ${template.recipientCount} Empfänger` : ''}
                </div>
                <div className="mt-1 text-[11px] text-gray-400">
                  {template.issueCount || 0} Ticket(s) · {template.versionCount || 0} Version(en)
                </div>
              </button>
            ))}
            {templates.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">Noch keine Vorlagen angelegt.</div>
            )}
          </div>
        </section>

        <form onSubmit={save} className="card space-y-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-800 dark:text-zinc-100">
              {selectedId ? 'Vorlage bearbeiten' : 'Neue Vorlage'}
            </h2>
            <div className="flex gap-2">
              {selectedTemplate && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => duplicate(selectedTemplate)}>
                    <Copy size={15} /> Duplizieren
                  </button>
                  <button type="button" className="btn-secondary border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400" onClick={() => remove(selectedTemplate)}>
                    <Trash2 size={15} /> Löschen
                  </button>
                </>
              )}
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={15} /> {saving ? 'Speichert…' : 'Speichern'}
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Name *
              <input className="field mt-1" value={form.name} onChange={(e) => change({ name: e.target.value })} required maxLength={120} />
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Symbol (optional)
              <input className="field mt-1" value={form.icon} onChange={(e) => change({ icon: e.target.value })} placeholder="z. B. 🔧 oder 💻" maxLength={8} />
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Farbe (optional)
              <input className="field mt-1" value={form.color} onChange={(e) => change({ color: e.target.value })} placeholder="z. B. #2563eb" maxLength={20} />
            </label>
          </div>

          <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">Beschreibung
            <textarea className="field mt-1 min-h-20" value={form.description} onChange={(e) => change({ description: e.target.value })} placeholder="Kurze Erklärung, wann diese Vorlage passt." />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Gerätebereich (optional)
              <select className="field mt-1" value={form.areaId} onChange={(e) => change({ areaId: e.target.value, type: e.target.value ? 'DEVICE' : form.type })}>
                <option value="">Kein Gerätebereich</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Ticketart
              <select className="field mt-1" value={form.areaId ? 'DEVICE' : form.type} onChange={(e) => change({ type: e.target.value, areaId: '' })} disabled={Boolean(form.areaId)}>
                {ISSUE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Sichtbarkeit
              <select className="field mt-1" value={form.visibility} onChange={(e) => change({ visibility: e.target.value })}>
                {VISIBILITIES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Standardpriorität
              <select className="field mt-1" value={form.priority} onChange={(e) => change({ priority: e.target.value })}>
                {Object.entries(ISSUE_PRIORITIES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Sortierung
              <input type="number" className="field mt-1" value={form.sortOrder} onChange={(e) => change({ sortOrder: e.target.value })} />
            </label>
          </div>

          <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">Sichtbar für SSO-Gruppen (optional, kommagetrennt)
            <input className="field mt-1" value={form.visibilityGroups} onChange={(e) => change({ visibilityGroups: e.target.value })} placeholder="z. B. lehrer, verwaltung" />
          </label>

          <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">Beschreibungshinweis
            <textarea className="field mt-1 min-h-20" value={form.descriptionHint} onChange={(e) => change({ descriptionHint: e.target.value })} placeholder="Wird im Ticketformular über der Beschreibung angezeigt." />
          </label>

          <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">Bestätigung nach dem Absenden
            <textarea className="field mt-1 min-h-16" value={form.confirmationMessage} onChange={(e) => change({ confirmationMessage: e.target.value })} placeholder="z. B. Dein Gerät wird in der nächsten Pause geprüft." />
          </label>

          <details className="rounded-xl border border-black/10 p-4 dark:border-zinc-700">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-zinc-300">Hilfetexte je Feld</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-600 dark:text-zinc-400">Titel
                <input className="field mt-1" value={form.fieldHelpTitle} onChange={(e) => change({ fieldHelpTitle: e.target.value })} />
              </label>
              <label className="text-xs font-medium text-gray-600 dark:text-zinc-400">Beschreibung
                <input className="field mt-1" value={form.fieldHelpDescription} onChange={(e) => change({ fieldHelpDescription: e.target.value })} />
              </label>
              <label className="text-xs font-medium text-gray-600 dark:text-zinc-400">Priorität
                <input className="field mt-1" value={form.fieldHelpPriority} onChange={(e) => change({ fieldHelpPriority: e.target.value })} />
              </label>
              <label className="text-xs font-medium text-gray-600 dark:text-zinc-400">Anhänge
                <input className="field mt-1" value={form.fieldHelpAttachments} onChange={(e) => change({ fieldHelpAttachments: e.target.value })} />
              </label>
            </div>
          </details>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-black/10 p-3 dark:border-zinc-700">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300">
                <input type="checkbox" checked={form.attachmentsAllowed} onChange={(e) => change({ attachmentsAllowed: e.target.checked })} />
                Anhänge erlauben
              </label>
              <label className="mt-3 block text-xs font-medium text-gray-600 dark:text-zinc-400">Maximale Anzahl
                <input type="number" min="0" max="50" className="field mt-1" value={form.maxAttachments} onChange={(e) => change({ maxAttachments: e.target.value })} disabled={!form.attachmentsAllowed} />
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300">
                <input type="checkbox" checked={form.active} onChange={(e) => change({ active: e.target.checked })} />
                Vorlage aktiv
              </label>
            </div>

            <div className="rounded-xl border border-black/10 p-3 dark:border-zinc-700">
              <div className="text-sm font-medium text-gray-700 dark:text-zinc-300">Standardbearbeiter</div>
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                {users.map((user) => (
                  <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60">
                    <input type="checkbox" checked={form.assigneeIds.includes(user.id)} onChange={() => toggleAssignee(user.id)} />
                    <span className="min-w-0 truncate">{user.displayName || user.username}</span>
                  </label>
                ))}
                {users.length === 0 && <p className="text-xs text-gray-500">Keine IT-/Admin-Benutzer vorhanden.</p>}
              </div>
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">Zusätzliche E-Mail-Empfänger
            <textarea className="field mt-1 min-h-16" value={form.recipients} onChange={(e) => change({ recipients: e.target.value })} placeholder="sekretariat@schule.de, hausmeister@schule.de" />
            <span className="mt-1 block text-xs font-normal text-gray-500">Kommagetrennt. Optional mit Name in Klammern: mail@schule.de (Sekretariat).</span>
          </label>

          <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-zinc-800/60 dark:text-zinc-400">
            <CheckCircle2 size={14} /> Änderungen gelten nur für neue Tickets. Bereits erstellte Tickets behalten ihre Vorlage und Werte.
          </div>
        </form>
      </div>
    </AdminPage>
  );
}
