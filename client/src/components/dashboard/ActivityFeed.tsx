import React from 'react';
import {
  CheckCircle, ImageIcon, Plus, Pencil, Trash2, Shield, DollarSign, BarChart3,
  Bookmark, BookmarkX, UserPlus, UserMinus, UserCog, Key,
} from 'lucide-react';
import type { AuditLog } from '../../lib/types';

// ============================================================================
// Canonicalización: el servidor y el cliente históricamente emitieron nombres
// diferentes para la misma acción (ITEM_SOLD vs SOLD_ITEM, CREATED_ITEM vs
// CREATE_ITEM). Unificamos para evitar filas "crudas" con el action en bruto.
// ============================================================================
function canonicalize(action: string): string {
  switch (action) {
    case 'CREATED_ITEM':    return 'CREATE_ITEM';
    case 'CONFIRMED_ITEM':  return 'CONFIRM_ITEM';
    case 'DELETED_ITEM':    return 'DELETE_ITEM';
    case 'SELL_ITEM':
    case 'ITEM_SOLD':       return 'SOLD_ITEM';
    case 'UPDATED_ITEM':    return 'UPDATE_ITEM';
    case 'UPDATED_PRICE':   return 'UPDATE_PRICE';
    case 'CORRECTED_IMAGE': return 'CORRECT_IMAGE';
    default:                return action;
  }
}

const actionMeta: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  CREATE_ITEM:              { icon: Plus,        color: '#7bf1d6', label: 'Creó ítem' },
  CONFIRM_ITEM:             { icon: CheckCircle, color: '#34d399', label: 'Confirmó ítem' },
  UPDATE_ITEM:              { icon: Pencil,      color: '#60a5fa', label: 'Actualizó ítem' },
  UPDATE_PRICE:             { icon: Pencil,      color: '#fbbf24', label: 'Actualizó precio' },
  CORRECT_IMAGE:            { icon: ImageIcon,   color: '#e879f9', label: 'Corrigió imagen' },
  DELETE_ITEM:              { icon: Trash2,      color: '#f87171', label: 'Eliminó ítem' },
  SOLD_ITEM:                { icon: DollarSign,  color: '#a78bfa', label: 'Vendió ítem' },
  CYCLE_CLOSED:             { icon: BarChart3,   color: '#e879f9', label: 'Cerró ciclo' },
  CYCLE_STARTED:            { icon: BarChart3,   color: '#7bf1d6', label: 'Inició ciclo' },
  // Reservas de ítems (waitlist)
  ITEM_RESERVED:            { icon: Bookmark,    color: '#fbbf24', label: 'Reservó ítem' },
  ITEM_RESERVATION_DELETED: { icon: BookmarkX,   color: '#f59e0b', label: 'Canceló reserva' },
  // Gestión de usuarios
  USER_DELETED:             { icon: Trash2,      color: '#f87171', label: 'Eliminó usuario' },
  USER_DEACTIVATED:         { icon: UserMinus,   color: '#f87171', label: 'Desactivó usuario' },
  USER_ACTIVATED:           { icon: UserPlus,    color: '#34d399', label: 'Activó usuario' },
  USER_ROLE_CHANGED:        { icon: UserCog,     color: '#60a5fa', label: 'Cambió rol' },
  USER_PASSWORD_RESET:      { icon: Key,         color: '#fbbf24', label: 'Reseteó contraseña' },
  USER_PASSWORD_CHANGED:    { icon: Key,         color: '#fbbf24', label: 'Cambió contraseña' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Ahora';
  if (m < 60) return `Hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  return `Hace ${Math.floor(h / 24)}d`;
}

// Normalizar el detalle del log para mostrar texto legible.
// Si el log viene viejo sin `detail` precomputado, armamos uno razonable a
// partir de `details` para no mostrar un objeto JSON en bruto.
function normalizeDetail(log: AuditLog): string {
  if (log.detail) return log.detail;
  const details = (log as any).details || {};
  const action = canonicalize(log.action);
  switch (action) {
    case 'ITEM_RESERVED': {
      const bits: string[] = [];
      if (details.itemName) bits.push(`"${details.itemName}"`);
      else if (details.itemId != null) bits.push(`ítem #${details.itemId}`);
      if (details.quantity != null) bits.push(`${details.quantity} unid`);
      if (details.characterName) bits.push(`para ${details.characterName}`);
      return bits.join(' · ');
    }
    case 'ITEM_RESERVATION_DELETED': {
      const bits: string[] = [];
      if (details.itemName) bits.push(`"${details.itemName}"`);
      else if (details.itemId != null) bits.push(`ítem #${details.itemId}`);
      if (details.deletedBy === 'admin') bits.push('(cancelada por admin)');
      return bits.join(' · ');
    }
    case 'USER_DELETED':
    case 'USER_DEACTIVATED':
    case 'USER_ACTIVATED':
    case 'USER_ROLE_CHANGED':
    case 'USER_PASSWORD_RESET':
    case 'USER_PASSWORD_CHANGED':
      return details.targetEmail || details.email || details.name || (details.userId != null ? `Usuario #${details.userId}` : '');
    default:
      if (details.itemName) return `Ítem: ${details.itemName}`;
      if (details.itemId) return `ID: ${details.itemId}`;
      return '';
  }
}

// Normalizar el nombre del actor
function normalizeActorName(log: AuditLog): string {
  if (log.actorName) return log.actorName;
  return 'Sistema';
}

interface Props {
  logs: AuditLog[];
}

export function ActivityFeed({ logs }: Props) {
  return (
    <div className="card-glass rounded-2xl p-5 flex flex-col">
      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>Actividad Reciente</h3>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Registro de todas las acciones realizadas sobre el inventario
        </p>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1" style={{ maxHeight: 400 }}>
        {logs.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Sin actividad registrada</p>
        )}
        {logs.map((log) => {
          const canonical = canonicalize(log.action);
          const meta = actionMeta[canonical] ?? { icon: Pencil, color: '#7bf1d6', label: canonical };
          const Icon = meta.icon;
          const actorName = normalizeActorName(log);
          const detail = normalizeDetail(log);
          return (
            <div key={log.id} className="flex gap-3 rounded-xl p-3 transition-all hover:bg-white/[0.02]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}25` }}>
                <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{actorName}</span>
                  {String(log.actorRole || '').toUpperCase() === 'SUPER_ADMIN' && (
                    <Shield className="h-3 w-3" style={{ color: '#7bf1d6' }} />
                  )}
                  <span className="text-xs" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                {detail && (
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{detail}</p>
                )}
                <p className="mt-1 text-xs font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{timeAgo(log.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
