const prisma = require('../config/prisma');
const { nextId } = require('./ids');

// Sucht einen Raum anhand des Namens und legt ihn bei Bedarf an.
// Wird für freie Raumeingaben bei WLAN-Tickets verwendet: Es muss kein
// vorher angelegter Raum ausgewählt werden, ein beliebiger Raumname reicht.
async function findByOrCreateRoom(name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const existing = await prisma.room.findFirst({ where: { name: clean } });
  if (existing) return existing;
  return prisma.room.create({
    data: { id: await nextId('room'), name: clean, type: 'OTHER' }
  });
}

module.exports = { findByOrCreateRoom };