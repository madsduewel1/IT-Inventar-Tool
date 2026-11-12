function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCsv(filename, headers, rows) {
  const lines = [headers.map(csvCell).join(';')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => csvCell(row[h])).join(';'));
  });
  // UTF-8 BOM, damit Excel Umlaute korrekt darstellt.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}