const prisma = require('../config/prisma');

// In-Memory-Cache für häufig gelesene Einstellungen, damit nicht jede Anfrage
// eine DB-Query auslöst. Wird beim Speichern via settings.js gezielt invalidiert.
const cache = new Map();
const DEFAULT_TTL_MS = 30 * 1000;

async function getSettingCached(key, ttlMs = DEFAULT_TTL_MS) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value;
  }
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    const value = row?.value ?? '';
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } catch {
    return entry ? entry.value : '';
  }
}

function invalidateSetting(key) {
  cache.delete(key);
}

module.exports = { getSettingCached, invalidateSetting };
