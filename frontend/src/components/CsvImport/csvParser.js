import { CSV_COLUMNS } from './csvTemplate';

/**
 * Parst rohen CSV-Text und gibt ein Array von Zeilenobjekten zurück.
 * Unterstützt Semikolon und Komma als Trennzeichen.
 * Überspringt Hinweis-Zeilen (fangen mit '(' an).
 */
export function parseCSV(rawText) {
  // Normalize line endings, strip BOM
  const cleaned = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new Error('CSV ist leer oder hat nur eine Kopfzeile.');

  // Trennzeichen erkennen
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers   = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

  // Header-Labels auf keys mappen (case-insensitive, Label, Alias oder key)
  const colMap = {};
  headers.forEach((h, i) => {
    const normalizedHeader = h.toLowerCase();
    const col = CSV_COLUMNS.find(
      c => c.label.toLowerCase() === normalizedHeader ||
           c.key.toLowerCase() === normalizedHeader ||
           c.aliases?.some(alias => alias.toLowerCase() === normalizedHeader)
    );
    if (col) colMap[i] = col.key;
  });

  // Fehlende Pflichtfelder sofort melden
  const missingRequired = CSV_COLUMNS
    .filter(c => c.required)
    .filter(c => !Object.values(colMap).includes(c.key))
    .map(c => c.label);
  if (missingRequired.length)
    throw new Error(`Pflichtfelder fehlen in der CSV: ${missingRequired.join(', ')}`);

  // Datenzeilen parsen (Hinweis-Zeile überspringen)
  const rows = lines.slice(1)
    .filter(l => !l.startsWith('('))
    .map((line, rowIndex) => {
      // Einfaches CSV-Split (kein quoted-field-support nötig für diesen Use-Case)
      const cells = line.split(delimiter);
      const obj   = { _row: rowIndex + 2 }; // +2: 1-basiert + Header
      Object.entries(colMap).forEach(([i, key]) => {
        obj[key] = (cells[i] || '').trim().replace(/^["']|["']$/g, '');
      });
      return obj;
    });

  if (rows.length === 0) throw new Error('Keine Datenzeilen in der CSV gefunden.');
  return rows;
}
