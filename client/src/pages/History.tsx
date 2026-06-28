import React, { useMemo, useState } from 'react';
import {
  CheckCircle, ImageIcon, Plus, Pencil, Trash2, Shield, Search, DollarSign,
  UserMinus, UserX, UserCog, KeyRound, RefreshCcw, Bookmark, BookmarkX, AlertTriangle,
  Coins, CircleDollarSign, LogIn, LogOut, Ban, Settings, Receipt, Undo2,
  Package, Hammer, Download, Upload, RotateCcw, BookOpen, UserPen,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useApp } from '../contexts/AppContext';
import type { AuditLog } from '../lib/types';
import { FancySelect, type FancyOption } from '../components/ui/FancySelect';

// ============================================================================
// Canonicalización de acciones
// ----------------------------------------------------------------------------
// Los logs vienen de distintas épocas/call-sites con nombres inconsistentes
// (CREATED_ITEM vs CREATE_ITEM, ITEM_SOLD vs SOLD_ITEM, etc.). Unificamos a UNA
// sola key canónica para que stats bar, dropdown de filtros y LogRow hablen
// todos el mismo idioma.
// ============================================================================
const ACTION_ALIASES: Record<string, string> = {
  ITEM_SOLD: 'SOLD_ITEM',
  SELL_ITEM: 'SOLD_ITEM',
  CREATED_ITEM: 'CREATE_ITEM',
  CONFIRMED_ITEM: 'CONFIRM_ITEM',
  DELETED_ITEM: 'DELETE_ITEM',
  UPDATED_ITEM: 'UPDATE_ITEM',
  UPDATED_PRICE: 'UPDATE_PRICE',
  CORRECTED_IMAGE: 'CORRECT_IMAGE',
};

function canonicalize(action: string | undefined | null): string {
  if (!action) return 'UNKNOWN';
  const up = String(action).toUpperCase();
  return ACTION_ALIASES[up] || up;
}

type ActionMeta = { icon: React.ElementType; color: string; label: string; desc: string };

const actionMeta: Record<string, ActionMeta> = {
  // Ítems
  CREATE_ITEM:    { icon: Plus,        color: '#7bf1d6', label: 'Creó ítem',        desc: 'Nuevo ítem registrado en el sistema' },
  CONFIRM_ITEM:   { icon: CheckCircle, color: '#34d399', label: 'Confirmó ítem',    desc: 'Ítem confirmado y bloqueado para Mapper' },
  UPDATE_ITEM:    { icon: Pencil,      color: '#60a5fa', label: 'Actualizó ítem',   desc: 'Datos del ítem modificados' },
  UPDATE_PRICE:   { icon: Pencil,      color: '#fbbf24', label: 'Actualizó precio', desc: 'Precio del ítem modificado' },
  CORRECT_IMAGE:  { icon: ImageIcon,   color: '#e879f9', label: 'Corrigió imagen',  desc: 'Imagen del ítem reemplazada' },
  DELETE_ITEM:    { icon: Trash2,      color: '#f87171', label: 'Eliminó ítem',     desc: 'Ítem eliminado del inventario' },
  SOLD_ITEM:      { icon: DollarSign,  color: '#a78bfa', label: 'Vendió ítem',      desc: 'Ítem vendido con ganancia distribuida' },
  // Reservas
  ITEM_RESERVED:             { icon: Bookmark,   color: '#fbbf24', label: 'Reservó ítem',          desc: 'Ítem reservado (waitlist)' },
  ITEM_RESERVATION_DELETED:           { icon: BookmarkX,  color: '#f59e0b', label: 'Canceló reserva',         desc: 'Reserva de ítem cancelada' },
  ITEM_RESERVATION_PRE_SOLD:          { icon: Bookmark,   color: '#34d399', label: 'Marcó pre-vendido',      desc: 'Reserva marcada como pre-vendida' },
  ITEM_RESERVATION_UNMARK_PRE_SOLD:   { icon: BookmarkX,  color: '#fbbf24', label: 'Desmarcó pre-vendido',   desc: 'Reserva revertida de pre-vendido a activa' },
  // Ciclos
  CYCLE_STARTED:  { icon: RefreshCcw,  color: '#7bf1d6', label: 'Inició ciclo',     desc: 'Nuevo ciclo de ventas iniciado' },
  CYCLE_CLOSED:   { icon: CheckCircle, color: '#34d399', label: 'Cerró ciclo',      desc: 'Ciclo de ventas cerrado y archivado' },
  // Pagos de adena post-cierre
  CYCLE_PAYOUT_MARKED:     { icon: Coins,            color: '#10b981', label: 'Marcó pago',              desc: 'Adena registrada como entregada a un personaje' },
  CYCLE_PAYOUT_UNMARKED:   { icon: Coins,            color: '#fbbf24', label: 'Desmarcó pago',           desc: 'Pago de adena a un personaje revertido' },
  CYCLE_PAYOUT_ALL_MARKED: { icon: CircleDollarSign, color: '#10b981', label: 'Pagó a todos', desc: 'Todos los personajes del ciclo marcados como pagados' },
  // Usuarios
  USER_ACTIVATED:                 { icon: UserCog,  color: '#34d399', label: 'Activó usuario',      desc: 'Cuenta de usuario activada' },
  USER_DEACTIVATED:               { icon: UserX,    color: '#f87171', label: 'Desactivó usuario',   desc: 'Cuenta de usuario desactivada' },
  USER_DELETED:                   { icon: UserMinus,color: '#f87171', label: 'Eliminó usuario',     desc: 'Cuenta de usuario eliminada' },
  USER_ROLE_CHANGED:              { icon: UserCog,  color: '#60a5fa', label: 'Cambió rol',          desc: 'Rol de usuario modificado' },
  USER_PASSWORD_CHANGED_BY_SELF:  { icon: KeyRound, color: '#a78bfa', label: 'Cambió contraseña',   desc: 'Usuario cambió su propia contraseña' },
  USER_PASSWORD_CHANGED_BY_ADMIN: { icon: KeyRound, color: '#fbbf24', label: 'Reset de contraseña', desc: 'Admin reseteó la contraseña de otro usuario' },
  // Acceso menú antiguo
  LEGACY_ACCESS_ENABLED:  { icon: UserCog,  color: '#34d399', label: 'Activó menú antiguo',   desc: 'Acceso al menú antiguo activado para el usuario' },
  LEGACY_ACCESS_DISABLED: { icon: UserCog,  color: '#f87171', label: 'Desactivó menú antiguo', desc: 'Acceso al menú antiguo desactivado para el usuario' },
  // Sesión / Login
  LOGIN_SUCCESS:  { icon: LogIn,  color: '#34d399', label: 'Inicio de sesión',           desc: 'Usuario inició sesión exitosamente' },
  LOGIN_FAILED:   { icon: LogOut, color: '#f87171', label: 'Inicio de sesión fallido',    desc: 'Intento de inicio de sesión fallido' },
  LOGIN_BLOCKED:  { icon: Ban,    color: '#ef4444', label: 'Inicio bloqueado',            desc: 'Inicio de sesión bloqueado por seguridad' },
  // Fondo del Clan
  CLAN_FUND_EXPENSE:          { icon: Receipt,         color: '#f87171', label: 'Registró gasto',            desc: 'Gasto registrado en el fondo del clan' },
  CLAN_FUND_EXPENSE_UPDATED:  { icon: Pencil,          color: '#60a5fa', label: 'Actualizó gasto',           desc: 'Gasto del fondo del clan modificado' },
  CLAN_FUND_EXPENSE_DELETED:  { icon: Trash2,          color: '#f87171', label: 'Eliminó gasto',             desc: 'Gasto del fondo del clan eliminado' },
  CLAN_FUND_INCOME:           { icon: CircleDollarSign, color: '#34d399', label: 'Ingreso al fondo',         desc: 'Ingreso registrado en el fondo del clan' },
  CLAN_FUND_SETTINGS_UPDATED: { icon: Settings,        color: '#a78bfa', label: 'Actualizó config. fondo',   desc: 'Configuración del fondo del clan modificada' },
  CLAN_FUND_CYCLE_PAID:       { icon: Coins,           color: '#10b981', label: 'Marcó pago de ciclo',       desc: 'Pago de ciclo marcado como completado' },
  CLAN_FUND_CYCLE_UNPAID:     { icon: Coins,           color: '#fbbf24', label: 'Desmarcó pago de ciclo',    desc: 'Pago de ciclo revertido a pendiente' },
  // Reserva vendida revertida
  ITEM_RESERVATION_UNMARK_SOLD: { icon: Undo2,  color: '#f59e0b', label: 'Revertió venta reserva',  desc: 'Estado vendido de reserva revertido' },
  // Warehouse Clan
  WAREHOUSE_REGISTER:          { icon: Package, color: '#60a5fa', label: 'Registró material bodega',  desc: 'Material registrado en la bodega del clan (pendiente)' },
  WAREHOUSE_CONFIRM:           { icon: CheckCircle, color: '#34d399', label: 'Confirmó material bodega', desc: 'Material confirmado y agrupado en bodega' },
  WAREHOUSE_DELETE_INCOMING:   { icon: Trash2,  color: '#f87171', label: 'Rechazó registro bodega',   desc: 'Registro pendiente de bodega rechazado' },
  WAREHOUSE_WITHDRAW:          { icon: Receipt, color: '#fbbf24', label: 'Descontó material bodega',  desc: 'Material descontado de la bodega del clan' },
  WAREHOUSE_DELETE:            { icon: Trash2,  color: '#ef4444', label: 'Eliminó ítem bodega',       desc: 'Ítem eliminado de la bodega del clan' },
  CRAFT_RECIPE_CREATE:         { icon: Pencil,  color: '#a855f7', label: 'Creó receta crafteo',       desc: 'Nueva receta de crafteo creada' },
  CRAFT_RECIPE_DELETE:         { icon: Trash2,  color: '#ef4444', label: 'Eliminó receta crafteo',    desc: 'Receta de crafteo eliminada' },
  CRAFT_PROJECT_CREATE:        { icon: Hammer,  color: '#34d399', label: 'Creó proyecto crafteo',     desc: 'Nuevo proyecto de crafteo iniciado' },
  CRAFT_PROJECT_COMPLETE:       { icon: CheckCircle, color: '#10b981', label: 'Completó proyecto crafteo', desc: 'Proyecto de crafteo marcado como completado' },
  CRAFT_PROJECT_EDIT_ASSIGNMENT: { icon: Pencil, color: '#60a5fa', label: 'Editó asignación crafteo',  desc: 'Asignación de materiales del proyecto modificada' },
  CRAFT_RECIPE_UPDATE:          { icon: Pencil,  color: '#a855f7', label: 'Actualizó receta crafteo',  desc: 'Receta de crafteo modificada' },
  CATALOG_MATERIAL_CREATE:      { icon: BookOpen, color: '#7bf1d6', label: 'Creó material catálogo',   desc: 'Nuevo material agregado al catálogo' },
  // Perfil de usuario
  USER_PROFILE_UPDATED:         { icon: UserPen, color: '#60a5fa', label: 'Actualizó perfil usuario',  desc: 'Perfil de usuario modificado por administrador' },
  // Backups
  BACKUP_DOWNLOADED:            { icon: Download, color: '#3b82f6', label: 'Descargó backup',          desc: 'Backup de base de datos descargado' },
  BACKUP_IMPORTED:              { icon: Upload,   color: '#a78bfa', label: 'Importó backup',           desc: 'Backup importado desde archivo' },
  FACTORY_RESET:                { icon: RotateCcw, color: '#ef4444', label: 'Reseteó base de datos',   desc: 'Reset completo de la base de datos' },
};

function metaFor(action: string): ActionMeta {
  const canon = canonicalize(action);
  return (
    actionMeta[canon] ?? {
      icon: AlertTriangle,
      color: '#94a3b8',
      label: canon,
      desc: 'Acción sin metadata registrada',
    }
  );
}

// Normaliza el rol del actor a MAYÚSCULAS (los logs tienen tanto 'super_admin'
// como 'SUPER_ADMIN' según el call-site). Esto se usa tanto para el badge como
// para el filtro de rol.
function normalizeRole(role: string | undefined | null): string {
  return String(role || '').toUpperCase();
}

// ============================================================================
// Helpers de tiempo
// ============================================================================
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
  // YYYY-MM-DD en hora local, para agrupar por "día del usuario".
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

// ============================================================================
// LogRow
// ============================================================================
function LogRow({ log }: { log: AuditLog }) {
  const meta = metaFor(log.action);
  const Icon = meta.icon;
  const roleUp = normalizeRole(log.actorRole);
  // Un log "huérfano" es uno al que le faltan campos críticos — lo marcamos
  // con borde rojo tenue y texto "log incompleto" para que sea visible.
  const isOrphan = !log.actorName || !log.detail;

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
      {/* Icon */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5"
        style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}25` }}
      >
        <Icon className="h-4 w-4" style={{ color: meta.color }} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.92)' }}>
            {log.actorName || 'Usuario desconocido'}
          </span>
          {(() => {
            const roleBadges: Record<string, { bg: string; color: string; border: string; label: string }> = {
              SUPER_ADMIN: { bg: 'rgba(123,241,214,0.1)', color: '#7bf1d6', border: 'rgba(123,241,214,0.2)', label: 'Super Admin' },
              ADMIN: { bg: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: 'rgba(96,165,250,0.2)', label: 'Admin' },
              MAPPER: { bg: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: 'rgba(251,191,36,0.2)', label: 'Mapper' },
            };
            const badge = roleBadges[roleUp];
            if (!badge) return null;
            return (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
              >
                <Shield className="h-2.5 w-2.5" /> {badge.label}
              </span>
            );
          })()}
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: `${meta.color}12`, color: meta.color }}
          >
            {meta.label}
          </span>
          {isOrphan && (
            <span
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}
            >
              <AlertTriangle className="h-2.5 w-2.5" /> log incompleto
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
          {log.detail || <em style={{ color: 'rgba(255,255,255,0.35)' }}>(sin descripción)</em>}
        </p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {timeAgo(log.createdAt)}
          </span>
          {log.itemName ? (
            <>
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Ítem: {log.itemName}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Página
// ============================================================================
export default function History() {
  const { auditLogs } = useApp();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Filtrado: aplicamos search + action + role sobre logs canonicalizados y
  // ordenados más reciente → más viejo.
  const sorted = useMemo(() => {
    return [...auditLogs].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [auditLogs]);

  const filtered = useMemo(() => {
    return sorted.filter(log => {
      const q = search.toLowerCase();
      const canon = canonicalize(log.action);
      const actor = String(log.actorName || '').toLowerCase();
      const item = String(log.itemName || '').toLowerCase();
      const detail = String(log.detail || '').toLowerCase();
      return (
        (!q || actor.includes(q) || item.includes(q) || detail.includes(q)) &&
        (actionFilter === 'ALL' || canon === actionFilter) &&
        (roleFilter === 'ALL' || normalizeRole(log.actorRole) === roleFilter)
      );
    });
  }, [sorted, search, actionFilter, roleFilter]);

  // Stats: solo mostramos cards con count ≥ 1 para eliminar duplicados vacíos
  // y respetar al usuario (nada que scrollear sin info).
  const statsEntries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of auditLogs) {
      const canon = canonicalize(log.action);
      counts.set(canon, (counts.get(canon) || 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 1)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count, meta: metaFor(key) }));
  }, [auditLogs]);

  // Agrupación por día para la lista.
  const groups = useMemo(() => {
    const map = new Map<string, AuditLog[]>();
    for (const log of filtered) {
      const k = dayKey(log.createdAt);
      const arr = map.get(k) ?? [];
      arr.push(log);
      map.set(k, arr);
    }
    return Array.from(map.entries()); // ya viene ordenado porque filtered está ordenado.
  }, [filtered]);

  // Acciones únicas (canónicas) que realmente aparecen en los logs — así el
  // dropdown sólo ofrece filtros que tienen resultados.
  const availableActions = useMemo(() => {
    const set = new Set<string>();
    for (const log of auditLogs) set.add(canonicalize(log.action));
    return Array.from(set).sort((a, b) => {
      const la = actionMeta[a]?.label || a;
      const lb = actionMeta[b]?.label || b;
      return la.localeCompare(lb);
    });
  }, [auditLogs]);

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Historial de Acciones</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Registro completo e inmutable de todas las acciones realizadas sobre el inventario,
          incluyendo ciclos de ventas cerrados. Cada entrada identifica al actor, su rol, la acción ejecutada y el ítem afectado.
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
              placeholder="Buscar por actor, ítem o detalle..."
              className="bg-transparent text-xs outline-none w-full"
              style={{ color: 'rgba(255,255,255,0.8)' }}
            />
          </div>
          <div className="min-w-[180px]">
            <FancySelect<string>
              value={actionFilter}
              onChange={(v) => setActionFilter(String(v))}
              accent="turquoise"
              size="sm"
              placeholder="Todas las acciones"
              searchable
              searchPlaceholder="Buscar acción..."
              panelWidth="auto"
              options={[
                { value: 'ALL', label: 'Todas las acciones' },
                ...availableActions.map<FancyOption<string>>(key => ({
                  value: key,
                  label: actionMeta[key]?.label || key,
                })),
              ]}
            />
          </div>
          <div className="min-w-[160px]">
            <FancySelect<string>
              value={roleFilter}
              onChange={(v) => setRoleFilter(String(v))}
              accent="turquoise"
              size="sm"
              placeholder="Todos los roles"
              options={[
                { value: 'ALL', label: 'Todos los roles', emoji: '👥' },
                { value: 'SUPER_ADMIN', label: 'Super Admin', emoji: '⚡' },
                { value: 'ADMIN', label: 'Admin', emoji: '🛡️' },
                { value: 'MAPPER', label: 'Mapper', emoji: '🗺️' },
                { value: 'USER', label: 'Usuario', emoji: '👤' },
                { value: 'SYSTEM', label: 'Sistema', emoji: '⚙️' },
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

        {/* Stats bar (sólo cards con count ≥ 1) */}
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

        {/* Lista agrupada por día — sin scroll interno, fluye con la página (mismo patrón que /purchases) */}
        <div className="px-5 pb-5">
          {filtered.length === 0 ? (
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
