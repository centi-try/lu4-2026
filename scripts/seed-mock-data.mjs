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
  { email: 'lucia.admin@inventory.com',     name: 'Lucía Admin',      role: 'super_admin', raid: 'raid_admin' },
  { email: 'mateo.admin@inventory.com',     name: 'Mateo Admin',      role: 'super_admin', raid: 'raid_admin' },
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

// Reset lists
db.users = [...keepSuper];
db.characters = [];
db.items = [];
db.userRaidAccess = [];
db.purchases = db.purchases || [];
db.auditLogs = db.auditLogs || [];

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
  const sold = i % 5 === 0 ? Math.min(1, d.quantity) : 0; // every 5th item has 1 sold
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

// Settings: bump cycle counter
db.settings = Array.isArray(db.settings) && db.settings.length ? db.settings : [{ cycleCounter: 1 }];

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
