import React from 'react';
import { CheckCircle, ImageIcon, Plus, Pencil, Trash2, Shield, DollarSign, BarChart3 } from 'lucide-react';
import type { AuditLog } from '../../lib/types';

const actionMeta: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  // Acciones del cliente (nombres en español)
  CREATED_ITEM:    { icon: Plus,        color: '#7bf1d6', label: 'Creó ítem' },
  CONFIRMED_ITEM:  { icon: CheckCircle, color: '#34d399', label: 'Confirmó ítem' },
  CORRECTED_IMAGE: { icon: ImageIcon,   color: '#e879f9', label: 'Corrigió imagen' },
  UPDATED_PRICE:   { icon: Pencil,      color: '#fbbf24', label: 'Actualizó precio' },
  UPDATED_ITEM:    { icon: Pencil,      color: '#60a5fa', label: 'Actualizó ítem' },
  DELETED_ITEM:    { icon: Trash2,      color: '#f87171', label: 'Eliminó ítem' },
  SOLD_ITEM:       { icon: DollarSign,  color: '#a78bfa', label: 'Vendió ítem' },
  CYCLE_CLOSED:    { icon: BarChart3,   color: '#e879f9', label: 'Cerró ciclo' },
  CYCLE_STARTED:   { icon: BarChart3,   color: '#7bf1d6', label: 'Inició ciclo' },
  // Acciones del servidor (nombres en inglés)
  CREATE_ITEM:     { icon: Plus,        color: '#7bf1d6', label: 'Creó ítem' },
  CONFIRM_ITEM:    { icon: CheckCircle, color: '#34d399', label: 'Confirmó ítem' },
  DELETE_ITEM:     { icon: Trash2,      color: '#f87171', label: 'Eliminó ítem' },
  SELL_ITEM:       { icon: DollarSign,  color: '#a78bfa', label: 'Vendió ítem' },
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

// Normalizar el detalle del log para mostrar texto legible
function normalizeDetail(log: AuditLog): string {
  if (log.detail) return log.detail;
  // Si viene del servidor con details como objeto
  const details = (log as any).details;
  if (details) {
    if (details.itemName) return `Ítem: ${details.itemName}`;
    if (details.itemId) return `ID: ${details.itemId}`;
  }
  return '';
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
          const meta = actionMeta[log.action] ?? { icon: Pencil, color: '#7bf1d6', label: log.action };
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
                  {log.actorRole === 'SUPER_ADMIN' && (
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
