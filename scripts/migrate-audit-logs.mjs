#!/usr/bin/env node
// Migración idempotente de auditLogs en data_storage.json.
// - Normaliza action (ITEM_SOLD -> SOLD_ITEM, CREATED_ITEM -> CREATE_ITEM, etc.)
// - Rellena actorName / actorRole buscando por userId en users[]
// - Rellena itemName buscando por itemId en items[]
// - Genera un detail humano si falta
// - Asegura createdAt como string ISO
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STORAGE = path.join(ROOT, 'data_storage.json');

const CANON = {
  ITEM_SOLD: 'SOLD_ITEM',
  SELL_ITEM: 'SOLD_ITEM',
  CREATED_ITEM: 'CREATE_ITEM',
  CONFIRMED_ITEM: 'CONFIRM_ITEM',
  DELETED_ITEM: 'DELETE_ITEM',
  UPDATED_ITEM: 'UPDATE_ITEM',
  UPDATED_PRICE: 'UPDATE_PRICE',
  CORRECTED_IMAGE: 'CORRECT_IMAGE',
};

function canonAction(a) {
  if (!a) return a;
  const up = String(a).toUpperCase();
  return CANON[up] || up;
}

function humanDetail(log, actorName, itemName) {
  const d = log.details || {};
  const action = canonAction(log.action);
  const who = actorName || log.actorName || 'Usuario';
  switch (action) {
    case 'CREATE_ITEM':
      return `Creó el ítem "${itemName || d.itemName || '—'}".`;
    case 'CONFIRM_ITEM':
      return `Confirmó el ítem "${itemName || '—'}".`;
    case 'DELETE_ITEM':
      return `Eliminó el ítem "${itemName || '#' + (d.itemId ?? '—')}".`;
    case 'UPDATE_PRICE':
      return `Actualizó el precio del ítem "${itemName || '—'}".`;
    case 'UPDATE_ITEM':
      return `Actualizó el ítem "${itemName || '—'}".`;
    case 'SOLD_ITEM': {
      const qty = d.quantity ?? '?';
      const buyer = d.buyerName ? ` a ${d.buyerName}` : '';
      const rev = d.totalRevenue != null ? `. Total: $${Number(d.totalRevenue).toLocaleString()}` : '';
      return `Vendió ${qty} unidad(es) de "${itemName || '—'}"${buyer}${rev}.`;
    }
    case 'CORRECT_IMAGE':
      return `Corrigió la imagen del ítem "${itemName || '—'}".`;
    case 'ITEM_RESERVED':
      return `Reservó ${d.quantity ?? '?'} unidad(es) del ítem "${itemName || '#' + (d.itemId ?? '—')}".`;
    case 'ITEM_RESERVATION_DELETED':
      return `Canceló una reserva del ítem "${itemName || '#' + (d.itemId ?? '—')}".`;
    case 'USER_ACTIVATED':
      return `Activó la cuenta de ${d.targetEmail || '—'}.`;
    case 'USER_DEACTIVATED':
      return `Desactivó la cuenta de ${d.targetEmail || '—'}.`;
    case 'USER_DELETED':
      return `Eliminó la cuenta de ${d.targetEmail || '—'}.`;
    case 'USER_ROLE_CHANGED':
      return `Cambió el rol de ${d.targetEmail || '—'} de ${d.previousRole || '?'} a ${d.newRole || '?'}.`;
    case 'USER_PASSWORD_CHANGED_BY_SELF':
      return `${who} cambió su propia contraseña.`;
    case 'USER_PASSWORD_CHANGED_BY_ADMIN':
      return `Cambió la contraseña de ${d.targetEmail || '—'}.`;
    case 'CYCLE_CLOSED':
      return `Cerró un ciclo de ventas.`;
    case 'CYCLE_STARTED':
      return `Inició un nuevo ciclo de ventas.`;
    default:
      return `${who} ejecutó ${action}.`;
  }
}

async function main() {
  const raw = await fs.readFile(STORAGE, 'utf8');
  const db = JSON.parse(raw);
  const users = db.users || [];
  const items = db.items || [];
  const logs = db.auditLogs || [];

  const userById = new Map(users.map(u => [Number(u.id), u]));
  const itemById = new Map(items.map(i => [Number(i.id), i]));

  let touched = 0;
  for (const log of logs) {
    const before = JSON.stringify(log);

    // Canonicalize action
    const canon = canonAction(log.action);
    if (canon !== log.action) log.action = canon;

    // createdAt ISO
    if (log.createdAt && typeof log.createdAt !== 'string') {
      try { log.createdAt = new Date(log.createdAt).toISOString(); } catch {}
    }

    // actorName / actorRole from userId
    if ((!log.actorName || !log.actorRole) && log.userId != null) {
      const u = userById.get(Number(log.userId));
      if (u) {
        if (!log.actorName) log.actorName = String(u.characterName || u.name || u.email || 'Usuario').trim();
        if (!log.actorRole) log.actorRole = String(u.role || 'user');
      }
    }
    if (!log.actorName) log.actorName = 'Sistema';
    if (!log.actorRole) log.actorRole = 'system';

    // itemId / itemName
    const d = log.details || {};
    if (log.itemId == null && d.itemId != null) log.itemId = String(d.itemId);
    if (log.itemId != null) log.itemId = String(log.itemId);

    if (!log.itemName) {
      if (d.itemName) {
        log.itemName = d.itemName;
      } else if (log.itemId != null) {
        const it = itemById.get(Number(log.itemId));
        if (it) log.itemName = it.name;
      }
    }

    // detail fallback
    if (!log.detail) {
      log.detail = humanDetail(log, log.actorName, log.itemName);
    }

    if (JSON.stringify(log) !== before) touched++;
  }

  db.auditLogs = logs;
  await fs.writeFile(STORAGE, JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log(`Migrated ${touched}/${logs.length} audit log entries.`);
}

main().catch(err => { console.error(err); process.exit(1); });
