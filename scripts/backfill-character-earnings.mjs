#!/usr/bin/env node
/**
 * Backfill / reconciliación de `totalEarnings` en personajes legacy.
 *
 * Contexto:
 *  - El campo histórico del módulo legacy era `totalProfit` (y `profitPerCycle`).
 *  - Se migró a `totalEarnings` / `currentCycleEarnings` (que usa el frontend),
 *    pero los datos antiguos quedaron con el nombre viejo y los nuevos con el
 *    nombre nuevo.
 *  - Resultado observado en data_storage.json: algunos personajes tienen
 *    `totalProfit: 2700` con `totalEarnings: 300` (valores distintos).
 *
 * Estrategia:
 *  - La **fuente de verdad** son los items: `items[].quantitySold * price`
 *    dividido entre `associatedCharacterIds.length` (float floor).
 *  - Recalcular `totalEarnings` desde cero para todos los personajes.
 *  - Limpiar `totalProfit` / `profitPerCycle` legacy si quedaron valores,
 *    pero solo después de dejar `totalEarnings` consistente.
 *
 * Seguridad:
 *  - Backup automático antes de escribir.
 *  - Idempotente (se puede correr N veces).
 */
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../data_storage.json');
const BACKUP_PATH = resolve(__dirname, `../data_storage.backup.${Date.now()}.json`);

const db = JSON.parse(readFileSync(DB_PATH, 'utf8'));
const items = Array.isArray(db.items) ? db.items : [];
const characters = Array.isArray(db.characters) ? db.characters : [];

// Computamos earnings esperados desde items.
const expected = new Map(); // charId:number -> totalEarnings
for (const it of items) {
  const assoc = (it.associatedCharacterIds || []).map(Number).filter(n => !Number.isNaN(n));
  if (assoc.length === 0) continue;
  const totalRev = (Number(it.price) || 0) * (Number(it.quantitySold) || 0);
  if (totalRev <= 0) continue;
  const per = Math.floor(totalRev / assoc.length);
  for (const id of assoc) {
    expected.set(id, (expected.get(id) || 0) + per);
  }
}

copyFileSync(DB_PATH, BACKUP_PATH);
console.log(`Backup escrito en ${BACKUP_PATH}`);

let updates = 0;
db.characters = characters.map((c) => {
  const idNum = Number(c.id);
  const expectedEarnings = expected.get(idNum) || 0;
  const currentEarnings = Number(c.totalEarnings) || 0;
  const legacyProfit = Number(c.totalProfit) || 0;
  // Si stored != expected, ajustamos al valor computed (fuente de verdad).
  // Si stored == expected, mantenemos.
  // Si legacyProfit > expected (ítems borrados, raro), priorizamos expected.
  const next = { ...c };
  if (expectedEarnings !== currentEarnings) {
    console.log(
      `  char#${c.id} "${c.name}": totalEarnings ${currentEarnings} → ${expectedEarnings} (legacy totalProfit=${legacyProfit})`,
    );
    next.totalEarnings = expectedEarnings;
    updates += 1;
  }
  // Normalizamos defaults cosméticos para que el UI no renderice undefined.
  if (next.class === undefined) next.class = 'Aventurero';
  if (next.level === undefined) next.level = 1;
  if (next.avatar === undefined) next.avatar = 'from-gray-400 to-gray-600';
  // Rol legible: si el char está atado a un user, usamos el rol del user.
  if (next.role === undefined && c.userId != null) {
    const u = (db.users || []).find((uu) => Number(uu.id) === Number(c.userId));
    if (u?.role) next.role = String(u.role).toUpperCase();
  }
  if (next.currentCycleEarnings === undefined) next.currentCycleEarnings = 0;
  // Preservamos totalProfit/profitPerCycle legacy (por compatibilidad), pero no los usamos.
  return next;
});

writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log(`\n✓ ${updates} personajes actualizados.`);
console.log(`  (DB guardada en ${DB_PATH})`);
