import React, { useMemo, useState } from 'react';
import {
  Search, Shield, AlertTriangle,
  Skull, Pencil, Trash2, Flag, Image as ImageIcon, UserPlus, UserMinus,
  Unlock, Lock, Swords, DollarSign, CalendarClock, Bookmark, BookmarkX,
} from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import { FancySelect, type FancyOption } from '../../components/ui/FancySelect';

// ============================================================================
// RaidHistory — misma UX que /history (stats + grouping por día + filtros),
// pero alimentado por `trpc.raid.auditLogs` (colección `raidAuditLogs`).
//
// Las acciones son distintas (RAID_*), así que actionMeta, describe() y los
// colores viven en este archivo; no compartimos estado con el historial legacy.
// ============================================================================

type RaidLog = {
  id: number | string;
  action: string;
  actorName?: string;
  actorRole?: string;
  createdAt: string;
  details?: Record<string, any>;
};

type ActionMeta = { icon: React.ElementType; color: string; label: string; desc: string };

const actionMeta: Record<string, ActionMeta> = {
  // Catálogo
  RAID_BOSS_CREATED:          { icon: Skull,   color: '#e879f9', label: 'Creó raid boss',       desc: 'Nuevo boss agregado al catálogo' },
  RAID_BOSS_UPDATED:          { icon: Pencil,  color: '#60a5fa', label: 'Actualizó raid boss',  desc: 'Datos del boss modificados' },
  RAID_BOSS_DELETED:          { icon: Trash2,  color: '#f87171', label: 'Eliminó raid boss',    desc: 'Boss eliminado del catálogo' },
  // Clanes: el servidor emite sin prefijo RAID_ (raid.ts clans.create/update/delete).
  CLAN_CREATED:               { icon: Flag,    color: '#7bf1d6', label: 'Creó clan',            desc: 'Nuevo clan registrado' },
  CLAN_UPDATED:               { icon: Pencil,  color: '#60a5fa', label: 'Actualizó clan',       desc: 'Datos del clan modificados' },
  CLAN_DELETED:               { icon: Trash2,  color: '#f87171', label: 'Eliminó clan',         desc: 'Clan eliminado del catálogo' },
  // Aliases por si aparece la variante con prefijo.
  RAID_CLAN_CREATED:          { icon: Flag,    color: '#7bf1d6', label: 'Creó clan',            desc: 'Nuevo clan registrado' },
  RAID_CLAN_UPDATED:          { icon: Pencil,  color: '#60a5fa', label: 'Actualizó clan',       desc: 'Datos del clan modificados' },
  RAID_CLAN_DELETED:          { icon: Trash2,  color: '#f87171', label: 'Eliminó clan',         desc: 'Clan eliminado del catálogo' },
  RAID_CATEGORY_ICON_SET:     { icon: ImageIcon, color: '#e879f9', label: 'Configuró icono',    desc: 'Icono de categoría seteado' },
  RAID_CATEGORY_ICON_DELETED: { icon: Trash2,  color: '#f87171', label: 'Quitó icono',          desc: 'Icono de categoría removido' },
  // Accesos
  RAID_ACCESS_GRANTED:        { icon: UserPlus, color: '#34d399', label: 'Otorgó acceso',       desc: 'Acceso raid concedido a usuario' },
  RAID_ACCESS_REVOKED:        { icon: UserMinus,color: '#f87171', label: 'Revocó acceso',       desc: 'Acceso raid revocado a usuario' },
  RAID_ACCESS_BULK_GRANTED:   { icon: UserPlus, color: '#34d399', label: 'Acceso en lote',      desc: 'Otorgó acceso a múltiples usuarios' },
  RAID_ACCESS_BULK_REVOKED:   { icon: UserMinus,color: '#f87171', label: 'Revocó en lote',      desc: 'Revocó acceso de múltiples usuarios' },
  // Ciclos (raid cycle = ventana operativa)
  RAID_CYCLE_OPENED:          { icon: Unlock,  color: '#7bf1d6', label: 'Abrió raid cycle',     desc: 'Nueva ventana de raids abierta' },
  // Alias: logs viejos usaban "CREATED", los nuevos usan "OPENED".
  RAID_CYCLE_CREATED:         { icon: Unlock,  color: '#7bf1d6', label: 'Abrió raid cycle',     desc: 'Nueva ventana de raids abierta' },
  RAID_CYCLE_CLOSED:          { icon: Lock,    color: '#e879f9', label: 'Cerró raid cycle',     desc: 'Ventana de raids cerrada' },
  // Eventos
  RAID_EVENT_CREATED:         { icon: Swords,  color: '#a78bfa', label: 'Registró evento',      desc: 'Nuevo evento de raid registrado' },
  RAID_EVENT_UPDATED:         { icon: Pencil,  color: '#60a5fa', label: 'Actualizó evento',     desc: 'Evento de raid modificado' },
  RAID_EVENT_DELETED:         { icon: Trash2,  color: '#f87171', label: 'Eliminó evento',       desc: 'Evento de raid eliminado' },
  // Drops
  RAID_DROP_UPDATED:          { icon: Pencil,      color: '#fbbf24', label: 'Actualizó drop',   desc: 'Datos de un drop modificados' },
  RAID_DROP_DELETED:          { icon: Trash2,      color: '#f87171', label: 'Eliminó drop',     desc: 'Drop eliminado' },
  RAID_DROP_SOLD:             { icon: DollarSign,  color: '#a78bfa', label: 'Vendió drop',      desc: 'Drop vendido con reparto entre clanes' },
  // Reservas (waitlist)
  RAID_DROP_RESERVED:            { icon: Bookmark,  color: '#fbbf24', label: 'Reservó drop',     desc: 'Ítem agregado a la waitlist' },
  RAID_DROP_RESERVATION_DELETED: { icon: BookmarkX, color: '#f59e0b', label: 'Canceló reserva',  desc: 'Reserva de drop cancelada' },
  // Ciclo de ventas semanal
  RAID_SALES_CYCLE_CLOSED:    { icon: CalendarClock, color: '#10b981', label: 'Cerró ciclo ventas', desc: 'Ciclo de ventas raid cerrado y archivado' },
};

function metaFor(action: string): ActionMeta {
  return (
    actionMeta[action] ?? {
      icon: AlertTriangle,
      color: '#94a3b8',
      label: action,
      desc: 'Acción sin metadata registrada',
    }
  );
}

// ----------------------------------------------------------------------------
// describe — traduce los `details` específicos de cada RAID_* a una frase
// humana. Mismo patrón que RaidActivityFeed.tsx (y quedará sincronizado con él).
// ----------------------------------------------------------------------------
function describe(log: RaidLog): string {
  const d = log.details || {};
  switch (log.action) {
    case 'RAID_BOSS_CREATED':
    case 'RAID_BOSS_UPDATED':
    case 'RAID_BOSS_DELETED':
      return d.bossName || (d.bossId != null ? `Boss #${d.bossId}` : '');
    case 'RAID_CLAN_CREATED':
    case 'RAID_CLAN_UPDATED':
    case 'RAID_CLAN_DELETED':
    case 'CLAN_CREATED':
    case 'CLAN_UPDATED':
    case 'CLAN_DELETED':
      return d.name || d.clanName || (d.clanId != null ? `Clan #${d.clanId}` : '');
    case 'RAID_CATEGORY_ICON_SET':
    case 'RAID_CATEGORY_ICON_DELETED':
      return d.category ? `Categoría: ${d.category}` : '';
    case 'RAID_ACCESS_GRANTED':
    case 'RAID_ACCESS_REVOKED':
      return [
        d.userName || d.email || (d.userId != null ? `Usuario #${d.userId}` : ''),
        d.accessLevel ? `nivel ${d.accessLevel}` : '',
      ].filter(Boolean).join(' · ');
    case 'RAID_ACCESS_BULK_GRANTED':
    case 'RAID_ACCESS_BULK_REVOKED':
      return [
        d.count != null ? `${d.count} usuario${d.count === 1 ? '' : 's'}` : '',
        d.accessLevel ? `nivel ${d.accessLevel}` : '',
      ].filter(Boolean).join(' · ');
    case 'RAID_CYCLE_OPENED':
    case 'RAID_CYCLE_CREATED':
      return d.label
        ? `${d.label}${d.cycleId != null ? ` · ciclo #${d.cycleId}` : ''}`
        : d.cycleId != null ? `Ciclo #${d.cycleId}` : '';
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
    case 'RAID_DROP_RESERVED': {
      const bits: string[] = [];
      if (d.itemName) bits.push(`"${d.itemName}"`);
      else if (d.dropItemId != null) bits.push(`drop #${d.dropItemId}`);
      if (d.quantity != null) bits.push(`${d.quantity} unid`);
      if (d.characterName) bits.push(`para ${d.characterName}`);
      return bits.join(' · ');
    }
    case 'RAID_DROP_RESERVATION_DELETED': {
      const bits: string[] = [];
      if (d.itemName) bits.push(`"${d.itemName}"`);
      else if (d.dropItemId != null) bits.push(`drop #${d.dropItemId}`);
      if (d.quantity != null) bits.push(`${d.quantity} unid`);
      if (d.characterName) bits.push(`de ${d.characterName}`);
      if (d.deletedBy === 'admin') bits.push('(cancelada por admin)');
      return bits.join(' · ');
    }
    case 'RAID_SALES_CYCLE_CLOSED': {
      const bits: string[] = [];
      if (d.label) bits.push(d.label);
      if (d.totalRevenue != null) bits.push(`$${Number(d.totalRevenue).toLocaleString()} vendido`);
      if (d.totalItemsUnsold != null) bits.push(`${d.totalItemsUnsold} sin vender`);
      if (d.clansCount != null) bits.push(`${d.clansCount} clan${d.clansCount === 1 ? '' : 'es'}`);
      return bits.join(' · ');
    }
    default:
      try { return JSON.stringify(d).slice(0, 120); } catch { return ''; }
  }
}

function normalizeRole(role: string | undefined | null): string {
  return String(role || '').toUpperCase();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Ahora mismo';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return `Hace ${d} día${d !== 1 ? 's' : ''}`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(n => Number(n));
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getTime() === today.getTime()) return 'Hoy';
  if (date.getTime() === yesterday.getTime()) return 'Ayer';
  return date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ----------------------------------------------------------------------------
// Row
// ----------------------------------------------------------------------------
function LogRow({ log }: { log: RaidLog }) {
  const meta = metaFor(log.action);
  const Icon = meta.icon;
  const roleUp = normalizeRole(log.actorRole);
  const detail = describe(log);
  const isOrphan = !log.actorName;
  const absoluteTime = new Date(log.createdAt).toLocaleString('es-CL', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div
      className="flex gap-4 border-b py-3 last:border-b-0"
      style={{
        borderColor: 'rgba(255,255,255,0.05)',
        borderLeft: isOrphan ? '2px solid rgba(248,113,113,0.5)' : undefined,
        paddingLeft: isOrphan ? 10 : 0,
      }}
      title={absoluteTime}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5"
        style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}25` }}
      >
        <Icon className="h-4 w-4" style={{ color: meta.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.92)' }}>
            {log.actorName || 'Sistema'}
          </span>
          {roleUp === 'SUPER_ADMIN' && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
              style={{ background: 'rgba(123,241,214,0.1)', color: '#7bf1d6', border: '1px solid rgba(123,241,214,0.2)' }}
            >
              <Shield className="h-2.5 w-2.5" /> Super Admin
            </span>
          )}
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: `${meta.color}12`, color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
          {detail || <em style={{ color: 'rgba(255,255,255,0.35)' }}>(sin descripción)</em>}
        </p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {timeAgo(log.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------
export default function RaidHistory() {
  const logsQ = trpc.raid.auditLogs.useQuery({ limit: 500 }, { refetchInterval: 15_000 });
  const raw = (logsQ.data || []) as RaidLog[];

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const sorted = useMemo(() => {
    return [...raw].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [raw]);

  const filtered = useMemo(() => {
    return sorted.filter(log => {
      const q = search.toLowerCase();
      const actor = String(log.actorName || '').toLowerCase();
      const det = describe(log).toLowerCase();
      return (
        (!q || actor.includes(q) || det.includes(q) || String(log.action).toLowerCase().includes(q)) &&
        (actionFilter === 'ALL' || log.action === actionFilter) &&
        (roleFilter === 'ALL' || normalizeRole(log.actorRole) === roleFilter)
      );
    });
  }, [sorted, search, actionFilter, roleFilter]);

  const statsEntries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of raw) counts.set(log.action, (counts.get(log.action) || 0) + 1);
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 1)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count, meta: metaFor(key) }));
  }, [raw]);

  const groups = useMemo(() => {
    const map = new Map<string, RaidLog[]>();
    for (const log of filtered) {
      const k = dayKey(log.createdAt);
      const arr = map.get(k) ?? [];
      arr.push(log);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const availableActions = useMemo(() => {
    const set = new Set<string>();
    for (const log of raw) set.add(log.action);
    return Array.from(set).sort((a, b) => {
      const la = actionMeta[a]?.label || a;
      const lb = actionMeta[b]?.label || b;
      return la.localeCompare(lb);
    });
  }, [raw]);

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Historial Raid</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Registro completo e inmutable de todas las acciones realizadas en el módulo Raid:
          creación de bosses y clanes, accesos otorgados, eventos registrados, drops vendidos y cierres de ciclo.
        </p>
      </div>

      <div className="card-glass rounded-2xl">
        {/* Filtros */}
        <div
          className="flex flex-wrap items-center gap-2 border-b p-5"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="flex h-9 items-center gap-2 rounded-xl border px-3 flex-1 min-w-[160px]"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por actor, acción o detalle..."
              className="bg-transparent text-xs outline-none w-full"
              style={{ color: 'rgba(255,255,255,0.8)' }}
            />
          </div>
          <div className="min-w-[180px]">
            <FancySelect<string>
              value={actionFilter}
              onChange={(v) => setActionFilter(String(v))}
              accent="magenta"
              size="sm"
              placeholder="Todas las acciones"
              searchable
              searchPlaceholder="Buscar acción..."
              options={[
                { value: 'ALL', label: 'Todas las acciones', emoji: '📋' },
                ...availableActions.map<FancyOption<string>>(key => ({
                  value: key,
                  label: actionMeta[key]?.label || key,
                  emoji: '🔖',
                })),
              ]}
            />
          </div>
          <div className="min-w-[160px]">
            <FancySelect<string>
              value={roleFilter}
              onChange={(v) => setRoleFilter(String(v))}
              accent="magenta"
              size="sm"
              placeholder="Todos los roles"
              options={[
                { value: 'ALL', label: 'Todos los roles', emoji: '👥' },
                { value: 'SUPER_ADMIN', label: 'Super Admin', emoji: '⚡' },
                { value: 'MAPPER', label: 'Mapper', emoji: '🗺️' },
                { value: 'USER', label: 'Usuario', emoji: '👤' },
              ]}
            />
          </div>
          <span
            className="text-xs px-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)' }}
          >
            {filtered.length} registros
          </span>
        </div>

        {/* Stats cards (solo count ≥ 1, clickeables como filtro) */}
        {statsEntries.length > 0 && (
          <div
            className="grid grid-cols-2 gap-3 border-b p-5 sm:grid-cols-4 lg:grid-cols-6"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            {statsEntries.map(({ key, count, meta: m }) => {
              const isActive = actionFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActionFilter(isActive ? 'ALL' : key)}
                  className="flex items-center gap-3 rounded-xl p-3 transition-all text-left"
                  style={{
                    background: isActive ? `${m.color}14` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isActive ? `${m.color}50` : 'transparent'}`,
                    cursor: 'pointer',
                  }}
                  title={m.desc}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${m.color}12` }}
                  >
                    <m.icon className="h-3.5 w-3.5" style={{ color: m.color }} />
                  </div>
                  <div>
                    <p className="text-lg font-bold font-mono" style={{ color: m.color }}>{count}</p>
                    <p className="text-xs leading-none" style={{ color: 'rgba(255,255,255,0.5)' }}>{m.label}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Lista agrupada por día */}
        <div className="px-5 overflow-y-auto" style={{ maxHeight: 600 }}>
          {logsQ.isLoading ? (
            <p className="py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Cargando actividad…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              No se encontraron registros con los filtros aplicados
            </p>
          ) : (
            groups.map(([k, logs]) => (
              <section key={k} className="pb-2">
                <div
                  className="sticky top-0 z-10 -mx-5 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider"
                  style={{
                    background: 'rgba(12,12,18,0.92)',
                    backdropFilter: 'blur(6px)',
                    color: 'rgba(255,255,255,0.5)',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {dayLabel(k)} <span style={{ color: 'rgba(255,255,255,0.25)' }}>· {logs.length}</span>
                </div>
                <div>
                  {logs.map(log => <LogRow key={log.id} log={log} />)}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
