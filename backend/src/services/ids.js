const prisma = require('../config/prisma');

// Sprechende IDs: <Kürzel>-<laufende Nummer>, z. B. u-198, r-848, l-12, t-5, w-3, k-2
// Geräte sind bewusst NICHT hier – sie verwenden weiterhin ihre numerische Geräte-ID.
const SEQUENCE_KEYS = {
  user: 'u',
  room: 'r',
  loan: 'l',
  issue: 't',
  update: 'w',
  apiKey: 'k',
  area: 'b'
};

async function nextId(entity) {
  const prefix = SEQUENCE_KEYS[entity];
  if (!prefix) {
    throw new Error(`Unbekannter ID-Typ: ${entity}`);
  }
  const sequence = await prisma.sequence.upsert({
    where: { key: prefix },
    update: { value: { increment: 1 } },
    create: { key: prefix, value: 1 }
  });
  return `${prefix}-${sequence.value}`;
}

module.exports = { nextId, SEQUENCE_KEYS };
