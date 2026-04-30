import React, { useMemo, useState } from 'react';
import { Pencil, Trash2, CheckCircle, Search, ChevronUp, ChevronDown, ShoppingCart, Users, X, Bookmark } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { categoryMeta, statusMeta, CATEGORIES } from '../../lib/category-meta';
import type { Item, ItemCategory, ItemStatus } from '../../lib/types';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../contexts/AuthContext';
import { ItemReservationButton, type ItemReservationRecord } from './ItemReservationButton';
import { FancySelect, type FancyOption } from '../ui/FancySelect';
import { ImageHoverPreview } from '../ui/ImageHoverPreview';
import type { Character } from '../../lib/types';

// Lista compacta de personajes asociados a un ítem.
// Muestra los primeros MAX_CHAR_AVATARS como avatars apilados y colapsa el
// resto en un chip "+N" con popover al hover — mismo patrón que
// ClansPillList en RaidDropsTable.tsx para "+N más".
const MAX_CHAR_AVATARS = 3;

function AssocCharactersCell({ chars }: { chars: Character[] }) {
  const [hover, setHover] = useState(false);
  if (!chars || chars.length === 0) {
    return <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>;
  }
  const visible = chars.slice(0, MAX_CHAR_AVATARS);
  const overflow = chars.slice(MAX_CHAR_AVATARS);

  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-1">
        {visible.map(char => (
          <div
            key={char.id}
            title={char.name}
            className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${char.avatar} text-white border`}
            style={{ fontSize: '8px', fontWeight: 'bold', borderColor: 'rgba(10,14,22,0.8)' }}
          >
            {char.name.slice(0, 1).toUpperCase()}
          </div>
        ))}
      </div>
      {overflow.length > 0 && (
        <span
          className="relative"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <span
            className="rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap cursor-default"
            style={{
              background: 'rgba(232,121,249,0.12)',
              color: '#e879f9',
              border: '1px solid rgba(232,121,249,0.3)',
              fontWeight: 600,
            }}
          >
            +{overflow.length} más
          </span>
          {hover && (
            <div
              className="absolute z-50 rounded-lg shadow-2xl"
              style={{
                top: 'calc(100% + 6px)',
                left: 0,
                minWidth: 180,
                maxWidth: 260,
                background: '#0a0e16',
                border: '1px solid rgba(232,121,249,0.35)',
                padding: 8,
              }}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: 'rgba(232,121,249,0.7)' }}
              >
                Otros personajes ({overflow.length})
              </p>
              <div className="flex flex-col gap-1">
                {overflow.map(char => (
                  <div key={char.id} className="flex items-center gap-2">
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${char.avatar} text-white`}
                      style={{ fontSize: '8px', fontWeight: 'bold' }}
                    >
                      {char.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.9)' }}>
                      {char.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </span>
      )}
    </div>
  );
}

interface Props {
  items?: Item[];
  compact?: boolean;
}

export function ItemTable({ items: propItems, compact = false }: Props) {
  const { items: allItems, currentUser, confirmItem, deleteItem, updateItem, sellItem, characters } = useApp();
  const { user: authUser } = useAuth();
  const items = propItems ?? allItems;

  // Reservas de items (waitlist). Compartidas con Dashboard porque ambos usan
  // este componente. La query se re-valida automáticamente al crear/cancelar.
  const { data: reservationsData } = trpc.items.reservations.list.useQuery(
    undefined,
    { enabled: !!authUser }
  );
  const reservations: ItemReservationRecord[] = (reservationsData as any[]) || [];

  // Map itemId -> reservas vivas del item, para pill y highlight.
  const reservationsByItem = useMemo(() => {
    const m = new Map<string, ItemReservationRecord[]>();
    for (const r of reservations) {
      const key = String(r.itemId);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  }, [reservations]);

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<ItemCategory | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'ALL' | 'WITH_RESERVATIONS'>('ALL');
  const [sortKey, setSortKey] = useState<'name' | 'price' | 'createdAt'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  // Venta parcial
  const [sellModalItem, setSellModalItem] = useState<Item | null>(null);
  const [sellQty, setSellQty] = useState('1');
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('');
  const [isInternalSale, setIsInternalSale] = useState(false);
  // Confirmación de borrado
  const [deleteModalItem, setDeleteModalItem] = useState<Item | null>(null);
  const [sellReservsOpen, setSellReservsOpen] = useState(false);

  const reservedTotals = useMemo(() => {
    let drops = 0;
    let units = 0;
    reservationsByItem.forEach((rs) => {
      drops += 1;
      for (const r of rs) units += Number(r.quantity) || 0;
    });
    return { drops, units };
  }, [reservationsByItem]);

  // "WITH_RESERVATIONS" es un pseudo-filtro: no es un status real de ítem,
  // sino un toggle que activa el filtrado por ítems con reservas vivas.
  // Se maneja aparte de `statusFilter` para no ensuciar el tipo ItemStatus.
  const filtered = items
    .filter(i => {
      const q = search.toLowerCase();
      const matchesSearch = !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q);
      const matchesCat = catFilter === 'ALL' || i.category === catFilter;
      const statusStr = String(statusFilter);
      let matchesStatus = true;
      if (statusStr === 'WITH_RESERVATIONS') {
        const rs = reservationsByItem.get(String(i.id));
        matchesStatus = !!(rs && rs.length > 0);
      } else if (statusStr !== 'ALL') {
        matchesStatus = i.status === statusFilter;
      }
      return matchesSearch && matchesCat && matchesStatus;
    })
    .sort((a, b) => {
      // Orden por defecto: ítems con stock arriba, agotados/vendidos al final.
      // Dentro de cada grupo aplicamos el sortKey elegido por el usuario.
      const remA = (Number(a.quantity) || 0) - (Number(a.quantitySold) || 0);
      const remB = (Number(b.quantity) || 0) - (Number(b.quantitySold) || 0);
      const outA = (a.status === 'VENDIDO' || remA <= 0) ? 1 : 0;
      const outB = (b.status === 'VENDIDO' || remB <= 0) ? 1 : 0;
      if (outA !== outB) return outA - outB;
      let va: string | number = a[sortKey] ?? '';
      let vb: string | number = b[sortKey] ?? '';
      if (sortKey === 'price') { va = a.price ?? 0; vb = b.price ?? 0; }
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

  // Totales agregados de los ítems filtrados. Mismo orden/semántica que la
  // tabla de drops del menú raid: Unid (restante/total), Vendidas, Vendido
  // (adena cobrada = price*sold), Restante (potencial = price*remaining),
  // Total (sticker price del subset filtrado).
  const totals = useMemo(() => {
    const totalUnits = filtered.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const soldUnits = filtered.reduce((s, i) => s + (Number(i.quantitySold) || 0), 0);
    const remainingUnits = totalUnits - soldUnits;
    const soldRevenue = filtered.reduce(
      (s, i) => s + (Number(i.price) || 0) * (Number(i.quantitySold) || 0),
      0
    );
    const potentialRevenue = filtered.reduce(
      (s, i) =>
        s + (Number(i.price) || 0) * ((Number(i.quantity) || 0) - (Number(i.quantitySold) || 0)),
      0
    );
    const totalRevenue = soldRevenue + potentialRevenue;
    // Reservas: ítems distintos con al menos una reserva viva + total unidades
    // reservadas (suma de quantity). Solo cuenta ítems dentro de `filtered`
    // para que el contador respete los filtros actuales.
    let itemsWithReservations = 0;
    let reservedUnitsTotal = 0;
    for (const it of filtered) {
      const rs = reservationsByItem.get(String(it.id));
      if (rs && rs.length > 0) {
        itemsWithReservations += 1;
        for (const r of rs) reservedUnitsTotal += Number(r.quantity) || 0;
      }
    }
    return {
      totalUnits, soldUnits, remainingUnits,
      soldRevenue, potentialRevenue, totalRevenue,
      itemsWithReservations, reservedUnitsTotal,
    };
  }, [filtered, reservationsByItem]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null;

  const handleConfirm = (id: string, name: string) => {
    confirmItem(id);
    toast.success(`"${name}" confirmado. Imagen bloqueada para Mapper.`);
  };

  const handleDelete = (item: Item) => {
    setDeleteModalItem(item);
  };

  const confirmDelete = () => {
    if (!deleteModalItem) return;
    const name = deleteModalItem.name;
    deleteItem(deleteModalItem.id);
    toast.success(`"${name}" eliminado del inventario.`);
    setDeleteModalItem(null);
  };

  const handleEditPrice = (item: Item) => {
    setEditId(item.id);
    setEditPrice(String(item.price ?? ''));
  };

  const handleSavePrice = (item: Item) => {
    updateItem(item.id, { price: editPrice ? Number(editPrice) : null });
    toast.success('Precio actualizado');
    setEditId(null);
  };

  const { data: clanFundSettings } = trpc.clanFund.getSettings.useQuery(undefined, { staleTime: 30_000 });

  const openSellModal = (item: Item) => {
    setSellModalItem(item);
    setSellQty('1');
    setSelectedBuyerId('');
    setIsInternalSale(false);
    setSellReservsOpen(false);
  };

  const handleSell = () => {
    if (!sellModalItem) return;
    const qty = parseInt(sellQty);
    const remaining = sellModalItem.quantity - sellModalItem.quantitySold;
    if (isNaN(qty) || qty < 1 || qty > remaining) {
      toast.error(`Cantidad inválida. Máximo disponible: ${remaining}`);
      return;
    }
    if (!selectedBuyerId) {
      toast.error('Debes seleccionar un comprador');
      return;
    }

    const buyer = characters.find(c => String(c.id) === String(selectedBuyerId));
    if (!buyer) {
      toast.error('Comprador no encontrado');
      return;
    }

    sellItem({ 
      itemId: sellModalItem.id, 
      quantityToSell: qty,
      buyerId: buyer.id,
      buyerName: buyer.name,
      isInternalSale,
    });

    const newRemaining = remaining - qty;
    if (newRemaining === 0) {
      toast.success(`"${sellModalItem.name}" completamente vendido a ${buyer.name}.`);
    } else {
      toast.success(`Vendidas ${qty} unidad(es) de "${sellModalItem.name}" a ${buyer.name}. Quedan ${newRemaining}.`);
    }
    setSellModalItem(null);
  };

  return (
    <>
      <div className="card-glass rounded-2xl">
        {/* Header — mismo layout que RaidDropsTable:
            fila 1: título + descripción a la izquierda, stats a la derecha.
            fila 2: grilla de filtros expandida (Buscar · Categoría · Estado). */}
        <div className="border-b p-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Inventario de Ítems
                <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-mono" style={{ background: 'rgba(123,241,214,0.12)', color: '#7bf1d6' }}>
                  {filtered.length}
                </span>
                <span className="ml-2 text-xs font-normal" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  · {filtered.length} de {items.length}
                </span>
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Gestión completa con imagen, categoría, precio, cantidad y personajes asociados.
              </p>
            </div>
            {/* Stats a la derecha — mismo orden/colores que la tabla de drops
                del menú raid: Unid · Vendidas · Vendido · Restante · Total
                + pill R clickeable que toggle-filtra a ítems con reservas. */}
            <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: 'rgba(255,255,255,0.55)' }}>
              <span>
                Unid: <span style={{ color: '#7bf1d6' }}>{totals.remainingUnits}</span>/
                {totals.totalUnits}
              </span>
              <span>
                Vendidas: <span style={{ color: '#fbbf24' }}>{totals.soldUnits}</span>
              </span>
              <span>
                Vendido: <span style={{ color: '#fbbf24' }}>${totals.soldRevenue.toLocaleString()}</span>
              </span>
              <span>
                Restante: <span style={{ color: '#a78bfa' }}>${totals.potentialRevenue.toLocaleString()}</span>
              </span>
              <span>
                Total: <span style={{ color: 'rgba(255,255,255,0.85)' }}>${totals.totalRevenue.toLocaleString()}</span>
              </span>
              {totals.itemsWithReservations > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setStatusFilter((s) => (s === 'WITH_RESERVATIONS' ? 'ALL' : 'WITH_RESERVATIONS'))
                  }
                  title={
                    statusFilter === 'WITH_RESERVATIONS'
                      ? 'Quitar filtro de reservas'
                      : 'Filtrar: solo ítems con reservas'
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
                  {totals.itemsWithReservations} {totals.itemsWithReservations === 1 ? 'item' : 'items'} · {totals.reservedUnitsTotal} uds
                </button>
              )}
            </div>
          </div>

          {/* Filters — grilla en fila propia abajo del título, estilo raid. */}
          {!compact && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar ítem por nombre…"
                  className="w-full h-10 rounded-xl pl-9 pr-3 text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.85)',
                  }}
                />
              </div>
              <FancySelect<ItemCategory | 'ALL'>
                value={catFilter}
                onChange={(v) => setCatFilter(v as ItemCategory | 'ALL')}
                accent="turquoise"
                size="md"
                placeholder="Todas las categorías"
                options={[
                  { value: 'ALL', label: 'Todas las categorías', emoji: '📂' },
                  ...CATEGORIES.map<FancyOption<ItemCategory | 'ALL'>>(c => {
                    const meta = categoryMeta[c] || { emoji: '📦', label: c };
                    return { value: c, label: meta.label, emoji: meta.emoji };
                  }),
                ]}
              />
              <FancySelect<ItemStatus | 'ALL' | 'WITH_RESERVATIONS'>
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as ItemStatus | 'ALL' | 'WITH_RESERVATIONS')}
                accent="turquoise"
                size="md"
                placeholder="Todos los estados"
                options={[
                  { value: 'ALL', label: 'Todos los estados', emoji: '🧾' },
                  { value: 'CONFIRMADO', label: 'Confirmado', emoji: '✅' },
                  { value: 'EN_REGISTRO', label: 'En Registro', emoji: '🟡' },
                  { value: 'VENDIDO', label: 'Vendido', emoji: '💰' },
                  { value: 'WITH_RESERVATIONS', label: 'Con reservas', emoji: '🔖' },
                ]}
              />
            </div>
          )}
        </div>

        {/* Table */}
        <div className="table-scroll">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Img</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none" style={{ color: 'rgba(255,255,255,0.3)' }} onClick={() => toggleSort('name')}>
                  <span className="flex items-center gap-1">Nombre <SortIcon k="name" /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Categoría</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none" style={{ color: 'rgba(255,255,255,0.3)' }} onClick={() => toggleSort('price')}>
                  <span className="flex items-center gap-1">Precio <SortIcon k="price" /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Stock</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Personajes</th>
                {!compact && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No se encontraron ítems con los filtros aplicados
                  </td>
                </tr>
              )}
              {filtered.map(item => {
                const catMeta = categoryMeta[item.category] || { label: item.category, badgeClass: 'badge-default', color: '#94a3b8', emoji: '📦' };
                const stMeta = statusMeta[item.status] || { label: item.status, badgeClass: 'badge-default', color: '#94a3b8' };
                const canEdit = currentUser && currentUser.role === 'SUPER_ADMIN' || (currentUser && currentUser.role === 'MAPPER' && item.status === 'EN_REGISTRO');
                const canConfirm = currentUser && currentUser.role === 'SUPER_ADMIN' && item.status === 'EN_REGISTRO';
                const canDelete = currentUser && currentUser.role === 'SUPER_ADMIN';
                const canSell = currentUser && currentUser.role === 'SUPER_ADMIN' && item.status !== 'VENDIDO' && item.status === 'CONFIRMADO';
                const isEditing = editId === item.id;
                const remaining = item.quantity - item.quantitySold;
                const assocChars = characters.filter(c => item.associatedCharacterIds.includes(c.id));
                const itemReservations = reservationsByItem.get(String(item.id)) || [];
                const reservedCount = itemReservations.length;
                const reservedUnits = itemReservations.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                const hasReservations = reservedCount > 0;

                return (
                  <tr
                    key={item.id}
                    className="table-row-hover border-t"
                    style={{
                      borderColor: 'rgba(255,255,255,0.04)',
                      background: hasReservations ? 'rgba(251,191,36,0.05)' : undefined,
                      boxShadow: hasReservations ? 'inset 3px 0 0 0 #fbbf24' : undefined,
                    }}
                  >
                    {/* Image */}
                    <td className="px-4 py-3">
                      <ImageHoverPreview src={item.image?.publicUrl} caption={item.name} size={320}>
                        <div className="h-[30px] w-[30px] overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                          {item.image?.publicUrl ? (
                            <img src={item.image.publicUrl} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-white/5">
                              <ShoppingCart className="h-4 w-4 text-white/20" />
                            </div>
                          )}
                        </div>
                      </ImageHoverPreview>
                    </td>
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{item.name}</p>
                        {hasReservations && (
                          // Mismo pill que /raids/inventory (ReservationsPill en
                          // DropReservationsCell.tsx): "R {unidades} uds".
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none align-middle"
                            style={{
                              background: 'rgba(251,191,36,0.12)',
                              border: '1px solid rgba(251,191,36,0.35)',
                              color: '#fbbf24',
                            }}
                            title={`${reservedCount} reserva(s) · ${reservedUnits} unidad(es)`}
                          >
                            <span className="inline-flex h-2.5 w-2.5 items-center justify-center text-[10px] font-black leading-none">R</span>
                            {reservedUnits} uds
                          </span>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>ID: {item.id}</p>
                    </td>
                    {/* Category */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${catMeta.badgeClass}`}>
                        {catMeta.emoji} {catMeta.label}
                      </span>
                    </td>
                    {/* Price */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                            className="input-dark h-8 w-24 text-xs" autoFocus />
                          <button onClick={() => handleSavePrice(item)} className="btn-primary text-xs px-2 py-1">✓</button>
                          <button onClick={() => setEditId(null)} className="btn-ghost text-xs px-2 py-1">✕</button>
                        </div>
                      ) : (
                        <span className="text-sm font-mono" style={{ color: 'rgba(255,255,255,0.7)' }}>
                          {item.price ? `$${item.price.toLocaleString()}` : '—'}
                        </span>
                      )}
                    </td>
                    {/* Stock */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-mono font-semibold" style={{ color: remaining > 0 ? '#7bf1d6' : '#f87171' }}>
                          {remaining}/{item.quantity}
                        </p>
                        {item.quantitySold > 0 && (
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {item.quantitySold} vendido(s)
                          </p>
                        )}
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${stMeta.badgeClass}`}>
                        {stMeta.label}
                      </span>
                    </td>
                    {/* Associated Characters */}
                    <td className="px-4 py-3">
                      <AssocCharactersCell chars={assocChars} />
                    </td>
                    {/* Actions — reglas replicadas de RaidDropsTable:
                        - ✏️ editar precio: deshabilitado si todo vendido (no tiene sentido cambiar el precio)
                        - 🛒 vender: oculto si no hay stock restante
                        - 🗑️ eliminar: deshabilitado si ya hubo ventas (preserva integridad histórica de purchases/character earnings) */}
                    {!compact && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {canEdit && !isEditing && (
                            <button
                              onClick={() => { if (remaining > 0) handleEditPrice(item); }}
                              disabled={remaining === 0}
                              className="btn-ghost p-2"
                              title={remaining === 0 ? 'No se puede editar: ítem sin stock (todo vendido)' : 'Editar precio'}
                              style={{
                                opacity: remaining === 0 ? 0.35 : 1,
                                cursor: remaining === 0 ? 'not-allowed' : 'pointer',
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canConfirm && (
                            <button onClick={() => handleConfirm(item.id, item.name)} className="btn-ghost p-2" title="Confirmar ítem"
                              style={{ color: '#34d399', borderColor: 'rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.08)' }}>
                              <CheckCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canSell && remaining > 0 && (
                            <button onClick={() => openSellModal(item)} className="btn-ghost p-2" title="Vender unidades"
                              style={{ color: '#a78bfa', borderColor: 'rgba(167,139,250,0.25)', background: 'rgba(167,139,250,0.08)' }}>
                              <ShoppingCart className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => { if (item.quantitySold === 0) handleDelete(item); }}
                              disabled={item.quantitySold > 0}
                              className="rounded-lg p-2 transition-all"
                              style={{
                                background: item.quantitySold > 0 ? 'rgba(255,255,255,0.02)' : 'rgba(239,68,68,0.1)',
                                border: item.quantitySold > 0 ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(239,68,68,0.2)',
                                color: item.quantitySold > 0 ? 'rgba(255,255,255,0.2)' : '#f87171',
                                cursor: item.quantitySold > 0 ? 'not-allowed' : 'pointer',
                              }}
                              title={item.quantitySold > 0 ? 'No se puede eliminar un ítem que ya tiene ventas' : 'Eliminar ítem'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Reservar (waitlist) — visible para todos los roles. */}
                          {authUser && (
                            <ItemReservationButton
                              item={{
                                id: item.id,
                                name: item.name,
                                quantity: item.quantity,
                                quantitySold: item.quantitySold,
                                status: item.status,
                              }}
                              reservations={reservations}
                            />
                          )}
                          {!canEdit && !canConfirm && !canSell && !canDelete && !authUser && (
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!compact && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Mostrando {filtered.length} de {items.length} ítems
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Valor total: <span className="font-mono font-semibold" style={{ color: '#7bf1d6' }}>
                ${(filtered.reduce((s, i) => s + (i.price ?? 0) * (i.quantity - i.quantitySold), 0) ?? 0).toLocaleString()}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Modal de venta parcial */}
      {sellModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setSellModalItem(null); }}>
          <div className="w-full max-w-lg rounded-2xl p-6"
            style={{ background: 'rgba(10,14,22,0.98)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)' }}>
                  <ShoppingCart className="h-5 w-5" style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Vender Unidades</h3>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{sellModalItem.name}</p>
                </div>
              </div>
              <button onClick={() => setSellModalItem(null)} className="btn-ghost p-2">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Item info — compact */}
            <div className="mb-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  {sellModalItem.image?.publicUrl ? (
                    <img src={sellModalItem.image.publicUrl} alt={sellModalItem.name}
                      className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5">
                      <ShoppingCart className="h-5 w-5 text-white/20" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{sellModalItem.name}</p>
                  <p className="text-xs font-mono" style={{ color: '#a78bfa' }}>
                    ${sellModalItem.price?.toLocaleString() ?? '—'} /ud
                  </p>
                </div>
                <div className="flex gap-2 text-center shrink-0">
                  <div className="rounded-lg px-3 py-1.5" style={{ background: 'rgba(123,241,214,0.08)' }}>
                    <p className="text-base font-bold font-mono" style={{ color: '#7bf1d6' }}>{sellModalItem.quantity}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Total</p>
                  </div>
                  <div className="rounded-lg px-3 py-1.5" style={{ background: 'rgba(251,191,36,0.08)' }}>
                    <p className="text-base font-bold font-mono" style={{ color: '#fbbf24' }}>{sellModalItem.quantitySold}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Vendidas</p>
                  </div>
                  <div className="rounded-lg px-3 py-1.5" style={{ background: 'rgba(167,139,250,0.08)' }}>
                    <p className="text-base font-bold font-mono" style={{ color: '#a78bfa' }}>{sellModalItem.quantity - sellModalItem.quantitySold}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Disponibles</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Reservas activas — collapsible */}
            {(() => {
              const itemReservs = reservationsByItem.get(String(sellModalItem.id)) || [];
              if (itemReservs.length === 0) return null;
              const totalUnits = itemReservs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
              return (
                <div className="mb-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <button
                    type="button"
                    onClick={() => setSellReservsOpen(v => !v)}
                    className="w-full flex items-center justify-between p-2.5 text-left"
                  >
                    <span className="text-xs font-semibold flex items-center gap-1" style={{ color: '#fbbf24' }}>
                      <Bookmark className="h-3.5 w-3.5" />
                      Reservas activas ({itemReservs.length})
                      <span className="font-mono" style={{ color: 'rgba(251,191,36,0.7)' }}>· {totalUnits} uds</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ color: '#fbbf24', transform: sellReservsOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                  </button>
                  {sellReservsOpen && (
                    <div className="space-y-1 overflow-y-auto px-2.5 pb-2.5 pr-1" style={{ maxHeight: 120 }}>
                      {itemReservs.map(r => (
                        <div key={r.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full text-white"
                              style={{ fontSize: '8px', fontWeight: 'bold', background: 'rgba(251,191,36,0.25)' }}>
                              {(r.characterName || r.userName || '?').slice(0, 1).toUpperCase()}
                            </div>
                            <span className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                              {r.characterName || r.userName}
                            </span>
                          </div>
                          <span className="text-sm font-mono" style={{ color: '#fbbf24' }}>
                            {r.quantity} ud{r.quantity !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Personajes que recibirán ganancia */}
            {sellModalItem.associatedCharacterIds.length > 0 && (
              <div className="mb-3 rounded-xl p-3" style={{ background: 'rgba(123,241,214,0.06)', border: '1px solid rgba(123,241,214,0.15)' }}>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: '#7bf1d6' }}>
                  <Users className="h-3.5 w-3.5" />
                  Distribución de ganancias
                </p>
                <div className="space-y-1 overflow-y-auto pr-1" style={{ maxHeight: 80 }}>
                  {sellModalItem.associatedCharacterIds.map(cid => {
                    const char = characters.find(c => c.id === cid);
                    if (!char) return null;
                    const qty = parseInt(sellQty) || 0;
                    const basePriceCalc = sellModalItem.price ?? 0;
                    const discPctCalc = isInternalSale ? (Number(clanFundSettings?.internalDiscountPercent) || 0) : 0;
                    const effPriceCalc = Math.floor(basePriceCalc * (1 - discPctCalc / 100));
                    const totalRev = effPriceCalc * qty;
                    const clanTaxCalc = Math.floor(totalRev * (Number(clanFundSettings?.clanTaxPercent) || 0) / 100);
                    const perChar = Math.floor((totalRev - clanTaxCalc) / sellModalItem.associatedCharacterIds.length);
                    return (
                      <div key={cid} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ${char.avatar} text-white`}
                            style={{ fontSize: '8px', fontWeight: 'bold' }}>
                            {char.name.slice(0, 1).toUpperCase()}
                          </div>
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{char.name}</span>
                        </div>
                        <span className="text-xs font-mono" style={{ color: '#7bf1d6' }}>
                          {qty > 0 ? `+$${perChar.toLocaleString()}` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selector de Comprador */}
            <div className="mb-3">
              <label className="mb-2 block text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Asignar a Comprador/Cuenta
              </label>
              <FancySelect<string>
                value={selectedBuyerId}
                onChange={(v) => setSelectedBuyerId(String(v))}
                accent="turquoise"
                size="lg"
                placeholder="Seleccionar cuenta..."
                searchable
                searchPlaceholder="Buscar personaje..."
                options={characters.map<FancyOption<string>>(char => ({
                  value: String(char.id),
                  label: char.name,
                  description: char.class,
                  emoji: '👤',
                }))}
              />
            </div>

            {/* Venta Interna Clan toggle */}
            {clanFundSettings && (Number(clanFundSettings.internalDiscountPercent) > 0 || Number(clanFundSettings.clanTaxPercent) > 0) && (
              <div className="mb-3 rounded-xl p-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                {Number(clanFundSettings.internalDiscountPercent) > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternalSale}
                      onChange={e => setIsInternalSale(e.target.checked)}
                      className="accent-yellow-400"
                    />
                    <span className="text-xs font-semibold" style={{ color: '#fbbf24' }}>
                      Venta Interna Clan (−{clanFundSettings.internalDiscountPercent}% descuento)
                    </span>
                  </label>
                )}
                {Number(clanFundSettings.clanTaxPercent) > 0 && (
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    🏰 Retención del clan: {clanFundSettings.clanTaxPercent}% del precio final
                  </p>
                )}
              </div>
            )}

            {/* Input cantidad */}
            <div className="mb-3">
              <label className="mb-2 block text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>
                ¿Cuántas unidades vender?
              </label>
              <input
                type="number"
                value={sellQty}
                onChange={e => setSellQty(e.target.value)}
                min="1"
                max={sellModalItem.quantity - sellModalItem.quantitySold}
                className="input-dark h-12 text-lg font-mono w-full text-center"
              />
              <p className="mt-1.5 text-xs text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Máximo disponible: {sellModalItem.quantity - sellModalItem.quantitySold} unidad(es)
              </p>
              {parseInt(sellQty) > 0 && sellModalItem.price && (() => {
                const qty = parseInt(sellQty) || 0;
                const baseTotal = (sellModalItem.price ?? 0) * qty;
                const discPct = isInternalSale ? (Number(clanFundSettings?.internalDiscountPercent) || 0) : 0;
                const effPrice = Math.floor((sellModalItem.price ?? 0) * (1 - discPct / 100));
                const totalAfterDiscount = effPrice * qty;
                const clanPct = Number(clanFundSettings?.clanTaxPercent) || 0;
                const clanAmt = Math.floor(totalAfterDiscount * clanPct / 100);
                const netAmount = totalAfterDiscount - clanAmt;

                return (
                  <div className="mt-3 rounded-xl p-3 text-center" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Total a recaudar</p>
                    <p className="text-xl font-bold font-mono" style={{ color: '#a78bfa' }}>
                      ${totalAfterDiscount.toLocaleString()}
                    </p>
                    {discPct > 0 && (
                      <p className="text-xs mt-1" style={{ color: '#fbbf24' }}>
                        Descuento interno: -${(baseTotal - totalAfterDiscount).toLocaleString()} ({discPct}%)
                      </p>
                    )}
                    {clanAmt > 0 && (
                      <p className="text-xs mt-1" style={{ color: '#fbbf24' }}>
                        🏰 Clan: ${clanAmt.toLocaleString()} ({clanPct}%) · Neto: ${netAmount.toLocaleString()}
                      </p>
                    )}
                    {qty < sellModalItem.quantity - sellModalItem.quantitySold && (
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        Quedarán {sellModalItem.quantity - sellModalItem.quantitySold - qty} unidad(es) activas
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button onClick={() => setSellModalItem(null)} className="btn-ghost flex-1 py-2.5">
                Cancelar
              </button>
              <button onClick={handleSell} className="btn-primary flex-1 py-2.5">
                <ShoppingCart className="h-4 w-4" />
                Confirmar Venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de borrado */}
      {deleteModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteModalItem(null); }}>
          <div className="w-full max-w-md rounded-2xl p-5"
            style={{
              background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
              border: '1px solid rgba(239,68,68,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" style={{ color: '#ef4444' }} />
                <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                  Eliminar ítem
                </h3>
              </div>
              <button type="button" onClick={() => setDeleteModalItem(null)} className="btn-ghost p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Esta acción eliminará el ítem del inventario de forma permanente. No se puede deshacer.
            </p>
            <div className="rounded-xl p-3 mb-4 flex items-center gap-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {deleteModalItem.image?.publicUrl ? (
                  <img src={deleteModalItem.image.publicUrl} alt={deleteModalItem.name} className="h-full w-full object-cover" />
                ) : (
                  <Trash2 className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {deleteModalItem.name}
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {deleteModalItem.category} · Stock {deleteModalItem.quantity - deleteModalItem.quantitySold}/{deleteModalItem.quantity}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModalItem(null)} className="btn-ghost flex-1 py-2.5">
                Cancelar
              </button>
              <button onClick={confirmDelete} className="btn-danger flex-1 py-2.5 flex items-center justify-center gap-2">
                <Trash2 className="h-4 w-4" />
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
