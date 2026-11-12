// Datenmigrationen, die nach `prisma db push` ausgeführt werden
// (Aufruf aus scripts/migrate.js und installer/update.sh).
//
// 1. Ticket-Prioritäten (Konzept „Mein Gerät", Abschnitte 16–19):
//    Früher machten HOHE und KRITISCHE Tickets ein Gerät defekt, künftig nur
//    noch KRITISCHE. Gespeicherte Einstellungen, die noch dem alten Standard
//    entsprechen, werden auf den neuen Standard umgestellt. Danach werden alle
//    Gerätezustände neu berechnet (betroffen: Geräte, die nur wegen eines
//    „Störend"-Tickets defekt waren – sie werden „Eingeschränkt").
const prisma = require('../src/config/prisma');

const OLD_DEFECT = 'HIGH,CRITICAL';
const NEW_DEFECT = 'CRITICAL';
const OLD_RESTRICTED = 'LOW,NORMAL';
const NEW_RESTRICTED = 'LOW,NORMAL,HIGH';

async function migrateTicketPriorities() {
  const updates = [
    { key: 'tickets.defectPriorities', from: OLD_DEFECT, to: NEW_DEFECT },
    { key: 'tickets.restrictedPriorities', from: OLD_RESTRICTED, to: NEW_RESTRICTED }
  ];

  for (const entry of updates) {
    const setting = await prisma.setting.findUnique({ where: { key: entry.key } });
    if (!setting) continue;
    if (String(setting.value).trim().toUpperCase() !== entry.from) continue;
    await prisma.setting.update({ where: { key: entry.key }, data: { value: entry.to } });
    console.log(`  ${entry.key}: ${entry.from} -> ${entry.to}`);
  }
}

async function resyncDeviceConditions() {
  const { syncDeviceConditions } = require('../src/services/deviceCondition');
  const devices = await prisma.device.findMany({ select: { id: true } });
  const changes = await syncDeviceConditions(devices.map((device) => device.id));
  if (changes.size > 0) {
    console.log(`  Gerätezustände aktualisiert: ${changes.size}`);
    for (const [deviceId, status] of changes) {
      console.log(`    ${deviceId} -> ${status}`);
    }
  } else {
    console.log('  Keine Gerätezustände zu ändern.');
  }
}

// Ausleihen, die ohne Bereich angelegt wurden, erhalten den Bereich ihres
// zugewiesenen Geräts (Fix Ausleihe-Bereiche, Bereichs-Anzeige in Loans).
async function backfillLoanAreas() {
  const loans = await prisma.loan.findMany({
    where: { areaId: null, deviceId: { not: null } },
    select: { id: true, deviceId: true }
  });
  if (loans.length === 0) return;

  const devices = await prisma.device.findMany({
    where: { id: { in: loans.map((loan) => loan.deviceId) }, areaId: { not: null } },
    select: { id: true, areaId: true }
  });
  const areaByDevice = new Map(devices.map((device) => [device.id, device.areaId]));

  let updated = 0;
  for (const loan of loans) {
    const areaId = areaByDevice.get(loan.deviceId);
    if (!areaId) continue;
    await prisma.loan.update({ where: { id: loan.id }, data: { areaId } });
    updated += 1;
  }
  if (updated > 0) console.log(`  Ausleihen ohne Bereich mit Gerätebereich verknüpft: ${updated}`);
}

(async () => {
  console.log('Führe Datenmigrationen aus...');
  try {
    console.log('Ticket-Prioritäten prüfen:');
    await migrateTicketPriorities();
    console.log('Gerätezustände neu berechnen:');
    await resyncDeviceConditions();
    console.log('Ausleihen-Bereiche nachziehen:');
    await backfillLoanAreas();
    console.log('Datenmigration abgeschlossen.');
  } catch (error) {
    console.error('Datenmigration fehlgeschlagen:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
