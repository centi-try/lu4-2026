#!/usr/bin/env node
// Seed realistic raid data: 20 raid bosses, 5 clans, 2 raid cycles (1 open + 1 closed),
// ~30 raid events with distinct evidences, drop items per event, and simulated sales.
// Preserves existing users/characters/items. Reads/writes data_storage.json directly.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data_storage.json');

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}
function randId() {
  return Math.floor(Math.random() * 900000) + 100000;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

// -- 20 Raid Bosses with distinct official images --------------------------
const bossDefs = [
  { name: 'Antharas',         level: 85, img: 'https://static.wikia.nocookie.net/lineage2/images/1/17/Antharas.png' },
  { name: 'Valakas',          level: 85, img: 'https://static.wikia.nocookie.net/lineage2/images/a/ab/Valakas.jpg' },
  { name: 'Baium',            level: 80, img: 'https://static.wikia.nocookie.net/lineage2/images/5/5f/Baium.jpg' },
  { name: 'Queen Ant',        level: 40, img: 'https://static.wikia.nocookie.net/lineage2/images/4/48/Queen_Ant.jpg' },
  { name: 'Orfen',            level: 50, img: 'https://static.wikia.nocookie.net/lineage2/images/0/0d/Orfen.jpg' },
  { name: 'Core',             level: 50, img: 'https://static.wikia.nocookie.net/lineage2/images/e/e2/Core.jpg' },
  { name: 'Frintezza',        level: 85, img: 'https://static.wikia.nocookie.net/lineage2/images/5/5a/Frintezza.jpg' },
  { name: 'Zaken',            level: 60, img: 'https://static.wikia.nocookie.net/lineage2/images/e/e6/Zaken.jpg' },
  { name: 'Lilith',           level: 80, img: 'https://picsum.photos/seed/lilith/400/400' },
  { name: 'Anakim',           level: 80, img: 'https://picsum.photos/seed/anakim/400/400' },
  { name: 'Beleth',           level: 84, img: 'https://picsum.photos/seed/beleth/400/400' },
  { name: 'Tauti',            level: 85, img: 'https://picsum.photos/seed/tauti/400/400' },
  { name: 'Octavis',          level: 85, img: 'https://picsum.photos/seed/octavis/400/400' },
  { name: 'Istina',            level: 95, img: 'https://picsum.photos/seed/istina/400/400' },
  { name: 'Balok',            level: 95, img: 'https://picsum.photos/seed/balok/400/400' },
  { name: 'Ekimus',           level: 83, img: 'https://picsum.photos/seed/ekimus/400/400' },
  { name: 'Freya',            level: 83, img: 'https://picsum.photos/seed/freya/400/400' },
  { name: 'Trasken',          level: 83, img: 'https://picsum.photos/seed/trasken/400/400' },
  { name: 'Spezion',          level: 83, img: 'https://picsum.photos/seed/spezion/400/400' },
  { name: 'Kelbim',           level: 85, img: 'https://picsum.photos/seed/kelbim/400/400' },
];

// -- 5 Clans ---------------------------------------------------------------
const clanDefs = [
  { name: 'Valhalla',      tag: 'VLH', description: 'Clan principal de asalto' },
  { name: 'Shadow Wolves', tag: 'SHW', description: 'Clan de apoyo PvE' },
  { name: 'Dragon Fangs',  tag: 'DRF', description: 'Clan veterano top-tier' },
  { name: 'Iron Brigade',  tag: 'IRB', description: 'Clan de tanques y curación' },
  { name: 'Moon Archers',  tag: 'MNA', description: 'Clan de arqueros y magos' },
];

// -- Drop catalog pool (for variety) ---------------------------------------
const dropCatalog = [
  { name: 'Antharas Earring',       category: 'ACCESORIO', price: 4500 },
  { name: 'Valakas Necklace',       category: 'ACCESORIO', price: 5000 },
  { name: 'Baium Ring',             category: 'ACCESORIO', price: 3800 },
  { name: 'Queen Ant Ring',         category: 'ACCESORIO', price: 1200 },
  { name: 'Orfen Earring',          category: 'ACCESORIO', price: 1500 },
  { name: 'Core Ring',              category: 'ACCESORIO', price: 1100 },
  { name: 'Frintezza Necklace',     category: 'ACCESORIO', price: 4200 },
  { name: 'Zaken Earring',          category: 'ACCESORIO', price: 2200 },
  { name: 'Draconic Leather Armor', category: 'ARMADURA',  price: 6800 },
  { name: 'Major Arcana Robe',      category: 'ARMADURA',  price: 6300 },
  { name: 'Imperial Crusader',      category: 'ARMADURA',  price: 6500 },
  { name: 'Dynasty Breastplate',    category: 'ARMADURA',  price: 5000 },
  { name: 'Vorpal Leather',         category: 'ARMADURA',  price: 5200 },
  { name: 'Infinity Wing',          category: 'ARMA',      price: 7800 },
  { name: 'Dynasty Sword',          category: 'ARMA',      price: 4800 },
  { name: 'Icarus Hammer',          category: 'ARMA',      price: 5600 },
  { name: 'Vesper Retributer',      category: 'ARMA',      price: 6900 },
  { name: 'Elegia Bow',             category: 'ARMA',      price: 7200 },
  { name: 'Top Grade Life Stone',   category: 'MATERIAL',  price:  450 },
  { name: 'Blessed Enchant Armor',  category: 'MATERIAL',  price:  350 },
  { name: 'Blessed Enchant Weapon', category: 'MATERIAL',  price:  900 },
  { name: 'Giant Codex',            category: 'MATERIAL',  price:  250 },
  { name: 'Red Soul Stone',         category: 'MATERIAL',  price:  120 },
];

const dropImgSeeds = ['sword', 'helm', 'armor', 'ring', 'shield', 'bow', 'staff', 'amulet', 'potion', 'crystal', 'scroll', 'gem'];
function dropImageFor(name, idx) {
  const seed = encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-') + '-' + idx);
  return `https://picsum.photos/seed/${seed}/300/300`;
}
function evidenceImageFor(bossName, idx) {
  const seed = encodeURIComponent('evid-' + bossName.toLowerCase().replace(/\s+/g, '-') + '-' + idx);
  return `https://picsum.photos/seed/${seed}/800/500`;
}

// --- Main ------------------------------------------------------------------
const raw = fs.readFileSync(DB_PATH, 'utf-8');
const db = JSON.parse(raw);

// Backup
const backupPath = DB_PATH + '.backup-raid-' + Date.now();
fs.writeFileSync(backupPath, raw);
console.log('Backup created at:', backupPath);

// Reset raid collections
db.raidBosses = [];
db.clans = [];
db.raidCycles = [];
db.raidEvents = [];
db.raidEventClans = [];
db.raidDropItems = [];
db.raidAuditLogs = [];
db.raidSettings = db.raidSettings || [];

// -- Create bosses ---------------------------------------------------------
const bosses = bossDefs.map((b, i) => ({
  id: randId(),
  name: b.name,
  officialImageUrl: b.img,
  level: b.level,
  notes: `Boss ${b.name} nivel ${b.level}`,
  createdAt: nowIso(-86400000 * 7),
  updatedAt: nowIso(-86400000 * 7),
}));
db.raidBosses.push(...bosses);

// -- Create clans ----------------------------------------------------------
const clans = clanDefs.map((c) => ({
  id: randId(),
  name: c.name,
  tag: c.tag,
  description: c.description,
  totalRaidEarnings: 0,
  currentCycleEarnings: 0,
  createdAt: nowIso(-86400000 * 7),
  updatedAt: nowIso(-86400000 * 7),
}));
db.clans.push(...clans);

// -- Cycles: 1 closed (3 days ago) + 1 open (today) ------------------------
const closedCycle = {
  id: randId(),
  label: 'Ciclo de Raids #1',
  type: 'DIARIO',
  status: 'CLOSED',
  startedAt: nowIso(-86400000 * 4),
  closedAt: nowIso(-86400000 * 3),
  closedBy: 'Super Admin',
  totalBosses: 0,
  totalEvents: 0,
  totalRevenue: 0,
  clansParticipated: [],
  bossesKilled: [],
  summary: null,
  createdBy: 1,
  createdAt: nowIso(-86400000 * 4),
  updatedAt: nowIso(-86400000 * 3),
};
const openCycle = {
  id: randId(),
  label: 'Ciclo de Raids #2',
  type: 'DIARIO',
  status: 'OPEN',
  startedAt: nowIso(-86400000 * 1),
  closedAt: null,
  closedBy: null,
  totalBosses: 0,
  totalEvents: 0,
  totalRevenue: 0,
  clansParticipated: [],
  bossesKilled: [],
  summary: null,
  createdBy: 1,
  createdAt: nowIso(-86400000 * 1),
  updatedAt: nowIso(-86400000 * 1),
};
db.raidCycles.push(closedCycle, openCycle);

// Find mappers/admins for reportedByUserId
const reporters = (db.users || [])
  .filter(u => ['super_admin', 'mapper'].includes(u.role))
  .map(u => u.id);
if (reporters.length === 0) reporters.push(1);

// -- Generate events ------------------------------------------------------
// Plan:
//   closedCycle: 15 events (one per boss for first 15 bosses)
//   openCycle:   20 events (covers all 20 bosses at least once)
// Total: 35 events

function generateEventsForCycle(cycle, bossList, baseTimeOffsetMs, countHint) {
  const events = [];
  const n = countHint || bossList.length;
  for (let i = 0; i < n; i++) {
    const boss = bossList[i % bossList.length];
    const participatingClans = pickN(clans, 1 + (i % 3)); // 1..3 clanes
    const clanIds = participatingClans.map(c => c.id);
    const reporterId = reporters[i % reporters.length];
    const evTime = baseTimeOffsetMs + i * 60 * 60 * 1000; // 1h apart
    const event = {
      id: randId(),
      raidBossId: boss.id,
      cycleId: cycle.id,
      evidenceImageUrl: evidenceImageFor(boss.name, i + 1),
      reportedByUserId: reporterId,
      notes: `Evento ${i + 1}: ${boss.name} caído con ${participatingClans.length} clan(es)`,
      createdAt: nowIso(evTime),
      updatedAt: nowIso(evTime),
    };
    db.raidEvents.push(event);
    for (const cid of clanIds) {
      db.raidEventClans.push({
        id: randId(),
        eventId: event.id,
        clanId: cid,
        createdAt: nowIso(evTime),
      });
    }

    // 1-4 drops per event
    const dropCount = 1 + (i % 4);
    const pickedDrops = pickN(dropCatalog, dropCount);
    for (let di = 0; di < pickedDrops.length; di++) {
      const d = pickedDrops[di];
      const qty = 1 + (i % 3);
      const drop = {
        id: randId(),
        eventId: event.id,
        raidBossId: boss.id,
        cycleId: cycle.id,
        name: d.name,
        category: d.category,
        price: d.price,
        quantity: qty,
        quantitySold: 0,
        quantitySoldInCycle: 0,
        imageUrl: dropImageFor(d.name, di),
        status: 'EN_REGISTRO',
        associatedClanIds: clanIds,
        reportedByUserId: reporterId,
        createdAt: nowIso(evTime + di * 60000),
        updatedAt: nowIso(evTime + di * 60000),
      };
      db.raidDropItems.push(drop);
    }
    events.push({ event, clanIds, boss });
  }
  return events;
}

const closedEvents = generateEventsForCycle(
  closedCycle,
  bosses.slice(0, 15),
  -86400000 * 4 + 3600000,
  15
);
const openEvents = generateEventsForCycle(
  openCycle,
  bosses,
  -86400000 * 1 + 3600000,
  20
);

// --- Simulate sales -------------------------------------------------------
// For each event: sell ~60% of drops' units (rounded) so clan earnings populate.
function applySalesForEvents(events, isCurrentCycle) {
  for (const { clanIds } of events) {
    const drops = db.raidDropItems.filter(d => clanIds.every(cid => d.associatedClanIds.includes(cid)));
    // actually simpler: take drops created for this event — but we don't have eventId in scope directly here
  }
}
// Easier: iterate raidDropItems and sell ~60% of quantity per drop
for (const drop of db.raidDropItems) {
  const isClosed = closedEvents.some(e => e.event.id === drop.eventId);
  const qty = drop.quantity;
  // Sell between 50% and 100% of qty (at least 1 when qty>=1)
  const pctBuckets = [0.5, 0.66, 1.0, 0.5, 1.0];
  const pct = pctBuckets[Math.floor(Math.random() * pctBuckets.length)];
  const toSell = Math.max(0, Math.min(qty, Math.round(qty * pct)));
  if (toSell <= 0) continue;

  drop.quantitySold = toSell;
  drop.quantitySoldInCycle = toSell;
  if (toSell >= qty && qty > 0) drop.status = 'VENDIDO';

  const revenue = drop.price * toSell;
  const clanIds = drop.associatedClanIds || [];
  const count = clanIds.length || 1;
  const perClan = Math.floor(revenue / count);
  for (const cid of clanIds) {
    const clan = db.clans.find(c => c.id === cid);
    if (!clan) continue;
    if (isClosed) {
      // Ventas del ciclo cerrado ya migraron a totalRaidEarnings
      clan.totalRaidEarnings = (clan.totalRaidEarnings || 0) + perClan;
    } else {
      clan.currentCycleEarnings = (clan.currentCycleEarnings || 0) + perClan;
    }
  }
}

// --- Finalize closed cycle summary ---------------------------------------
function computeSummaryForCycle(cycle) {
  const eventsInCycle = db.raidEvents.filter(e => e.cycleId === cycle.id);
  const eventIds = new Set(eventsInCycle.map(e => e.id));
  const dropsInCycle = db.raidDropItems.filter(d => eventIds.has(d.eventId));
  const clanLinksInCycle = db.raidEventClans.filter(l => eventIds.has(l.eventId));
  const clanIdsSet = new Set(clanLinksInCycle.map(l => l.clanId));

  const clansParticipated = Array.from(clanIdsSet).map(clanId => {
    const clan = db.clans.find(c => c.id === clanId);
    return {
      clanId,
      clanName: clan?.name || `Clan #${clanId}`,
      eventsParticipated: clanLinksInCycle.filter(l => l.clanId === clanId).length,
      revenueShare: 0,
    };
  });

  const bossCountMap = new Map();
  for (const ev of eventsInCycle) {
    bossCountMap.set(ev.raidBossId, (bossCountMap.get(ev.raidBossId) || 0) + 1);
  }
  const bossesKilled = Array.from(bossCountMap.entries()).map(([bossId, count]) => {
    const boss = db.raidBosses.find(b => b.id === bossId);
    return {
      bossId,
      bossName: boss?.name || `Boss #${bossId}`,
      officialImageUrl: boss?.officialImageUrl || null,
      kills: count,
    };
  });

  // In closed cycle, drops quantitySoldInCycle was reset on close — but since we simulate,
  // we'll use quantitySold to estimate revenue for the closed cycle.
  const totalRevenue = dropsInCycle.reduce(
    (acc, d) => acc + (Number(d.price) || 0) * (Number(d.quantitySold) || 0),
    0
  );
  const totalPotentialValue = dropsInCycle.reduce(
    (acc, d) => acc + (Number(d.price) || 0) * (Number(d.quantity) || 0),
    0
  );

  return {
    clansParticipated,
    bossesKilled,
    totalBosses: bossesKilled.reduce((a, b) => a + b.kills, 0),
    totalEvents: eventsInCycle.length,
    totalRevenue,
    summary: {
      events: eventsInCycle.length,
      drops: dropsInCycle.length,
      bosses: bossesKilled.reduce((a, b) => a + b.kills, 0),
      clans: clansParticipated.length,
      totalRevenue,
      totalPotentialValue,
    },
  };
}

const closedSummary = computeSummaryForCycle(closedCycle);
Object.assign(closedCycle, closedSummary);
// Simulate that the close reset quantitySoldInCycle for drops in closedCycle
const closedEventIds = new Set(closedEvents.map(e => e.event.id));
for (const d of db.raidDropItems) {
  if (closedEventIds.has(d.eventId)) d.quantitySoldInCycle = 0;
}

// Audit logs (for richness)
db.raidAuditLogs.push(
  {
    id: randId(),
    userId: 1,
    action: 'RAID_CYCLE_CREATED',
    details: { cycleId: closedCycle.id, label: closedCycle.label },
    createdAt: closedCycle.startedAt,
  },
  {
    id: randId(),
    userId: 1,
    action: 'RAID_CYCLE_CLOSED',
    details: { cycleId: closedCycle.id, label: closedCycle.label, ...closedCycle.summary },
    createdAt: closedCycle.closedAt,
  },
  {
    id: randId(),
    userId: 1,
    action: 'RAID_CYCLE_CREATED',
    details: { cycleId: openCycle.id, label: openCycle.label },
    createdAt: openCycle.startedAt,
  },
);

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

// Summary
console.log('--- Raid seed summary ---');
console.log('Raid bosses:', db.raidBosses.length);
console.log('Clans:', db.clans.length);
console.log('Raid cycles:', db.raidCycles.length, `(open=${db.raidCycles.filter(c=>c.status==='OPEN').length}, closed=${db.raidCycles.filter(c=>c.status==='CLOSED').length})`);
console.log('Raid events:', db.raidEvents.length);
console.log('Raid drop items:', db.raidDropItems.length);
console.log('Event-Clan links:', db.raidEventClans.length);
console.log();
console.log('Open cycle:', openCycle.label, '—',
  db.raidEvents.filter(e => e.cycleId === openCycle.id).length, 'eventos');
console.log('Closed cycle summary:', closedCycle.summary);
console.log();
console.log('Clan totals:');
for (const c of db.clans) {
  console.log(`  ${c.tag} ${c.name.padEnd(18)}  cycle: $${c.currentCycleEarnings}  total: $${c.totalRaidEarnings}`);
}
