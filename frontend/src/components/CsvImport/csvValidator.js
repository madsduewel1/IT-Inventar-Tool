import { CSV_COLUMNS } from './csvTemplate';

/**
 * Validiert ein Array geparster Zeilen.
 * Gibt jede Zeile mit _errors, _warnings und _status zurück.
 * @param {object[]} rows - Geparste Zeilen
 * @param {(string|object)[]} existingDevices - Bereits vorhandene Geräte oder Inventarnummern
 */
export function validateRows(rows, existingDevices = []) {
  const seenInventoryIds = new Set();
  const seenDeviceIds = new Set();
  const results = [];

  existingDevices.forEach((entry) => {
    if (typeof entry === 'string') {
      seenInventoryIds.add(entry);
      return;
    }
    if (entry?.inventoryId) seenInventoryIds.add(entry.inventoryId);
    if (entry?.id) seenDeviceIds.add(entry.id);
  });

  rows.forEach(row => {
    const errors   = [];
    const warnings = [];

    CSV_COLUMNS.forEach(col => {
      const val = (row[col.key] || '').trim();

      if (col.required && !val) {
        errors.push({ field: col.key, msg: `"${col.label}" ist ein Pflichtfeld.` });
      } else if (val && !col.validate(val)) {
        errors.push({ field: col.key, msg: col.errorMsg });
      }
    });

    // Duplikat-Prüfung innerhalb der Datei + gegenüber bestehenden IDs
    if (row.id) {
      const normId = row.id.trim();
      if (seenDeviceIds.has(normId)) {
        errors.push({ field: 'id', msg: `Geräte-ID "${normId}" existiert bereits.` });
      } else {
        seenDeviceIds.add(normId);
      }
    }

    if (row.inventoryId) {
      const normId = row.inventoryId.trim();
      if (seenInventoryIds.has(normId)) {
        errors.push({ field: 'inventoryId', msg: `Inventarnummer "${normId}" existiert bereits.` });
      } else {
        seenInventoryIds.add(normId);
      }
    }

    // Soft-Warnings (nicht blockierend)
    if (!row.serialNumber) warnings.push({ field: 'serialNumber', msg: 'Keine Seriennummer angegeben.' });
    if (!row.ipAddress) warnings.push({ field: 'ipAddress', msg: 'Keine IP-Adresse angegeben.' });
    if (!row.macAddress) warnings.push({ field: 'macAddress', msg: 'Keine MAC-Adresse angegeben.' });
    if (!row.roomId && !row.roomName) warnings.push({ field: 'roomId', msg: 'Kein Raum zugewiesen.' });

    results.push({
      ...row,
      _errors:   errors,
      _warnings: warnings,
      _status:   errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
    });
  });

  return results;
}
