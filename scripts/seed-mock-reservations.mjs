// Seed mock drop reservations for manual UI review.
//
// - Sube el stock (quantity) de 3 drops elegidos a 5 uds para que múltiples
//   usuarios puedan reservar en el mismo drop sin romper la regla de fair-play.
// - Reemplaza raidDropReservations[] con un set variado:
//     * 3 drops con reservas de varios usuarios (para ver el caso "varios
//       usuarios sobre un mismo drop")
//     * ~5 drops con reserva de un solo usuario (para ver el caso "un drop,
//       una reserva")
//
// Uso:   node scripts/seed-mock-reservations.mjs
// Después reiniciar el server tsx para que dbInstance recargue desde el JSON.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[1], '../..');
const DB_PATH = path.join(ROOT, 'data_storage.json');

const raw = fs.readFileSync(DB_PATH, 'utf8');
const db = JSON.parse(raw);

const genId = () => Math.floor(Math.random() * 900000) + 100000;
const userById = Object.fromEntries(db.users.map(u => [u.id, u]));

// -----------------------------------------------------------------------------
// Paso 1 — subir stock de 3 drops a 5 unidades para permitir reservas múltiples.
// Elegimos los primeros 3 drops con remaining >= 1 y los pisamos a quantity=5,
// quantitySold=0. Esto no afecta adena ya repartida (los clan stats se
// congelaron al momento de cada venta).
// -----------------------------------------------------------------------------
const boostTargets = db.raidDropItems
  .filter(d => (Number(d.quantity) - Number(d.quantitySold)) > 0)
  .slice(0, 3);

for (const d of boostTargets) {
  d.quantity = 5;
  d.quantitySold = 0;
  d.status = 'EN_REGISTRO';
  console.log(`~ stock boost: ${d.name} #${d.id} → quantity=5, sold=0`);
}

const boostedIds = new Set(boostTargets.map(d => Number(d.id)));

// -----------------------------------------------------------------------------
// Paso 2 — set de reservas mock.
// -----------------------------------------------------------------------------
db.raidDropReservations = [];

// A) 3 drops "populares" con varios reservantes distintos.
const usersMulti = [
  { userId: 386290 }, // Diego Usuario — raid_user
  { userId: 895289 }, // Lucía Admin
  { userId: 758297 }, // Mateo Admin
  { userId: 642795 }, // Sofía Mapper
  { userId: 876147 }, // Tomás Mapper
];

const nowBase = Date.now();
let offset = 0;

const pushReservation = (drop, userId, qty) => {
  const u = userById[userId];
  if (!u) {
    console.warn(`user ${userId} not found — skip`);
    return;
  }
  // Semántica waitlist: la cantidad individual de la reserva está capada por el
  // stock absoluto (availableStock), no por el "restante menos otras reservas".
  const remaining = Number(drop.quantity) - Number(drop.quantitySold);
  if (remaining <= 0) {
    console.warn(`drop ${drop.id} sin stock — skip ${u.name}`);
    return;
  }
  const finalQty = Math.min(qty, remaining);
  db.raidDropReservations.push({
    id: genId(),
    dropItemId: Number(drop.id),
    userId: Number(u.id),
    userName: String(u.name),
    characterName: String(u.characterName || u.name),
    quantity: finalQty,
    createdAt: new Date(nowBase - offset * 9 * 60 * 1000).toISOString(),
  });
  offset += 1;
  console.log(`+ ${u.name.padEnd(18)} → ${drop.name.padEnd(28)} #${drop.id}  x${finalQty}`);
};

// drop[0] → WAITLIST: 3 stock y 6 usuarios reservando (6 reservas sobre 3 uds).
// Bajamos su stock a 3 para demostrar que la suma puede superarlo sin problema.
const d0 = boostTargets[0];
if (d0) {
  d0.quantity = 3;
  d0.quantitySold = 0;
  console.log(`~ waitlist demo: ${d0.name} #${d0.id} → stock=3, 6 usuarios en waitlist`);
  pushReservation(d0, 386290, 1);
  pushReservation(d0, 895289, 1);
  pushReservation(d0, 758297, 2);
  pushReservation(d0, 642795, 1);
  pushReservation(d0, 876147, 1);
  pushReservation(d0, 386290, 1); // Diego vuelve a reservar otra unidad
}

// drop[1] → 3 usuarios con cantidades distintas (2+1+1 = 4 de 5)
const d1 = boostTargets[1];
if (d1) {
  pushReservation(d1, 895289, 2);
  pushReservation(d1, 876147, 1);
  pushReservation(d1, 386290, 1);
}

// drop[2] → 2 usuarios cubriendo el stock (3+2 = 5 de 5)
const d2 = boostTargets[2];
if (d2) {
  pushReservation(d2, 758297, 3);
  pushReservation(d2, 386290, 2);
}

// B) 5 drops adicionales con reserva de 1 usuario cada uno.
const singleTargets = db.raidDropItems
  .filter(d => {
    if (boostedIds.has(Number(d.id))) return false;
    const rem = Number(d.quantity) - Number(d.quantitySold);
    return rem > 0;
  })
  .slice(0, 5);

const singleUserCycle = [895289, 758297, 386290, 642795, 876147];
singleTargets.forEach((d, i) => {
  pushReservation(d, singleUserCycle[i % singleUserCycle.length], 1);
});

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log(`\nTotal reservas: ${db.raidDropReservations.length}`);
console.log(`Drops con reservas: ${new Set(db.raidDropReservations.map(r => r.dropItemId)).size}`);
console.log('Listo — reiniciar tsx para que el server recargue el JSON.');
