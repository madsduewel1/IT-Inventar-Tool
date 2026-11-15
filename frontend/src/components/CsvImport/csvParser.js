import { CSV_COLUMNS } from './csvTemplate';

function detectDelimiter(text) {
  let semicolons = 0;
  let commas = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && char === ';') {
      semicolons += 1;
    } else if (!inQuotes && char === ',') {
      commas += 1;
    } else if (!inQuotes && char === '\n') {
      break;
    }
  }
  return semicolons >= commas ? ';' : ',';
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((entry) => entry.some((value) => String(value).trim() !== ''));
}

export function parseCSV(rawText) {
  const cleaned = String(rawText || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!cleaned.trim()) throw new Error('CSV ist leer.');

  const delimiter = detectDelimiter(cleaned);
  const parsed = parseDelimited(cleaned, delimiter);
  if (parsed.length < 2) throw new Error('CSV ist leer oder hat nur eine Kopfzeile.');

  const headers = parsed[0].map((header) => header.trim());
  const colMap = {};

  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase();
    const column = CSV_COLUMNS.find(
      (entry) =>
        entry.label.toLowerCase() === normalizedHeader ||
        entry.key.toLowerCase() === normalizedHeader ||
        entry.aliases?.some((alias) => alias.toLowerCase() === normalizedHeader)
    );
    if (column) colMap[index] = column.key;
  });

  const missingRequired = CSV_COLUMNS
    .filter((column) => column.required)
    .filter((column) => !Object.values(colMap).includes(column.key))
    .map((column) => column.label);

  if (missingRequired.length) {
    throw new Error(`Pflichtfelder fehlen in der CSV: ${missingRequired.join(', ')}`);
  }

  const rows = parsed
    .slice(1)
    .filter((cells) => !String(cells[0] || '').trim().startsWith('('))
    .map((cells, rowIndex) => {
      const entry = { _row: rowIndex + 2 };
      Object.entries(colMap).forEach(([index, key]) => {
        entry[key] = String(cells[index] || '').trim();
      });
      return entry;
    });

  if (rows.length === 0) throw new Error('Keine Datenzeilen in der CSV gefunden.');
  return rows;
}
