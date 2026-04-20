import React, { useMemo, useState } from 'react';
import {
  Package,
  Search,
  ShoppingCart,
  Trash2,
  X,
  Users,
  Skull,
  Flag,
  Pencil,
  Image as ImageIcon,
} from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import { CATEGORIES, categoryMeta } from '../../lib/category-meta';
import type { ItemCategory } from '../../lib/types';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';
import { ReservationQuickButton, ReservationsPill } from './DropReservationsCell';
import { FancySelect, type FancyOption } from '../../components/ui/FancySelect';

// ============================================================================
// Tabla consolidada de todos los raid drops registrados.
//
// - Una fila por drop registrado (mantiene relación 1:1 con `raid_drop_items`,
//   que a su vez guarda eventId + associatedClanIds para el reparto).
// - Filtros: búsqueda por nombre, categoría, ciclo, clan, estado.
// - Venta: modal inspirado en el inventario viejo (ItemTable.tsx) con sección
//   "Distribución de ganancias" listando los clanes asociados.
// - Borrado: solo admin y solo si soldQuantity === 0 (no desbalancea el
//   reparto histórico).
//
// NO interfiere con el inventario viejo: usa sus propios endpoints (raid.drops)
// y su propia UI. La lógica de reparto (clan stats) ya vive en el backend.
// ============================================================================

interface Props {
  raidAccess?: RaidAccessInfo;
}

type CategoryFilter = 'ALL' | ItemCategory;
type StatusFilter = 'ALL' | 'AVAILABLE' | 'SOLD_OUT' | 'WITH_RESERVATIONS';

export default function RaidDropsTable({ raidAccess }: Props) {
  const utils = trpc.useUtils();
  const dropsQ = trpc.raid.drops.list.useQuery({});
  const cyclesQ = trpc.raid.cycles.list.useQuery();
  const currentCycleQ = trpc.raid.cycles.current.useQuery();
  const clansQ = trpc.raid.clans.list.useQuery();
  // Reservas de drops disponibles — se fetchean una sola vez a nivel de tabla
  // y cada fila filtra las propias dentro de <ReservationsPill> y
  // <ReservationQuickButton>. Las mutations de reserva/cancelación invalidan
  // este query para que el pill y el modal se refresquen en vivo.
  const reservationsQ = trpc.raid.reservations.list.useQuery(undefined, {
    staleTime: 5_000,
  });

  const drops = dropsQ.data || [];
  const cycles = cyclesQ.data || [];
  const clans = clansQ.data || [];
  const currentCycle = currentCycleQ.data;
  const reservations = ((reservationsQ.data as any[]) || []) as any[];

  // -------- Filters ---------------------------------------------------------
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [cycleFilter, setCycleFilter] = useState<'ALL' | 'CURRENT' | string>('ALL');
  const [clanFilter, setClanFilter] = useState<'ALL' | string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Mapa dropId → unidades reservadas vivas (suma de reservations.quantity).
  // Se usa para resaltar filas con reservas y para el filtro "Con reservas".
  const reservedUnitsByDrop = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of reservations) {
      const key = Number(r.dropItemId);
      map.set(key, (map.get(key) || 0) + (Number(r.quantity) || 0));
    }
    return map;
  }, [reservations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = drops.filter((d: any) => {
      if (q && !String(d.name || '').toLowerCase().includes(q)) return false;
      if (categoryFilter !== 'ALL' && String(d.category) !== categoryFilter) return false;
      if (cycleFilter === 'CURRENT' && currentCycle && Number(d.cycleId) !== Number(currentCycle.id))
        return false;
      if (cycleFilter !== 'ALL' && cycleFilter !== 'CURRENT' && String(d.cycleId) !== cycleFilter)
        return false;
      if (clanFilter !== 'ALL') {
        const ids = Array.isArray(d.associatedClanIds) ? d.associatedClanIds.map(Number) : [];
        if (!ids.includes(Number(clanFilter))) return false;
      }
      const remaining = (Number(d.quantity) || 0) - (Number(d.quantitySold) || 0);
      if (statusFilter === 'AVAILABLE' && remaining <= 0) return false;
      if (statusFilter === 'SOLD_OUT' && remaining > 0) return false;
      if (statusFilter === 'WITH_RESERVATIONS' && !(reservedUnitsByDrop.get(Number(d.id)) || 0)) return false;
      return true;
    });
    // Orden por defecto pedido por el usuario: drops con stock primero, los
    // agotados al final. Dentro de cada grupo, preferimos los más recientes
    // (createdAt desc) y como último criterio el id desc.
    return matched.slice().sort((a: any, b: any) => {
      const remA = (Number(a.quantity) || 0) - (Number(a.quantitySold) || 0);
      const remB = (Number(b.quantity) || 0) - (Number(b.quantitySold) || 0);
      const outA = remA <= 0 ? 1 : 0;
      const outB = remB <= 0 ? 1 : 0;
      if (outA !== outB) return outA - outB;
      const tA = Date.parse(String(a.createdAt || '')) || 0;
      const tB = Date.parse(String(b.createdAt || '')) || 0;
      if (tA !== tB) return tB - tA;
      return Number(b.id) - Number(a.id);
    });
  }, [drops, search, categoryFilter, cycleFilter, clanFilter, statusFilter, currentCycle, reservedUnitsByDrop]);

  const totals = useMemo(() => {
    const totalUnits = filtered.reduce((s: number, d: any) => s + (Number(d.quantity) || 0), 0);
    const soldUnits = filtered.reduce((s: number, d: any) => s + (Number(d.quantitySold) || 0), 0);
    const remainingUnits = totalUnits - soldUnits;
    // Adena ya cobrada (suma de price × quantitySold) — crece con cada venta.
    const soldRevenue = filtered.reduce(
      (s: number, d: any) => s + (Number(d.price) || 0) * (Number(d.quantitySold) || 0),
      0
    );
    // Adena que falta cobrar si se vende lo restante (price × remaining).
    const potentialRevenue = filtered.reduce(
      (s: number, d: any) =>
        s + (Number(d.price) || 0) * ((Number(d.quantity) || 0) - (Number(d.quantitySold) || 0)),
      0
    );
    // Adena total posible si todo se vende (sticker price).
    const totalRevenue = soldRevenue + potentialRevenue;
    // Reservas: drops distintos con al menos una reserva viva + total unidades.
    let dropsWithReservations = 0;
    let reservedUnitsTotal = 0;
    for (const d of filtered) {
      const u = reservedUnitsByDrop.get(Number(d.id)) || 0;
      if (u > 0) {
        dropsWithReservations += 1;
        reservedUnitsTotal += u;
      }
    }
    return {
      totalUnits, soldUnits, remainingUnits, soldRevenue, potentialRevenue, totalRevenue,
      dropsWithReservations, reservedUnitsTotal,
    };
  }, [filtered, reservedUnitsByDrop]);

  // -------- Mutations -------------------------------------------------------
  const sellDrop = trpc.raid.drops.sell.useMutation({
    onSuccess: () => {
      toast.success('Venta registrada y adena repartida a los clanes.');
      utils.raid.drops.list.invalidate();
      utils.raid.events.list.invalidate();
      utils.raid.clans.list.invalidate();
      // Si el drop quedó agotado, el backend borra las reservas vivas y las
      // archiva en el audit log. Refrescamos para que el contador de la
      // columna "Reservas" se actualice en vivo.
      utils.raid.reservations.list.invalidate();
      // Una venta suma al currentCycleEarnings de los clanes asociados
      // y al revenue del ciclo — refrescamos clans.stats para que el
      // ranking en /raids/clans se actualice en vivo.
      utils.raid.clans.stats.invalidate();
      utils.raid.dashboard.invalidate();
      // Sales cycles: cada venta cambia el snapshot live.
      utils.raid.salesCycles.livePreview.invalidate();
      utils.raid.salesCycles.list.invalidate();
    },
    onError: (err) => toast.error(err.message || 'No se pudo registrar la venta'),
  });

  const deleteDrop = trpc.raid.drops.delete.useMutation({
    onSuccess: () => {
      toast.success('Drop eliminado');
      utils.raid.drops.list.invalidate();
      utils.raid.events.list.invalidate();
      utils.raid.dashboard.invalidate();
      // dropItemsAssociated y potentialValue de los clanes asociados
      // cambian al borrar el drop.
      utils.raid.clans.stats.invalidate();
      utils.raid.salesCycles.livePreview.invalidate();
    },
    onError: (err) => toast.error(err.message || 'No se pudo eliminar el drop'),
  });

  // Editar el precio de un drop desde la tabla. Usa la mutation existente
  // raid.drops.update (solo raid_mapper/admin). Esto NO recalcula ventas ya
  // registradas: raidClanStats.totalRevenue / currentCycleEarnings quedan
  // exactamente como quedaron al momento de cada venta (la adena histórica
  // no se toca). El nuevo precio se aplica solo a las PRÓXIMAS ventas.
  const updateDrop = trpc.raid.drops.update.useMutation({
    onSuccess: () => {
      toast.success('Precio actualizado · solo aplica a ventas futuras');
      utils.raid.drops.list.invalidate();
      utils.raid.events.list.invalidate();
      utils.raid.dashboard.invalidate();
      // Editar el precio cambia potentialValue (price * quantity) que
      // el card de cada clan muestra en su header.
      utils.raid.clans.stats.invalidate();
      // El potential remanente del sales cycle depende del precio actual.
      utils.raid.salesCycles.livePreview.invalidate();
    },
    onError: (err) => toast.error(err.message || 'No se pudo actualizar el precio'),
  });

  // Lista de compradores elegibles (usuarios con acceso raid: raid_admin,
  // raid_mapper o raid_user). Se usa en el modal de "Vender" para asignar la
  // venta a un comprador/cuenta, replicando la UX del inventario viejo.
  const { data: buyersData } = trpc.raid.buyers.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const buyers = (buyersData as any[]) || [];

  // -------- Modal state -----------------------------------------------------
  const [sellModalDrop, setSellModalDrop] = useState<any | null>(null);
  const [sellQty, setSellQty] = useState('1');
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('');
  const [deleteModalDrop, setDeleteModalDrop] = useState<any | null>(null);

  // Inline price edit state. `editingPriceDropId` identifica la fila en edición
  // y `priceDraft` mantiene el valor del input como string para aceptar ediciones
  // parciales. Guardar usa raid.drops.update (no toca histórico de ventas).
  const [editingPriceDropId, setEditingPriceDropId] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState('');

  const openSellModal = (drop: any) => {
    setSellModalDrop(drop);
    setSellQty('1');
  };

  const startEditPrice = (drop: any) => {
    setEditingPriceDropId(Number(drop.id));
    setPriceDraft(String(Number(drop.price) || 0));
  };

  const cancelEditPrice = () => {
    setEditingPriceDropId(null);
    setPriceDraft('');
  };

  const savePrice = (drop: any) => {
    const raw = priceDraft.replace(/[^0-9.]/g, '');
    const parsed = Number(raw);
    if (!isFinite(parsed) || parsed < 0) {
      toast.error('Precio inválido');
      return;
    }
    if (parsed === Number(drop.price)) {
      cancelEditPrice();
      return;
    }
    updateDrop.mutate(
      { id: Number(drop.id), price: parsed },
      { onSettled: () => cancelEditPrice() },
    );
  };

  const canAdmin = !!raidAccess?.canAdmin;
  const canInteract = !!(raidAccess?.canInteract || raidAccess?.canAdmin);

  // -------- Render ---------------------------------------------------------
  return (
    <>
      {/* Header + stats */}
      <div className="card-glass rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" style={{ color: '#a78bfa' }} />
            <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Tabla de Drops
            </h3>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              · {filtered.length} de {drops.length}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <span>
              Unid: <span style={{ color: '#7bf1d6' }}>{totals.remainingUnits}</span>/
              {totals.totalUnits}
            </span>
            <span>
              Vendidas: <span style={{ color: '#fbbf24' }}>{totals.soldUnits}</span>
            </span>
            <span>
              Vendido:{' '}
              <span style={{ color: '#fbbf24' }}>${totals.soldRevenue.toLocaleString()}</span>
            </span>
            <span>
              Restante:{' '}
              <span style={{ color: '#a78bfa' }}>${totals.potentialRevenue.toLocaleString()}</span>
            </span>
            <span>
              Total:{' '}
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>${totals.totalRevenue.toLocaleString()}</span>
            </span>
            {totals.dropsWithReservations > 0 && (
              <button
                type="button"
                onClick={() =>
                  setStatusFilter((s) => (s === 'WITH_RESERVATIONS' ? 'ALL' : 'WITH_RESERVATIONS'))
                }
                title={
                  statusFilter === 'WITH_RESERVATIONS'
                    ? 'Quitar filtro de reservas'
                    : 'Filtrar: solo drops con reservas'
                }
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition"
                style={{
                  background: statusFilter === 'WITH_RESERVATIONS'
                    ? 'rgba(251,191,36,0.22)'
                    : 'rgba(251,191,36,0.12)',
                  border: `1px solid ${statusFilter === 'WITH_RESERVATIONS' ? 'rgba(251,191,36,0.6)' : 'rgba(251,191,36,0.35)'}`,
                  color: '#fbbf24',
                }}
              >
                <span className="inline-flex h-3 w-3 items-center justify-center text-[11px] font-black leading-none">R</span>
                {totals.dropsWithReservations} drops · {totals.reservedUnitsTotal} uds
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar drop por nombre…"
              className="w-full h-10 rounded-xl pl-9 pr-3 text-sm"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.85)',
              }}
            />
          </div>
          <FancySelect<string>
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(String(v) as CategoryFilter)}
            accent="magenta"
            size="md"
            placeholder="Todas las categorías"
            options={[
              { value: 'ALL', label: 'Todas las categorías', emoji: '📂' },
              ...CATEGORIES.map<FancyOption<string>>((c) => ({
                value: c,
                label: categoryMeta[c].label,
                emoji: categoryMeta[c].emoji,
              })),
            ]}
          />
          <FancySelect<string>
            value={cycleFilter}
            onChange={(v) => setCycleFilter(String(v) as any)}
            accent="magenta"
            size="md"
            placeholder="Todos los ciclos"
            options={[
              { value: 'ALL', label: 'Todos los ciclos', emoji: '📅' },
              ...(currentCycle
                ? [{ value: 'CURRENT', label: 'Ciclo actual', emoji: '🟢' } as FancyOption<string>]
                : []),
              ...cycles
                .filter((c: any) => c.status === 'CLOSED')
                .map<FancyOption<string>>((c: any) => ({
                  value: String(c.id),
                  label: String(c.label),
                  emoji: '🗂️',
                })),
            ]}
          />
          <FancySelect<string>
            value={clanFilter}
            onChange={(v) => setClanFilter(String(v) as any)}
            accent="magenta"
            size="md"
            placeholder="Todos los clanes"
            options={[
              { value: 'ALL', label: 'Todos los clanes', emoji: '🏳️' },
              ...clans.map<FancyOption<string>>((c: any) => ({
                value: String(c.id),
                label: `${c.tag ? `[${c.tag}] ` : ''}${c.name}`,
                emoji: '🏳️‍☠️',
              })),
            ]}
          />
          <FancySelect<string>
            value={statusFilter}
            onChange={(v) => setStatusFilter(String(v) as StatusFilter)}
            accent="magenta"
            size="md"
            placeholder="Todos"
            options={[
              { value: 'ALL', label: 'Todos', emoji: '🧾' },
              { value: 'AVAILABLE', label: 'Con stock', emoji: '🟢' },
              { value: 'SOLD_OUT', label: 'Agotados', emoji: '⛔' },
              { value: 'WITH_RESERVATIONS', label: 'Con reservas', emoji: '🔖' },
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card-glass rounded-2xl p-0 overflow-hidden">
        {dropsQ.isLoading ? (
          <div className="p-10 text-center text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Cargando drops…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            No hay drops que coincidan con los filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wider"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    color: 'rgba(255,255,255,0.45)',
                  }}
                >
                  <th className="px-3 py-3 font-medium">Item</th>
                  <th className="px-3 py-3 font-medium">Categoría</th>
                  <th className="px-3 py-3 font-medium">Boss</th>
                  <th className="px-3 py-3 font-medium">Clanes</th>
                  <th className="px-3 py-3 font-medium text-right">Precio</th>
                  <th className="px-3 py-3 font-medium text-left">Stock</th>
                  <th className="px-3 py-3 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d: any) => {
                  const qty = Number(d.quantity) || 0;
                  const sold = Number(d.quantitySold) || 0;
                  const remaining = qty - sold;
                  const soldOut = remaining <= 0;
                  const meta = (categoryMeta as any)[d.category] || null;
                  const rowReservedUnits = reservedUnitsByDrop.get(Number(d.id)) || 0;
                  const hasReservations = rowReservedUnits > 0;
                  return (
                    <tr
                      key={d.id}
                      className="border-t transition-colors hover:bg-white/[0.02]"
                      style={{
                        borderColor: 'rgba(255,255,255,0.04)',
                        background: hasReservations ? 'rgba(251,191,36,0.06)' : undefined,
                        boxShadow: hasReservations ? 'inset 3px 0 0 0 #fbbf24' : undefined,
                      }}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-10 w-10 shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                            style={{
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                            }}
                          >
                            {d.imageUrl ? (
                              <img
                                src={d.imageUrl}
                                alt={d.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageIcon
                                className="h-4 w-4"
                                style={{ color: 'rgba(255,255,255,0.25)' }}
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div
                              className="font-medium truncate flex items-center gap-2"
                              style={{ color: 'rgba(255,255,255,0.9)' }}
                            >
                              <span className="truncate">{d.name}</span>
                              <ReservationsPill drop={d} reservations={reservations} />
                            </div>
                            <div
                              className="text-[11px]"
                              style={{ color: 'rgba(255,255,255,0.35)' }}
                            >
                              #{d.id}
                              {d.createdAt && (
                                <>
                                  {' · '}
                                  {new Date(d.createdAt).toLocaleDateString('es-AR')}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {meta ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                            style={{
                              background: `${meta.color}1a`,
                              color: meta.color,
                              border: `1px solid ${meta.color}33`,
                            }}
                          >
                            <span>{meta.emoji}</span>
                            <span>{meta.label}</span>
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {d.category}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {d.bossImageUrl && (
                            <img
                              src={d.bossImageUrl}
                              alt={d.bossName}
                              className="h-6 w-6 rounded object-cover"
                            />
                          )}
                          <span
                            className="text-xs truncate max-w-[120px]"
                            style={{ color: 'rgba(255,255,255,0.7)' }}
                          >
                            {d.bossName || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {(d.clans || []).length === 0 ? (
                            <span
                              className="text-[11px]"
                              style={{ color: 'rgba(255,255,255,0.35)' }}
                            >
                              —
                            </span>
                          ) : (
                            (d.clans || []).map((c: any) => (
                              <span
                                key={c.id}
                                className="rounded px-1.5 py-0.5 text-[10px]"
                                style={{
                                  background: 'rgba(123,241,214,0.1)',
                                  color: '#7bf1d6',
                                  border: '1px solid rgba(123,241,214,0.2)',
                                }}
                              >
                                {c.name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono" style={{ color: '#a78bfa' }}>
                        {canInteract && editingPriceDropId === Number(d.id) ? (
                          // Edición inline del precio — replica el patrón del menu
                          // inventario viejo (ItemTable.tsx: input + ✓ primary +
                          // ✕ ghost). No recalcula ventas ya registradas.
                          <div className="flex items-center justify-end gap-1">
                            <input
                              autoFocus
                              type="number"
                              min="0"
                              step="1"
                              value={priceDraft}
                              onChange={(e) => setPriceDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePrice(d);
                                else if (e.key === 'Escape') cancelEditPrice();
                              }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={updateDrop.isPending}
                              className="input-dark h-8 w-24 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => savePrice(d)}
                              disabled={updateDrop.isPending}
                              title="Guardar"
                              className="btn-primary text-xs px-2 py-1"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditPrice}
                              disabled={updateDrop.isPending}
                              title="Cancelar"
                              className="btn-ghost text-xs px-2 py-1"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm font-mono" style={{ color: 'rgba(255,255,255,0.7)' }}>
                            ${(Number(d.price) || 0).toLocaleString()}
                          </span>
                        )}
                      </td>
                      {/* Stock — replica la columna Stock del inventario viejo:
                          `restante/total` coloreado por disponibilidad + detalle
                          de unidades vendidas debajo. Cuando remaining es 0 el
                          número queda en rojo, que es la señal visual de agotado
                          (sin necesidad de un pill aparte). */}
                      <td className="px-3 py-3">
                        <div>
                          <p
                            className="text-sm font-mono font-semibold"
                            style={{ color: remaining > 0 ? '#7bf1d6' : '#f87171' }}
                          >
                            {remaining}/{qty}
                          </p>
                          {sold > 0 && (
                            <p
                              className="text-xs"
                              style={{ color: 'rgba(255,255,255,0.3)' }}
                            >
                              {sold} vendido{sold === 1 ? '' : 's'}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {canInteract && editingPriceDropId !== Number(d.id) && (
                            // Primer ícono (Pencil) — idéntico al menu inventario
                            // viejo. Click => habilita la edición inline del precio
                            // en la columna Precio de esta misma fila.
                            //
                            // Se deshabilita cuando el drop quedó sin stock
                            // (todo vendido): ya no tiene sentido cambiar el
                            // precio porque no afecta ni ventas futuras (no
                            // hay) ni ventas pasadas (inmutables en
                            // raidClanStats). Evita confusión al operador.
                            <button
                              type="button"
                              onClick={() => {
                                if (!soldOut) startEditPrice(d);
                              }}
                              disabled={soldOut}
                              className="btn-ghost p-2"
                              title={
                                soldOut
                                  ? 'No se puede editar: drop sin stock (todo vendido)'
                                  : 'Editar precio'
                              }
                              style={{
                                opacity: soldOut ? 0.35 : 1,
                                cursor: soldOut ? 'not-allowed' : 'pointer',
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canInteract && !soldOut && (
                            // Carrito solo icono (sin texto) — mismo estilo y
                            // alineación que el botón "Vender" del inventario viejo.
                            // Cuando el drop se agota, el botón desaparece (el
                            // estado agotado se ve por el color rojo de la celda
                            // Stock, sin pill AGOTADO).
                            <button
                              type="button"
                              onClick={() => openSellModal(d)}
                              className="btn-ghost p-2"
                              title="Vender unidades"
                              style={{
                                color: '#a78bfa',
                                borderColor: 'rgba(167,139,250,0.25)',
                                background: 'rgba(167,139,250,0.08)',
                              }}
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteModalDrop(d)}
                              disabled={sold > 0}
                              className="rounded-lg p-1.5 transition-all"
                              style={{
                                background: sold > 0
                                  ? 'rgba(255,255,255,0.02)'
                                  : 'rgba(239,68,68,0.1)',
                                border:
                                  sold > 0
                                    ? '1px solid rgba(255,255,255,0.04)'
                                    : '1px solid rgba(239,68,68,0.2)',
                                color: sold > 0 ? 'rgba(255,255,255,0.2)' : '#f87171',
                                cursor: sold > 0 ? 'not-allowed' : 'pointer',
                              }}
                              title={
                                sold > 0
                                  ? 'No se puede eliminar un drop que ya tiene ventas'
                                  : 'Eliminar drop'
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Botón Reservar — va al final, no altera el orden
                              existente (Pencil, 🛒 Vender, Trash2). Solo aparece
                              mientras el drop tiene stock. El componente se
                              auto-oculta para roles sin acceso raid. */}
                          {!soldOut && (
                            <ReservationQuickButton
                              drop={d}
                              reservations={reservations}
                              raidAccess={raidAccess}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sell modal — inspirado en el modal viejo de ItemTable */}
      {sellModalDrop && (() => {
        const qty = Number(sellModalDrop.quantity) || 0;
        const sold = Number(sellModalDrop.quantitySold) || 0;
        const remaining = qty - sold;
        const sellQtyN = parseInt(sellQty) || 0;
        const totalRev = (Number(sellModalDrop.price) || 0) * sellQtyN;
        const clansList = sellModalDrop.clans || [];
        const perClan =
          clansList.length > 0 ? Math.floor(totalRev / clansList.length) : 0;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !sellDrop.isPending) {
                setSellModalDrop(null);
                setSelectedBuyerId('');
                setSellQty('1');
              }
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl p-6 max-h-[92vh] overflow-y-auto"
              style={{
                background: 'rgba(10,14,22,0.98)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{
                      background: 'rgba(167,139,250,0.15)',
                      border: '1px solid rgba(167,139,250,0.3)',
                    }}
                  >
                    <ShoppingCart className="h-5 w-5" style={{ color: '#a78bfa' }} />
                  </div>
                  <div>
                    <h3
                      className="text-base font-semibold"
                      style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                      Vender Unidades
                    </h3>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {sellModalDrop.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSellModalDrop(null);
                    setSelectedBuyerId('');
                    setSellQty('1');
                  }}
                  disabled={sellDrop.isPending}
                  className="rounded-lg p-2"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Drop info */}
              <div
                className="mb-5 rounded-xl p-4"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border"
                    style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    {sellModalDrop.imageUrl ? (
                      <img
                        src={sellModalDrop.imageUrl}
                        alt={sellModalDrop.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/5">
                        <ShoppingCart className="h-6 w-6 text-white/20" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                      {sellModalDrop.name}
                    </p>
                    <p className="text-xs font-mono" style={{ color: '#a78bfa' }}>
                      ${(Number(sellModalDrop.price) || 0).toLocaleString()} por unidad
                    </p>
                    {sellModalDrop.bossName && (
                      <p
                        className="text-[11px] mt-0.5 flex items-center gap-1"
                        style={{ color: 'rgba(255,255,255,0.45)' }}
                      >
                        <Skull className="h-3 w-3" />
                        {sellModalDrop.bossName}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div
                    className="rounded-lg p-2 text-center"
                    style={{ background: 'rgba(123,241,214,0.08)' }}
                  >
                    <p className="text-lg font-bold font-mono" style={{ color: '#7bf1d6' }}>
                      {qty}
                    </p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Total
                    </p>
                  </div>
                  <div
                    className="rounded-lg p-2 text-center"
                    style={{ background: 'rgba(251,191,36,0.08)' }}
                  >
                    <p className="text-lg font-bold font-mono" style={{ color: '#fbbf24' }}>
                      {sold}
                    </p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Vendidas
                    </p>
                  </div>
                  <div
                    className="rounded-lg p-2 text-center"
                    style={{ background: 'rgba(167,139,250,0.08)' }}
                  >
                    <p className="text-lg font-bold font-mono" style={{ color: '#a78bfa' }}>
                      {remaining}
                    </p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Disponibles
                    </p>
                  </div>
                </div>
              </div>

              {/* Clanes que reciben ganancia — réplica del "Distribución de ganancias" viejo */}
              {clansList.length > 0 && (
                <div
                  className="mb-5 rounded-xl p-3"
                  style={{
                    background: 'rgba(123,241,214,0.06)',
                    border: '1px solid rgba(123,241,214,0.15)',
                  }}
                >
                  <p
                    className="text-xs font-semibold mb-2 flex items-center gap-1"
                    style={{ color: '#7bf1d6' }}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Distribución de ganancias
                  </p>
                  <div className="space-y-1">
                    {clansList.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Flag className="h-3.5 w-3.5" style={{ color: '#7bf1d6' }} />
                          <span
                            className="text-xs"
                            style={{ color: 'rgba(255,255,255,0.7)' }}
                          >
                            {c.name}
                          </span>
                        </div>
                        <span
                          className="text-xs font-mono"
                          style={{ color: '#7bf1d6' }}
                        >
                          {sellQtyN > 0 ? `+$${perClan.toLocaleString()}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {sellQtyN > 0 && clansList.length > 1 && perClan * clansList.length !== totalRev && (
                    <p
                      className="text-[10px] mt-2"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      (redondeo: se reparten {(perClan * clansList.length).toLocaleString()} de{' '}
                      {totalRev.toLocaleString()} adena)
                    </p>
                  )}
                </div>
              )}

              {/* Selector de Comprador / Cuenta — replica el dropdown del
                  modal de venta del inventario viejo (ItemTable.tsx). Solo
                  lista usuarios con acceso al módulo raid (raid_admin,
                  raid_mapper, raid_user). */}
              <div className="mb-5">
                <label
                  className="mb-2 block text-sm font-medium"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  Asignar a Comprador/Cuenta
                </label>
                <FancySelect<string>
                  value={selectedBuyerId}
                  onChange={(v) => setSelectedBuyerId(String(v))}
                  accent="magenta"
                  size="lg"
                  placeholder="Seleccionar cuenta..."
                  searchable
                  searchPlaceholder="Buscar cuenta..."
                  options={buyers.map<FancyOption<string>>((b: any) => {
                    const levelLabel =
                      b.accessLevel === 'raid_admin'
                        ? 'Raid Admin'
                        : b.accessLevel === 'raid_mapper'
                        ? 'Raid Mapper'
                        : b.accessLevel === 'raid_user'
                        ? 'Raid User'
                        : b.accessLevel;
                    return {
                      value: String(b.id),
                      label: b.name,
                      description: levelLabel,
                      emoji: '👤',
                    };
                  })}
                />
                {buyers.length === 0 && (
                  <p
                    className="mt-1.5 text-xs"
                    style={{ color: 'rgba(251,191,36,0.8)' }}
                  >
                    No hay usuarios elegibles. Pedile al super admin que asigne rol raid a alguien.
                  </p>
                )}
              </div>

              {/* Input cantidad */}
              <div className="mb-5">
                <label
                  className="mb-2 block text-sm font-medium"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  ¿Cuántas unidades vender?
                </label>
                <input
                  type="number"
                  value={sellQty}
                  onChange={(e) => setSellQty(e.target.value)}
                  min="1"
                  max={remaining}
                  className="h-12 text-lg font-mono w-full text-center rounded-xl"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                />
                <p
                  className="mt-1.5 text-xs text-center"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                >
                  Máximo disponible: {remaining} unidad(es)
                </p>
                {sellQtyN > 0 && (
                  <div
                    className="mt-3 rounded-xl p-3 text-center"
                    style={{
                      background: 'rgba(167,139,250,0.1)',
                      border: '1px solid rgba(167,139,250,0.2)',
                    }}
                  >
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Total a recaudar
                    </p>
                    <p
                      className="text-xl font-bold font-mono"
                      style={{ color: '#a78bfa' }}
                    >
                      ${totalRev.toLocaleString()}
                    </p>
                    {sellQtyN < remaining && (
                      <p
                        className="text-xs mt-1"
                        style={{ color: 'rgba(255,255,255,0.4)' }}
                      >
                        Quedarán {remaining - sellQtyN} unidad(es) activas
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSellModalDrop(null);
                    setSelectedBuyerId('');
                    setSellQty('1');
                  }}
                  disabled={sellDrop.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.75)',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (sellQtyN < 1) {
                      toast.error('Indicá una cantidad mayor a 0');
                      return;
                    }
                    if (sellQtyN > remaining) {
                      toast.error(`Solo quedan ${remaining} unidades`);
                      return;
                    }
                    if (!selectedBuyerId) {
                      toast.error('Seleccioná un comprador/cuenta');
                      return;
                    }
                    const buyer = buyers.find(
                      (b: any) => String(b.id) === String(selectedBuyerId)
                    );
                    if (!buyer) {
                      toast.error('Comprador no válido');
                      return;
                    }
                    sellDrop.mutate(
                      {
                        id: Number(sellModalDrop.id),
                        quantity: sellQtyN,
                        buyerId: Number(buyer.id),
                        buyerName: String(buyer.name),
                      },
                      {
                        onSuccess: () => {
                          setSellModalDrop(null);
                          setSellQty('1');
                          setSelectedBuyerId('');
                        },
                      }
                    );
                  }}
                  disabled={sellDrop.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(90deg, #a78bfa, #e879f9)',
                    color: '#fff',
                    opacity: sellDrop.isPending ? 0.6 : 1,
                  }}
                >
                  <ShoppingCart className="h-4 w-4" />
                  {sellDrop.isPending ? 'Vendiendo…' : 'Confirmar Venta'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete confirmation modal */}
      {deleteModalDrop && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => {
            if (!deleteDrop.isPending) setDeleteModalDrop(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{
              background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
              border: '1px solid rgba(239,68,68,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5" style={{ color: '#ef4444' }} />
                  <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                    Eliminar drop
                  </h3>
                </div>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Esta acción es irreversible. No se puede eliminar un drop que ya tiene ventas
                  registradas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalDrop(null)}
                disabled={deleteDrop.isPending}
                className="rounded-lg p-1.5"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.6)',
                }}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="rounded-xl p-3 mb-4 flex items-center gap-3"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="h-10 w-10 shrink-0 rounded-lg overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {deleteModalDrop.imageUrl && (
                  <img
                    src={deleteModalDrop.imageUrl}
                    alt={deleteModalDrop.name}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <div
                  className="text-sm font-semibold truncate"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                >
                  {deleteModalDrop.name}
                </div>
                <div
                  className="text-[11px] mt-0.5"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  #{deleteModalDrop.id} · {deleteModalDrop.category} · $
                  {(Number(deleteModalDrop.price) || 0).toLocaleString()} x{' '}
                  {Number(deleteModalDrop.quantity) || 0}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalDrop(null)}
                disabled={deleteDrop.isPending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteDrop.mutate(
                    { id: Number(deleteModalDrop.id) },
                    { onSuccess: () => setDeleteModalDrop(null) }
                  );
                }}
                disabled={deleteDrop.isPending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(90deg, rgba(239,68,68,0.9), rgba(232,121,249,0.9))',
                  border: '1px solid rgba(239,68,68,0.5)',
                  color: '#fff',
                  opacity: deleteDrop.isPending ? 0.6 : 1,
                }}
              >
                <Trash2 className="h-4 w-4" />
                {deleteDrop.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ----- (helper SelectFilter eliminado: reemplazado por FancySelect) ---------
// Stub vacío para preservar simetría; no se usa. Lo dejamos comentado y el
// diff es claro: todas las categorías/ciclos/clanes/estado usan FancySelect.
function _RaidDropsTableSelectFilterLegacy() {
  // placeholder intencional — dejado por si se reinstaura el helper.
  return null;
}
