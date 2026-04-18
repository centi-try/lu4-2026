import React from 'react';
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  BarChart3,
  Swords,
  Flag,
  Skull,
  Image as ImageIcon,
  UserPlus,
  UserMinus,
  Lock,
  Unlock,
  Package,
} from 'lucide-react';
import { trpc } from '../../lib/trpc';

// ============================================================================
// RaidActivityFeed — réplica visual del ActivityFeed del dashboard viejo, pero
// alimentado por trpc.raid.auditLogs (colección raidAuditLogs del JSON).
//
// No interfiere con el feed viejo: es un componente aparte, suscrito a su
// propio endpoint y a su propia colección de logs.
// ============================================================================

const actionMeta: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  RAID_BOSS_CREATED: { icon: Skull, color: '#e879f9', label: 'Creó raid boss' },
  RAID_BOSS_UPDATED: { icon: Pencil, color: '#60a5fa', label: 'Actualizó raid boss' },
  RAID_BOSS_DELETED: { icon: Trash2, color: '#f87171', label: 'Eliminó raid boss' },

  RAID_CLAN_CREATED: { icon: Flag, color: '#7bf1d6', label: 'Creó clan' },
  RAID_CLAN_UPDATED: { icon: Pencil, color: '#60a5fa', label: 'Actualizó clan' },
  RAID_CLAN_DELETED: { icon: Trash2, color: '#f87171', label: 'Eliminó clan' },

  RAID_CATEGORY_ICON_SET: { icon: ImageIcon, color: '#e879f9', label: 'Configuró icono de categoría' },
  RAID_CATEGORY_ICON_DELETED: { icon: Trash2, color: '#f87171', label: 'Quitó icono de categoría' },

  RAID_ACCESS_GRANTED: { icon: UserPlus, color: '#34d399', label: 'Otorgó acceso raid' },
  RAID_ACCESS_REVOKED: { icon: UserMinus, color: '#f87171', label: 'Revocó acceso raid' },
  RAID_ACCESS_BULK_GRANTED: { icon: UserPlus, color: '#34d399', label: 'Otorgó acceso raid (lote)' },
  RAID_ACCESS_BULK_REVOKED: { icon: UserMinus, color: '#f87171', label: 'Revocó acceso raid (lote)' },

  RAID_CYCLE_OPENED: { icon: Unlock, color: '#7bf1d6', label: 'Abrió ciclo de raids' },
  RAID_CYCLE_CLOSED: { icon: Lock, color: '#e879f9', label: 'Cerró ciclo de raids' },

  RAID_EVENT_CREATED: { icon: Swords, color: '#a78bfa', label: 'Registró evento de raid' },
  RAID_EVENT_UPDATED: { icon: Pencil, color: '#60a5fa', label: 'Actualizó evento de raid' },
  RAID_EVENT_DELETED: { icon: Trash2, color: '#f87171', label: 'Eliminó evento de raid' },

  RAID_DROP_UPDATED: { icon: Pencil, color: '#fbbf24', label: 'Actualizó drop' },
  RAID_DROP_DELETED: { icon: Trash2, color: '#f87171', label: 'Eliminó drop' },
  RAID_DROP_SOLD: { icon: DollarSign, color: '#a78bfa', label: 'Vendió drop' },
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

// Genera una línea de detalle legible por tipo de acción.
function describe(log: any): string {
  const d = log.details || {};
  switch (log.action) {
    case 'RAID_BOSS_CREATED':
    case 'RAID_BOSS_UPDATED':
    case 'RAID_BOSS_DELETED':
      return d.bossName || (d.bossId != null ? `Boss #${d.bossId}` : '');
    case 'RAID_CLAN_CREATED':
    case 'RAID_CLAN_UPDATED':
    case 'RAID_CLAN_DELETED':
      return d.clanName || (d.clanId != null ? `Clan #${d.clanId}` : '');
    case 'RAID_CATEGORY_ICON_SET':
    case 'RAID_CATEGORY_ICON_DELETED':
      return d.category ? `Categoría: ${d.category}` : '';
    case 'RAID_ACCESS_GRANTED':
    case 'RAID_ACCESS_REVOKED':
      return [
        d.userName || d.email || (d.userId != null ? `Usuario #${d.userId}` : ''),
        d.accessLevel ? `nivel ${d.accessLevel}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'RAID_CYCLE_OPENED':
      return d.label
        ? `${d.label}${d.cycleId != null ? ` · ciclo #${d.cycleId}` : ''}`
        : d.cycleId != null
          ? `Ciclo #${d.cycleId}`
          : '';
    case 'RAID_CYCLE_CLOSED': {
      const bits: string[] = [];
      if (d.label) bits.push(d.label);
      if (d.totalEvents != null) bits.push(`${d.totalEvents} eventos`);
      if (d.totalBosses != null) bits.push(`${d.totalBosses} bosses`);
      if (d.totalRevenue != null) bits.push(`$${Number(d.totalRevenue).toLocaleString()}`);
      return bits.join(' · ');
    }
    case 'RAID_EVENT_CREATED': {
      const bits: string[] = [];
      if (d.bossName) bits.push(d.bossName);
      if (d.dropsCount != null) bits.push(`${d.dropsCount} drop${d.dropsCount === 1 ? '' : 's'}`);
      if (Array.isArray(d.clanIds)) bits.push(`${d.clanIds.length} clan${d.clanIds.length === 1 ? '' : 'es'}`);
      return bits.join(' · ');
    }
    case 'RAID_EVENT_UPDATED':
    case 'RAID_EVENT_DELETED':
      return d.eventId != null ? `Evento #${d.eventId}` : '';
    case 'RAID_DROP_SOLD': {
      const bits: string[] = [];
      if (d.itemName) bits.push(d.itemName);
      if (d.quantitySold != null) bits.push(`${d.quantitySold} unid`);
      if (d.revenue != null) bits.push(`$${Number(d.revenue).toLocaleString()}`);
      if (d.buyerName) bits.push(`a ${d.buyerName}`);
      if (Array.isArray(d.clansShared) && d.clansShared.length > 0)
        bits.push(`repartido entre ${d.clansShared.length} clan${d.clansShared.length === 1 ? '' : 'es'}`);
      return bits.join(' · ');
    }
    case 'RAID_DROP_UPDATED': {
      const changes = d.changes || {};
      const parts: string[] = [];
      if (d.dropId != null) parts.push(`drop #${d.dropId}`);
      if (changes.price !== undefined) parts.push(`nuevo precio $${Number(changes.price).toLocaleString()}`);
      if (changes.name) parts.push(`nombre "${changes.name}"`);
      if (changes.category) parts.push(`categoría ${changes.category}`);
      if (changes.quantity !== undefined) parts.push(`cantidad ${changes.quantity}`);
      return parts.join(' · ');
    }
    case 'RAID_DROP_DELETED':
      return d.dropId != null ? `Drop #${d.dropId}` : '';
    default:
      try {
        return JSON.stringify(d).slice(0, 120);
      } catch {
        return '';
      }
  }
}

export default function RaidActivityFeed() {
  const logsQ = trpc.raid.auditLogs.useQuery(
    { limit: 100 },
    { refetchInterval: 15_000 }
  );
  const logs = logsQ.data || [];

  return (
    <div className="card-glass rounded-2xl p-5 flex flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4" style={{ color: '#e879f9' }} />
            <h3
              className="text-sm font-semibold"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              Actividad Reciente
            </h3>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Registro de todas las acciones realizadas en el módulo Raid
          </p>
        </div>
        {logsQ.isFetching && (
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            actualizando…
          </span>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto space-y-1 pr-1"
        style={{ maxHeight: 420 }}
      >
        {logsQ.isLoading && (
          <p
            className="text-center py-8 text-sm"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            Cargando actividad…
          </p>
        )}
        {!logsQ.isLoading && logs.length === 0 && (
          <p
            className="text-center py-8 text-sm"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            Sin actividad registrada
          </p>
        )}
        {logs.map((log: any) => {
          const meta =
            actionMeta[log.action] ?? {
              icon: Pencil,
              color: '#7bf1d6',
              label: log.action,
            };
          const Icon = meta.icon;
          const actorName: string = log.actorName || 'Sistema';
          const detail = describe(log);
          const isSuperAdmin =
            String(log.actorRole || '').toUpperCase() === 'SUPER_ADMIN';
          return (
            <div
              key={log.id}
              className="flex gap-3 rounded-xl p-3 transition-all hover:bg-white/[0.02]"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: `${meta.color}15`,
                  border: `1px solid ${meta.color}25`,
                }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: 'rgba(255,255,255,0.85)' }}
                  >
                    {actorName}
                  </span>
                  {isSuperAdmin && (
                    <Shield className="h-3 w-3" style={{ color: '#7bf1d6' }} />
                  )}
                  <span className="text-xs" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                {detail && (
                  <p
                    className="mt-0.5 text-xs leading-relaxed"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                  >
                    {detail}
                  </p>
                )}
                <p
                  className="mt-1 text-xs font-mono"
                  style={{ color: 'rgba(255,255,255,0.25)' }}
                >
                  {timeAgo(log.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
