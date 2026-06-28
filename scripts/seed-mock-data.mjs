#!/usr/bin/env node
// Seed mock data: 10 users with varied roles, characters, 20 items assigned to characters.
// Preserves the existing super_admin user. Reads/writes data_storage.json directly.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data_storage.json');

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function nowIso() { return new Date().toISOString(); }
function randId() { return Math.floor(Math.random() * 900000) + 100000; }

const DEFAULT_PWD = 'Password123!';
const pwdHash = sha256(DEFAULT_PWD);

// --- Users definition ------------------------------------------------------
// runtime roles normalize to: super_admin | mapper | user
// raid access levels:          raid_admin | raid_mapper | raid_user | viewer_only
const userDefs = [
  // NOTE: lucia/mateo are RAID admins (not system super_admin) — the server's
  // normalizeUser rewrites any super_admin user's email to the default, which
  // would collapse them into the single superadmin@inventory.com row on load.
  { email: 'lucia.admin@inventory.com',     name: 'Lucía Admin',      role: 'user',        raid: 'raid_admin' },
  { email: 'mateo.admin@inventory.com',     name: 'Mateo Admin',      role: 'user',        raid: 'raid_admin' },
  { email: 'sofia.mapper@inventory.com',    name: 'Sofía Mapper',     role: 'mapper',      raid: 'raid_mapper' },
  { email: 'tomas.mapper@inventory.com',    name: 'Tomás Mapper',     role: 'mapper',      raid: 'raid_mapper' },
  { email: 'valeria.mapper@inventory.com',  name: 'Valeria Mapper',   role: 'mapper',      raid: 'viewer_only' },
  { email: 'diego.user@inventory.com',      name: 'Diego Usuario',    role: 'user',        raid: 'raid_user' },
  { email: 'camila.user@inventory.com',     name: 'Camila Usuario',   role: 'user',        raid: 'raid_user' },
  { email: 'santiago.user@inventory.com',   name: 'Santiago Usuario', role: 'user',        raid: 'viewer_only' },
  { email: 'paula.user@inventory.com',      name: 'Paula Usuario',    role: 'user',        raid: null },
  { email: 'bruno.user@inventory.com',      name: 'Bruno Usuario',    role: 'user',        raid: null },
];

// --- Items definition ------------------------------------------------------
const CATS = ['ARMA', 'ARMADURA', 'ACCESORIO', 'CONSUMIBLE', 'MATERIAL'];
const itemDefs = [
  { name: 'Espada de Hielo +7',     category: 'ARMA',       price: 1500, quantity: 2 },
  { name: 'Arco Élfico +5',         category: 'ARMA',       price: 1200, quantity: 3 },
  { name: 'Daga de Obsidiana',      category: 'ARMA',       price:  900, quantity: 4 },
  { name: 'Maza Rúnica',            category: 'ARMA',       price: 1100, quantity: 2 },
  { name: 'Bastón del Oráculo',     category: 'ARMA',       price: 1700, quantity: 1 },
  { name: 'Armadura de Dragón',     category: 'ARMADURA',   price: 2500, quantity: 1 },
  { name: 'Coraza de Mithril',      category: 'ARMADURA',   price: 2100, quantity: 2 },
  { name: 'Casco de Guerra',        category: 'ARMADURA',   price:  800, quantity: 3 },
  { name: 'Guanteletes Rúnicos',    category: 'ARMADURA',   price:  950, quantity: 2 },
  { name: 'Escudo de Acero',        category: 'ARMADURA',   price:  700, quantity: 4 },
  { name: 'Anillo de Poder',        category: 'ACCESORIO',  price: 1800, quantity: 2 },
  { name: 'Amuleto del Sabio',      category: 'ACCESORIO',  price: 1400, quantity: 2 },
  { name: 'Capa del Viento',        category: 'ACCESORIO',  price:  850, quantity: 3 },
  { name: 'Botas Aladas',           category: 'ACCESORIO',  price: 1000, quantity: 2 },
  { name: 'Poción de Vida Mayor',   category: 'CONSUMIBLE', price:  150, quantity: 20 },
  { name: 'Poción de Maná',         category: 'CONSUMIBLE', price:  120, quantity: 25 },
  { name: 'Elixir de Fuerza',       category: 'CONSUMIBLE', price:  300, quantity: 10 },
  { name: 'Lingote de Adamantium',  category: 'MATERIAL',   price:  600, quantity: 8 },
  { name: 'Cristal Arcano',         category: 'MATERIAL',   price:  450, quantity: 12 },
  { name: 'Piel de Grifo',          category: 'MATERIAL',   price:  550, quantity: 6 },
];

// --- Main ------------------------------------------------------------------
const raw = fs.readFileSync(DB_PATH, 'utf-8');
const db = JSON.parse(raw);

// Backup
const backupPath = DB_PATH + '.backup-' + Date.now();
fs.writeFileSync(backupPath, raw);
console.log('Backup created at:', backupPath);

// Keep existing super_admin (the one with email superadmin@inventory.com)
const keepSuper = (db.users || []).filter(u => u.email === 'superadmin@inventory.com');
if (keepSuper.length === 0) {
  console.warn('WARN: original super admin not found, it will be recreated on server boot');
}

// Reset lists (solo data legacy; raid se maneja en seed-raid-data.mjs)
db.users = [...keepSuper];
db.characters = [];
db.items = [];
db.userRaidAccess = [];
db.purchases = [];
db.salesCycles = [];
db.auditLogs = [];

const createdUsers = [];
for (const u of userDefs) {
  const id = randId();
  const openId = `local-${u.email}`;
  const user = {
    id,
    email: u.email,
    openId,
    name: u.name,
    characterName: u.name,
    displayName: u.name,
    username: u.email,
    role: u.role,              // normalizeRole will keep super_admin/mapper/user
    loginMethod: 'local',
    isActive: true,
    passwordHash: pwdHash,
    characterId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastSignedIn: null,
  };
  db.users.push(user);
  createdUsers.push({ ...u, id });

  if (u.raid) {
    db.userRaidAccess.push({
      id: randId(),
      userId: id,
      accessLevel: u.raid,
      grantedBy: 1,
      grantedAt: nowIso(),
    });
  }
}

// Characters: create one for each non-super-admin user (so 8 characters)
const charIdsByUser = {};
for (const u of createdUsers) {
  if (u.role === 'super_admin') continue;
  const charName = u.name.split(' ')[0] + ' ' + u.role[0].toUpperCase() + u.role.slice(1);
  const ch = {
    id: randId(),
    name: charName,
    userId: u.id,
    profitPerCycle: 0,
    totalProfit: 0,
    currentCycleEarnings: 0,
    createdAt: nowIso(),
  };
  db.characters.push(ch);
  charIdsByUser[u.id] = ch.id;
}

// Add 2 extra "shared" characters not tied to a user (for variety)
const sharedChar1 = { id: randId(), name: 'Guild Storage A', userId: createdUsers[0].id, profitPerCycle: 0, totalProfit: 0, currentCycleEarnings: 0, createdAt: nowIso() };
const sharedChar2 = { id: randId(), name: 'Guild Storage B', userId: createdUsers[1].id, profitPerCycle: 0, totalProfit: 0, currentCycleEarnings: 0, createdAt: nowIso() };
db.characters.push(sharedChar1, sharedChar2);

const allCharIds = db.characters.map(c => c.id);
const mapperIds = createdUsers.filter(u => u.role === 'mapper').map(u => u.id);
const fallbackMapper = mapperIds[0] || createdUsers[0].id;

// Items: each item assigned to 1-3 random characters
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

for (let i = 0; i < itemDefs.length; i++) {
  const d = itemDefs[i];
  const assocCount = 1 + (i % 3);                       // 1, 2 or 3
  const assoc = pickN(allCharIds, assocCount);
  const mapperId = mapperIds[i % Math.max(mapperIds.length, 1)] || fallbackMapper;
  // Patrón de ventas variado: algunos items sin vender, otros con varias unidades
  const soldPattern = [0, 1, 0, 2, 1, 0, 1, 0, 3, 1, 0, 2, 0, 1, 5, 0, 3, 2, 4, 1];
  const sold = Math.min(soldPattern[i] || 0, d.quantity);
  const item = {
    id: randId(),
    name: d.name,
    category: d.category,
    status: sold >= d.quantity ? 'VENDIDO' : 'CONFIRMED',
    price: d.price,
    mapperId,
    imageUrl: null,
    quantity: d.quantity,
    quantitySold: sold,
    quantitySoldInCycle: sold,
    associatedCharacterIds: assoc,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.items.push(item);

  if (sold > 0) {
    // bump earnings on associated characters
    const earningsPerChar = Math.floor((item.price * sold) / Math.max(assoc.length, 1));
    for (const cid of assoc) {
      const c = db.characters.find(x => x.id === cid);
      if (c) {
        c.currentCycleEarnings = (c.currentCycleEarnings || 0) + earningsPerChar;
        c.totalProfit = (c.totalProfit || 0) + earningsPerChar;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Purchases + Sales Cycles históricos (legacy module)
// ---------------------------------------------------------------------------
// Construimos 2 ciclos cerrados (un DIARIO + un SEMANAL) a partir de las ventas
// persistidas en items. Además registramos `purchases` coherentes.
function hoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

const buyers = db.characters.filter(c => !c.name.startsWith('Guild Storage'));
function pickBuyer(idx) { return buyers[idx % buyers.length]; }

// Registrar una compra histórica por cada unidad vendida en items seed
let purchaseIdx = 0;
const historicalPurchases = [];
for (const it of db.items) {
  if ((it.quantitySold || 0) > 0) {
    for (let u = 0; u < it.quantitySold; u++) {
      const buyer = pickBuyer(purchaseIdx);
      historicalPurchases.push({
        id: String(randId()),
        itemId: String(it.id),
        itemName: it.name,
        buyerId: String(buyer.id),
        buyerName: buyer.name,
        quantity: 1,
        price: it.price,
        total: it.price,
        createdAt: hoursAgo(48 + purchaseIdx), // distribuidas en el pasado
      });
      purchaseIdx++;
    }
  }
}
db.purchases = historicalPurchases;

// --- Ciclo SEMANAL cerrado ---------------------------------------------------
// Contiene ~70% de las ventas históricas; items vendidos antes del cierre.
const halfCount = Math.floor(historicalPurchases.length * 0.65);
const semanalSoldPurchases = historicalPurchases.slice(0, halfCount);
const diarioSoldPurchases = historicalPurchases.slice(halfCount);

function buildCycle({ type, label, purchases: sPur, startedHoursAgo, closedHoursAgo, closedBy }) {
  const revenuePerChar = {}; // characterId -> earnings
  const soldItemsMap = {};   // itemId -> {qty, revenue}

  for (const p of sPur) {
    soldItemsMap[p.itemId] = soldItemsMap[p.itemId] || { qty: 0, revenue: 0 };
    soldItemsMap[p.itemId].qty += p.quantity;
    soldItemsMap[p.itemId].revenue += p.total;

    const item = db.items.find(i => String(i.id) === p.itemId);
    if (!item) continue;
    const assoc = item.associatedCharacterIds || [];
    const share = Math.floor(p.total / Math.max(assoc.length, 1));
    for (const cid of assoc) {
      revenuePerChar[cid] = (revenuePerChar[cid] || 0) + share;
    }
  }

  const soldItems = Object.entries(soldItemsMap).map(([itemId, v]) => {
    const item = db.items.find(i => String(i.id) === itemId);
    if (!item) return null;
    const assoc = (item.associatedCharacterIds || []).map(String);
    return {
      itemId: String(item.id),
      itemName: item.name,
      category: item.category,
      price: item.price,
      quantitySold: v.qty,
      totalRevenue: v.revenue,
      associatedCharacterIds: assoc,
      earningsPerCharacter: Math.floor(v.revenue / Math.max(assoc.length, 1)),
    };
  }).filter(Boolean);

  const characterEarnings = Object.entries(revenuePerChar)
    .filter(([, amt]) => amt > 0)
    .map(([cid, amt]) => {
      const c = db.characters.find(ch => String(ch.id) === String(cid));
      return {
        characterId: String(cid),
        characterName: c?.name || String(cid),
        earnings: amt,
      };
    });

  const totalRevenue = soldItems.reduce((s, i) => s + i.totalRevenue, 0);

  // Items "no vendidos" = todos los que tienen stock disponible en ESA foto
  const unsoldItemIds = db.items
    .filter(i => {
      const rem = (i.quantity || 0) - (i.quantitySold || 0);
      return rem > 0;
    })
    .map(i => String(i.id));

  return {
    id: randId(),
    label,
    type,
    status: 'CLOSED',
    startedAt: hoursAgo(startedHoursAgo),
    closedAt: hoursAgo(closedHoursAgo),
    closedBy,
    totalRevenue,
    totalProfit: totalRevenue,
    characterEarnings,
    soldItems,
    unsoldItemIds,
  };
}

db.salesCycles.push(buildCycle({
  type: 'SEMANAL',
  label: 'Ciclo #1 (Semanal)',
  purchases: semanalSoldPurchases,
  startedHoursAgo: 24 * 10,   // hace ~10 días
  closedHoursAgo: 24 * 3,     // cerrado hace ~3 días
  closedBy: 'Lucía Admin',
}));

db.salesCycles.push(buildCycle({
  type: 'DIARIO',
  label: 'Ciclo #2 (Diario)',
  purchases: diarioSoldPurchases,
  startedHoursAgo: 24 * 3,    // hace ~3 días
  closedHoursAgo: 24 * 1,     // cerrado ayer
  closedBy: 'Mateo Admin',
}));

// --- Ciclo abierto actual -----------------------------------------------------
// Simulamos algo de actividad del ciclo en curso: 2 items con
// quantitySoldInCycle > 0 (no reflejados en ciclos cerrados).
const currentCycleItems = db.items.slice(0, 3);
for (const it of currentCycleItems) {
  // incrementar las ventas: vendemos 1 unidad más (si queda stock)
  const remaining = it.quantity - it.quantitySold;
  if (remaining > 0) {
    it.quantitySold += 1;
    it.quantitySoldInCycle = 1;
    const buyer = pickBuyer(purchaseIdx);
    db.purchases.push({
      id: String(randId()),
      itemId: String(it.id),
      itemName: it.name,
      buyerId: String(buyer.id),
      buyerName: buyer.name,
      quantity: 1,
      price: it.price,
      total: it.price,
      createdAt: hoursAgo(3 + purchaseIdx),
    });
    purchaseIdx++;

    const assoc = it.associatedCharacterIds || [];
    const share = Math.floor(it.price / Math.max(assoc.length, 1));
    for (const cid of assoc) {
      const c = db.characters.find(x => x.id === cid);
      if (c) {
        c.currentCycleEarnings = (c.currentCycleEarnings || 0) + share;
        c.totalProfit = (c.totalProfit || 0) + share;
      }
    }
  }
}

// Audit logs simulados para el feed
db.auditLogs.push(
  { id: randId(), userId: createdUsers[0].id, action: 'CYCLE_CLOSED', details: { cycle: 'Ciclo #1 (Semanal)' }, createdAt: hoursAgo(72) },
  { id: randId(), userId: createdUsers[1].id, action: 'CYCLE_CLOSED', details: { cycle: 'Ciclo #2 (Diario)' }, createdAt: hoursAgo(24) },
  { id: randId(), userId: createdUsers[0].id, action: 'ITEM_SOLD', details: { itemName: currentCycleItems[0]?.name }, createdAt: hoursAgo(2) },
);

// Settings: cycleCounter = (ciclos cerrados + 1)
db.settings = [{ cycleCounter: db.salesCycles.filter(c => c.status === 'CLOSED').length + 1 }];

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

console.log('--- Seed summary ---');
console.log('Users total:', db.users.length);
console.log('Characters:', db.characters.length);
console.log('Items:', db.items.length);
console.log('UserRaidAccess:', db.userRaidAccess.length);
console.log('\nCredentials for all seeded users (except superadmin):');
console.log('  password:', DEFAULT_PWD);
for (const u of userDefs) {
  console.log('  -', u.email.padEnd(35), '->', u.role.padEnd(12), u.raid ? `(raid: ${u.raid})` : '');
}
console.log('\nOriginal super admin unchanged: superadmin@inventory.com / SuperAdmin123!');
