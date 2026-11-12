// Legt einen kompletten Testbetrieb in der Datenbank an:
// Benutzer, Räume, Bereiche, Geräte, Ausleihen, Tickets, Historie, Kommentare.
// Aufruf (aus backend/):  node scripts/seed-test.js
require('dotenv').config({ quiet: true });
const bcrypt = require('bcrypt');
const prisma = require('../src/config/prisma');
const { nextId } = require('../src/services/ids');

const PW = 'Test1234!';
const hash = bcrypt.hashSync(PW, 10);
const now = Date.now();
const days = (n) => new Date(now + n * 86400000);
const past = (n) => new Date(now - n * 86400000);

async function main() {
  const devCount = await prisma.device.count();
  if (devCount > 0) {
    console.log(`Übersprungen: ${devCount} Geräte vorhanden (Seed nur einmal ausführen).`);
    return;
  }

  // ── Benutzer ───────────────────────────────────────────────────────────────
  const mkUser = async (username, email, displayName, role) =>
    prisma.user.create({
      data: {
        id: await nextId('user'),
        username, email, displayName, role,
        passwordHash: hash,
        ssoGroups: '[]'
      }
    });

  const itMeyer = await mkUser('it.meyer', 'it.meyer@test.local', 'M. Meyer', 'STAFF');
  const itKoch = await mkUser('it.koch', 'it.koch@test.local', 'K. Koch', 'STAFF');
  const schmidt = await mkUser('lehrer.schmidt', 'schmidt@test.local', 'S. Schmidt', 'VIEWER');
  const mueller = await mkUser('lehrer.mueller', 'mueller@test.local', 'M. Müller', 'VIEWER');
  const fischer = await mkUser('schueler.fischer', 'fischer@test.local', 'L. Fischer', 'VIEWER');
  const weber = await mkUser('sekretariat.weber', 'weber@test.local', 'W. Weber', 'VIEWER');

  // ── Räume ──────────────────────────────────────────────────────────────────
  const mkRoom = async (name, building, type, description) =>
    prisma.room.create({ data: { id: await nextId('room'), name, building, type, description } });

  const rA101 = await mkRoom('A101 Informatikraum', 'A', 'CLASSROOM', 'Klassenarbeit- und Informatikraum');
  const rA102 = await mkRoom('A102 Medienraum', 'A', 'STUDIO', 'Medienproduktion / iPad-Koffer');
  const rB210 = await mkRoom('B210 IT-Büro', 'B', 'OTHER', 'IT-Betrieb und Reparatur');
  const rC001 = await mkRoom('C001 Serverraum', 'C', 'SERVERROOM', 'Rack und Netzwerkverteiler');
  const rLag = await mkRoom('LAG-01 Lager', 'L', 'STORAGE', 'Gerätelager');

  // ── Bereiche ───────────────────────────────────────────────────────────────
  const mkArea = async (name, roomId, description, lend = true, indiv = true) =>
    prisma.area.create({
      data: { id: await nextId('area'), name, description, roomId, lendEnabled: lend, individualManagement: indiv }
    });

  const aIpad = await mkArea('Klasse 5a iPads', rA102.id, 'Koffer iPads für Klasse 5a');
  const aMobile = await mkArea('Mobile PCs Klasse 8', rA101.id, 'Laptops für mobile Arbeit');
  const aSeminar = await mkArea('Seminar Technik', rB210.id, 'Ausstattung Seminar', true, false);

  // Mitglieder/Bearbeiter (nur STAFF/ADMIN)
  for (const area of [aIpad, aMobile, aSeminar]) {
    for (const user of [itMeyer, itKoch]) {
      await prisma.areaMember.create({ data: { areaId: area.id, userId: user.id } });
    }
    await prisma.areaEditor.create({ data: { areaId: area.id, userId: itMeyer.id } });
  }

  // ── Geräte ─────────────────────────────────────────────────────────────────
  const mkDevice = async (d) => prisma.device.create({ data: { labels: '[]', images: '[]', ...d } });

  const d1 = await mkDevice({
    inventoryId: 'INV-0001', manufacturer: 'Lenovo', model: 'ThinkPad T14', category: 'LAPTOP',
    hostname: 'thinkpad-t14-01', status: 'AVAILABLE', isLendable: true, isReportable: true,
    roomId: rA101.id, areaId: aMobile.id, adminId: itMeyer.id,
    ipAddress: '192.168.10.11', macAddress: 'AA:BB:CC:00:00:11', visibility: 'ALL',
    serialNumber: 'PF1T14X', purchaseDate: past(400), warrantyEnd: days(700)
  });
  const d2 = await mkDevice({
    inventoryId: 'INV-0002', manufacturer: 'Dell', model: 'Latitude 5440', category: 'LAPTOP',
    hostname: 'latitude-5440-02', status: 'LOANED', isLendable: true, isReportable: true,
    roomId: rA101.id, areaId: aMobile.id, adminId: itMeyer.id,
    ipAddress: '192.168.10.12', macAddress: 'AA:BB:CC:00:00:12', visibility: 'ALL',
    serialNumber: 'DL5440X'
  });
  const d3 = await mkDevice({
    inventoryId: 'INV-0003', manufacturer: 'Apple', model: 'iPad 10', category: 'TABLET',
    hostname: 'ipad-10-03', status: 'AVAILABLE', isLendable: true, isReportable: true,
    roomId: rA102.id, areaId: aIpad.id, adminId: itKoch.id, visibility: 'ALL',
    serialNumber: 'DMP10X'
  });
  const d4 = await mkDevice({
    inventoryId: 'INV-0004', manufacturer: 'Apple', model: 'iPad 10', category: 'TABLET',
    hostname: 'ipad-10-04', status: 'LOANED', isLendable: true, isReportable: true,
    roomId: rA102.id, areaId: aIpad.id, adminId: itKoch.id, visibility: 'ALL',
    serialNumber: 'DMP10Y'
  });
  const d5 = await mkDevice({
    inventoryId: 'INV-0005', manufacturer: 'HP', model: 'EliteDesk 800', category: 'DESKTOP',
    hostname: 'ed800-05', status: 'AVAILABLE', isLendable: false, isReportable: true,
    roomId: rA101.id, adminId: itMeyer.id, ipAddress: '192.168.10.15', visibility: 'ALL'
  });
  const d6 = await mkDevice({
    inventoryId: 'INV-0006', manufacturer: 'Lenovo', model: 'ThinkCentre M70q', category: 'DESKTOP',
    hostname: 'm70q-06', status: 'DEFECT', isLendable: false, isReportable: true,
    roomId: rA101.id, adminId: itMeyer.id, ipAddress: '192.168.10.16', visibility: 'ALL'
  });
  const d7 = await mkDevice({
    inventoryId: 'INV-0007', manufacturer: 'Brother', model: 'HL-L2350DW', category: 'PRINTER',
    hostname: 'hll2350-07', status: 'AVAILABLE', isLendable: false, isReportable: true,
    roomId: rB210.id, adminId: itKoch.id, ipAddress: '192.168.10.17', visibility: 'ALL'
  });
  const d8 = await mkDevice({
    inventoryId: 'INV-0008', manufacturer: 'Cisco', model: 'Catalyst C9200', category: 'SWITCH',
    hostname: 'c9200-08', status: 'AVAILABLE', isLendable: false, isReportable: true,
    roomId: rC001.id, adminId: itMeyer.id, ipAddress: '192.168.1.2', visibility: 'STAFF'
  });
  const d9 = await mkDevice({
    inventoryId: 'INV-0009', manufacturer: 'Epson', model: 'EB-685W', category: 'PROJECTOR',
    hostname: 'eb685w-09', status: 'MAINTENANCE', isLendable: false, isReportable: true,
    roomId: rA102.id, adminId: itKoch.id, visibility: 'ALL'
  });
  const d10 = await mkDevice({
    inventoryId: 'INV-0010', manufacturer: 'Samsung', model: 'Galaxy Tab A8', category: 'TABLET',
    hostname: 'tab-a8-10', status: 'LIMITED', isLendable: true, isReportable: true,
    roomId: rA102.id, areaId: aIpad.id, adminId: itKoch.id, visibility: 'ALL'
  });

  // ── Ausleihen ──────────────────────────────────────────────────────────────
  const mkLoan = async (d) => prisma.loan.create({ data: { id: await nextId('loan'), ...d } });
  const mkLoanHistory = (deviceId, action, userId, details) =>
    prisma.deviceHistory.create({ data: { deviceId, action, userId, details } });

  // Aktive Ausleihe
  const l1 = await mkLoan({
    deviceId: d2.id, userId: schmidt.id, areaId: aMobile.id,
    borrowerName: 'S. Schmidt', borrowerContact: 'schmidt@test.local', borrowerGroup: 'Lehrer',
    startDate: past(3), dueDate: days(11), status: 'ACTIVE',
    notes: 'Klassenarbeit Laptops', requestReason: 'Klausurvorbereitung'
  });
  await mkLoanHistory(d2.id, 'loaned', itMeyer.id, l1.id);

  // Überfällige Ausleihe
  const l2 = await mkLoan({
    deviceId: d4.id, userId: mueller.id, areaId: aIpad.id,
    borrowerName: 'M. Müller', borrowerContact: 'mueller@test.local', borrowerGroup: 'Lehrer',
    startDate: past(30), dueDate: days(-5), status: 'OVERDUE',
    requestReason: 'Projektwoche'
  });
  await mkLoanHistory(d4.id, 'loaned', itKoch.id, l2.id);

  // Offene Modellanfrage
  const l3 = await mkLoan({
    deviceId: null, userId: fischer.id, areaId: aMobile.id,
    requestedCategory: 'LAPTOP', requestedModel: 'MacBook Air',
    borrowerName: 'L. Fischer', borrowerContact: 'fischer@test.local', borrowerGroup: 'Schüler',
    startDate: days(2), dueDate: days(30), status: 'REQUESTED',
    requestReason: 'Referat / Medienprojekt'
  });

  // Abgeschlossene (zurückgegebene) Ausleihe
  const l4 = await mkLoan({
    deviceId: d1.id, userId: schmidt.id, areaId: aMobile.id,
    borrowerName: 'S. Schmidt', borrowerContact: 'schmidt@test.local', borrowerGroup: 'Lehrer',
    startDate: past(20), dueDate: past(6), returnDate: past(6), status: 'RETURNED',
    requestReason: 'Schulung'
  });
  await mkLoanHistory(d1.id, 'returned', itMeyer.id, l4.id);

  // Anfrage in Diskussion
  const l5 = await mkLoan({
    deviceId: null, userId: mueller.id, areaId: aIpad.id,
    requestedCategory: 'TABLET', requestedModel: 'iPad',
    borrowerName: 'M. Müller', borrowerContact: 'mueller@test.local', borrowerGroup: 'Lehrer',
    startDate: days(5), dueDate: days(12), status: 'DISCUSSION_REQUESTED',
    requestReason: 'AG Robotik',
    decisionMessage: 'Bitte anderen Zeitraum vorschlagen – Gerät ist dann reserviert.',
    decidedAt: past(1), decidedById: itMeyer.id
  });

  // ── Tickets ────────────────────────────────────────────────────────────────
  const mkIssue = async (o) => {
    const { activities = [], comments = [], extraDevices = [], assignees = [], ...data } = o;
    return prisma.deviceIssue.create({
      data: {
        id: await nextId('issue'),
        attachments: '[]',
        ...data,
        extraDevices: extraDevices.length ? { create: extraDevices.map((id) => ({ deviceId: id })) } : undefined,
        assignments: assignees.length ? { create: assignees.map((id) => ({ userId: id })) } : undefined,
        activities: activities.length ? { create: activities } : undefined,
        comments: comments.length ? { create: comments } : undefined
      }
    });
  };
  const CREATED = (userId, details = 'Ticket erstellt') => ({ userId, action: 'CREATED', details });

  // T1 – Defektes Gerät (HIGH → DEFECT), führendes Gerät INV-0006
  const t1 = await mkIssue({
    type: 'DEVICE', deviceId: d6.id, roomId: rA101.id,
    reporterId: schmidt.id, assigneeId: itMeyer.id,
    title: 'Rechner startet nicht nach Stromausfall',
    description: 'Nach Stromausfall bleibt das Gerät schwarz. LED blinkt dreimal.',
    priority: 'HIGH', status: 'OPEN',
    extraDevices: [d5.id],
    assignees: [itMeyer.id],
    activities: [CREATED(schmidt.id)],
    comments: [{ userId: itMeyer.id, text: 'Netzteil getauscht, Test läuft.', createdAt: past(1) }]
  });
  await mkLoanHistory(d6.id, 'issue_reported', schmidt.id, t1.title);

  // T2 – Eingeschränktes iPad (NORMAL → LIMITED)
  const t2 = await mkIssue({
    type: 'DEVICE', deviceId: d10.id, roomId: rA102.id, areaId: aIpad.id,
    reporterId: mueller.id, assigneeId: itKoch.id,
    title: 'Bildschirm reagiert nicht auf Berührung',
    description: 'Halbe Bildschirmfläche reagiert nicht mehr.',
    priority: 'NORMAL', status: 'IN_PROGRESS',
    assignees: [itKoch.id],
    activities: [CREATED(mueller.id), { userId: itKoch.id, action: 'STATUS', details: 'Status auf „In Bearbeitung“ gesetzt' }]
  });
  await mkLoanHistory(d10.id, 'issue_reported', mueller.id, t2.title);

  // T3 – WLAN in einem Raum
  await mkIssue({
    type: 'WLAN', roomId: rA101.id,
    reporterId: fischer.id, assigneeId: itMeyer.id,
    title: 'Kein WLAN in A101',
    description: 'Das Schul-WLAN ist in A101 seit heute Morgen nicht erreichbar.',
    priority: 'NORMAL', status: 'OPEN',
    assignees: [itMeyer.id],
    activities: [CREATED(fischer.id)]
  });

  // T4 – Software-Problem
  await mkIssue({
    type: 'SOFTWARE', softwareName: 'LibreOffice',
    reporterId: weber.id, assigneeId: itKoch.id,
    title: 'LibreOffice startet nicht nach Update',
    description: 'Nach dem Update erscheint nur noch ein Fehlerdialog beim Start.',
    priority: 'LOW', status: 'WAITING',
    assignees: [itKoch.id],
    activities: [CREATED(weber.id), { userId: itKoch.id, action: 'STATUS', details: 'Status auf „Wartet“ gesetzt' }]
  });

  // T5 – Geschlossenes Ticket auf verfügbarem Gerät
  const t5 = await mkIssue({
    type: 'DEVICE', deviceId: d1.id, roomId: rA101.id, areaId: aMobile.id,
    reporterId: schmidt.id, assigneeId: itMeyer.id,
    title: 'Druckerfreigabe fehlt nach Update',
    description: 'Drucker wird in den Anwendungen nicht mehr angeboten.',
    priority: 'LOW', status: 'CLOSED',
    resolution: 'Druckertreiber neu installiert und Freigabe erneuert.',
    assignees: [itMeyer.id],
    activities: [CREATED(schmidt.id), { userId: itMeyer.id, action: 'CLOSED', details: 'Ticket gelöst' }]
  });
  await mkLoanHistory(d1.id, 'issue_reported', schmidt.id, t5.title);

  // T6 – Persönliches Problem (ohne Gerät)
  await mkIssue({
    type: 'PERSONAL',
    reporterId: fischer.id, assigneeId: itMeyer.id,
    title: 'Anmeldung mit Schul-Account schlägt fehl',
    description: 'Nach dem Schulwechsel kann ich mich nicht mehr anmelden.',
    priority: 'NORMAL', status: 'OPEN',
    assignees: [itMeyer.id],
    activities: [CREATED(fischer.id)]
  });

  // ── Ticketart-Zuständigkeiten ─────────────────────────────────────────────
  for (const type of ['WLAN', 'SOFTWARE']) {
    await prisma.issueTypeEditor.create({ data: { type, userId: itMeyer.id } });
    await prisma.issueTypeMember.create({ data: { type, userId: itKoch.id } });
  }

  // ── Zusammenfassung ────────────────────────────────────────────────────────
  const [u, r, a, dev, lo, iss] = await Promise.all([
    prisma.user.count(), prisma.room.count(), prisma.area.count(),
    prisma.device.count(), prisma.loan.count(), prisma.deviceIssue.count()
  ]);
  console.log('Testbetrieb angelegt:');
  console.log(`  Benutzer: ${u}  Räume: ${r}  Bereiche: ${a}`);
  console.log(`  Geräte:   ${dev}  Ausleihen: ${lo}  Tickets: ${iss}`);
  console.log(`  Login:    testadmin / ${PW}  (und weitere unter Angabe gleichen Passwortes)`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
