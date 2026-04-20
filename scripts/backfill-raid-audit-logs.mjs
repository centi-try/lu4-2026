#!/usr/bin/env node
// Backfill one-shot: enriquece raidAuditLogs antiguos con `itemName` (a partir
// de `dropItemId`) para que RaidActivityFeed y /raids/history puedan mostrar
// una frase legible sin tener que hacer lookups en el cliente.
//
// Antes:  {"dropItemId":411010,"quantity":1,"characterName":"Lucía Admin"}
// Después: {..., "itemName":"Antharas Earring", ...}
//
// Idempotente: si `itemName` ya existe, no se toca.
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'data_storage.json');
if (!fs.existsSync(DB_PATH)) {
  console.error('No existe data_storage.json en', DB_PATH);
  process.exit(1);
}
const raw = fs.readFileSync(DB_PATH, 'utf8');
const db = JSON.parse(raw);

// Backup por seguridad.
const backupPath = `${DB_PATH}.backup-raid-audit-${Date.now()}`;
fs.writeFileSync(backupPath, raw);

const drops = Array.isArray(db.raidDropItems) ? db.raidDropItems : [];
const dropById = new Map(drops.map(d => [Number(d.id), d]));
const reservations = Array.isArray(db.raidDropReservations) ? db.raidDropReservations : [];
const reservationById = new Map(reservations.map(r => [Number(r.id), r]));

const logs = Array.isArray(db.raidAuditLogs) ? db.raidAuditLogs : [];
let touched = 0;
for (const log of logs) {
  if (!log || !log.action) continue;
  const d = log.details || {};

  if (log.action === 'RAID_DROP_RESERVED' || log.action === 'RAID_DROP_RESERVATION_DELETED') {
    if (!d.itemName && d.dropItemId != null) {
      const drop = dropById.get(Number(d.dropItemId));
      if (drop?.name) {
        d.itemName = drop.name;
        touched++;
      }
    }
    // Al borrar una reserva, enriquecer con quantity/characterName del snapshot.
    if (log.action === 'RAID_DROP_RESERVATION_DELETED' && d.reservationId != null) {
      const reservation = reservationById.get(Number(d.reservationId));
      if (reservation) {
        if (d.quantity == null && reservation.quantity != null) {
          d.quantity = reservation.quantity;
          touched++;
        }
        if (!d.characterName && reservation.characterName) {
          d.characterName = reservation.characterName;
          touched++;
        }
      }
    }
    log.details = d;
  }
}

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log(`Backfill completo. Campos enriquecidos: ${touched}. Backup: ${backupPath}`);
