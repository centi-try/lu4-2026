import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, CheckCircle, Search, ChevronUp, ChevronDown, ShoppingCart, Users, X, Bookmark, Clock, ClipboardList, Check } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { categoryMeta, statusMeta, CATEGORIES } from '../../lib/category-meta';
import type { Item, ItemCategory, ItemStatus } from '../../lib/types';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../contexts/AuthContext';
import { ItemReservationButton, type ItemReservationRecord } from './ItemReservationButton';
import { ItemTypeahead } from './ItemTypeahead';
import { FancySelect, type FancyOption } from '../ui/FancySelect';
import { ImageHoverPreview } from '../ui/ImageHoverPreview';
import type { Character } from '../../lib/types';
import { reformatWhileTyping, parseThousands, formatThousands } from '../../lib/number-format';

// #10: nombre largo → truncar a 50 chars con "…" y tooltip con el nombre completo.
const NAME_TRUNCATE_LEN = 50;
function truncateName(name: string): { shown: string; truncated: boolean } {
  if (!name) return { shown: '', truncated: false };
  if (name.length <= NAME_TRUNCATE_LEN) return { shown: name, truncated: false };
  return { shown: name.slice(0, NAME_TRUNCATE_LEN) + '…', truncated: true };
}

// Lista compacta de personajes asociados a un ítem.
// Muestra los primeros MAX_CHAR_AVATARS como avatars apilados y colapsa el
// resto en un chip "+N" con popover al hover — mismo patrón que
// ClansPillList en RaidDropsTable.tsx para "+N más".
const MAX_CHAR_AVATARS = 3;

function AssocCharactersCell({ chars }: { chars: Character[] }) {
  const [hover, setHover] = useState(false);
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  if (!chars || chars.length === 0) {
    return <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>;
  }
  const visible = chars.slice(0, MAX_CHAR_AVATARS);
  const overflow = chars.slice(MAX_CHAR_AVATARS);

  const handleEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popupHeight = overflow.length * 28 + 40;
      const fitsBelow = rect.bottom + 6 + popupHeight < window.innerHeight;
      setPopupPos({
        top: fitsBelow ? rect.bottom + 6 : rect.top - popupHeight - 6,
        left: Math.min(rect.left, window.innerWidth - 220),
      });
    }
    setHover(true);
  };

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
          ref={triggerRef}
          className="relative"
          onMouseEnter={handleEnter}
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
          {hover && createPortal(
            <div
              className="fixed z-[9999] rounded-lg shadow-2xl pointer-events-none"
              style={{
                top: popupPos.top,
                left: popupPos.left,
                minWidth: 200,
                maxWidth: 300,
                background: '#0a0e16',
                border: '1px solid rgba(232,121,249,0.35)',
                padding: 10,
              }}
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'rgba(232,121,249,0.7)' }}
              >
                Otros personajes ({overflow.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {overflow.map(char => (
                  <div key={char.id} className="flex items-center gap-2">
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${char.avatar} text-white`}
                      style={{ fontSize: '8px', fontWeight: 'bold' }}
                    >
                      {char.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.9)' }}>
                      {char.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// H — Botón Historial de Ventas del Ítem
// ============================================================================
interface Purchase {
  id: string;
  itemId: string;
  buyerName: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  total: number;
  isInternalSale?: boolean;
  discountPct?: number;
  clanTax?: number;
  createdAt: string;
}

function ItemSaleHistoryButton({ itemId, itemName }: { itemId: string; itemName: string }) {
  const [open, setOpen] = useState(false);
  const { data: purchasesData } = trpc.items.listPurchases.useQuery();
  const purchases: Purchase[] = ((purchasesData as any[]) || []).filter(
    (p: any) => String(p.itemId) === String(itemId)
  ).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const totalSold = purchases.reduce((s, p) => s + (p.quantity || 0), 0);
  const totalRevenue = purchases.reduce((s, p) => s + (p.total || 0), 0);
  const internalCount = purchases.filter(p => p.isInternalSale).length;
  const normalCount = purchases.length - internalCount;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost p-2"
        title={purchases.length > 0 ? `Historial de ventas (${purchases.length})` : 'Sin ventas registradas'}
        style={{
          color: purchases.length > 0 ? '#a78bfa' : 'rgba(255,255,255,0.2)',
          borderColor: purchases.length > 0 ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.04)',
          background: purchases.length > 0 ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.02)',
        }}
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[13px] font-black leading-none">H</span>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl"
            style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: '#a78bfa' }} />
                <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Historial de Ventas</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 transition-colors hover:bg-white/5">
                <X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
              </button>
            </div>

            {/* Item name */}
            <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>{itemName}</p>
            </div>

            {/* Summary stats */}
            {purchases.length > 0 && (
              <div className="grid grid-cols-4 gap-2 px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-center">
                  <p className="text-lg font-bold font-mono" style={{ color: '#a78bfa' }}>{totalSold}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Vendidas</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold font-mono" style={{ color: '#34d399' }}>${totalRevenue.toLocaleString()}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Recaudado</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold font-mono" style={{ color: '#60a5fa' }}>{normalCount}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Normal</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold font-mono" style={{ color: '#fbbf24' }}>{internalCount}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>V. Interna</p>
                </div>
              </div>
            )}

            {/* Sales list */}
            <div className="overflow-y-auto px-5 py-3" style={{ maxHeight: 320 }}>
              {purchases.length === 0 ? (
                <p className="text-center text-xs py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Este ítem aún no tiene ventas registradas.
                </p>
              ) : (
                <div className="space-y-2">
                  {purchases.map((p, idx) => {
                    const isInternal = !!p.isInternalSale;
                    const isExternal = !!(p as any).isExternalSale;
                    const date = new Date(p.createdAt).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const tagStyle = isExternal
                      ? { background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }
                      : isInternal
                        ? { background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }
                        : { background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' };
                    const tagLabel = isExternal ? 'Venta Externa (City)' : isInternal ? `Venta Interna (-${p.discountPct || 20}%)` : 'Venta Normal';
                    return (
                      <div
                        key={p.id || idx}
                        className="rounded-xl p-3"
                        style={{
                          background: isExternal ? 'rgba(56,189,248,0.04)' : isInternal ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isExternal ? 'rgba(56,189,248,0.15)' : isInternal ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        {/* Comprador + tipo de venta */}
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>{isExternal ? 'Venta' : 'Comprador'}</span>
                            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{isExternal ? 'Venta Externa (City)' : p.buyerName}</p>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={tagStyle}>
                            {tagLabel}
                          </span>
                        </div>
                        {/* Detalle con etiquetas — 2 columnas alineadas */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-1.5">
                          {/* Fila 1: Cantidad | Precio original */}
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.35)' }}>Cantidad: </span>
                            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{p.quantity} ud</span>
                          </div>
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.35)' }}>Precio original: </span>
                            <span style={isInternal ? { textDecoration: 'line-through', color: 'rgba(255,255,255,0.3)' } : { color: 'rgba(255,255,255,0.7)' }}>
                              ${(p.originalPrice || p.price).toLocaleString()}
                            </span>
                          </div>
                          {/* Fila 2: Precio con dto (solo interna) | Total cobrado */}
                          {isInternal ? (
                            <div>
                              <span style={{ color: 'rgba(255,255,255,0.35)' }}>Precio con dto: </span>
                              <span style={{ color: '#fbbf24' }}>${p.price.toLocaleString()} c/u</span>
                            </div>
                          ) : (
                            <div />
                          )}
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.35)' }}>Total cobrado: </span>
                            <span className="font-semibold" style={{ color: '#34d399' }}>${p.total.toLocaleString()}</span>
                          </div>
                          {/* Fila 3: Retención clan | Neto vendedor (solo si hay tax) */}
                          {p.clanTax ? (
                            <>
                              <div>
                                <span style={{ color: 'rgba(255,255,255,0.35)' }}>Retención clan: </span>
                                <span style={{ color: '#f87171' }}>${p.clanTax.toLocaleString()}</span>
                              </div>
                              <div>
                                <span style={{ color: 'rgba(255,255,255,0.35)' }}>Neto vendedor: </span>
                                <span className="font-semibold" style={{ color: '#34d399' }}>${(p.total - (p.clanTax || 0)).toLocaleString()}</span>
                              </div>
                            </>
                          ) : null}
                        </div>
                        {/* Fecha */}
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Fecha:</span>
                          <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{date}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ============================================================================
// Resumen de Inventario — modal solo para Super Admin
// ============================================================================
// Agrupa los ítems por nombre + categoría y contabiliza el stock disponible
// (cantidad - vendidas) para cuadrar lo registrado en la página contra lo
// físico en mano. Datos siempre frescos: recalcula sobre `items` cada apertura.
// La validación es un checklist por sesión (se reinicia al cerrar el modal).
function InventorySummaryButton({
  items,
  resolveCategoryIcon,
  resolveResponsibleName,
}: {
  items: Item[];
  resolveCategoryIcon: (cat: string) => string;
  resolveResponsibleName: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Filtros: responsable (id) y tipo (cooperativo/individual). 'all' = sin filtro.
  const [respFilter, setRespFilter] = useState<string>('all');
  const [coopFilter, setCoopFilter] = useState<'all' | 'coop' | 'indiv'>('all');
  // Claves validadas en la sesión actual. Se limpia al abrir/cerrar.
  const [validated, setValidated] = useState<Set<string>>(new Set());
  // Edición de precio por grupo: clave del grupo en edición + valor tipeado.
  const { updateItem, bulkSetItemCooperative, bulkSetItemPrice, bulkSetItemShop, shops, createShop, renameShop, deleteShop } = useApp();
  // Cambios de Cooperativo/Individual PENDIENTES (por clave de grupo). No se
  // aplican hasta pulsar "Guardar cambios" — así un lote grande hace una sola
  // escritura al backend en vez de N mutaciones que tumban la página.
  const [coopDraft, setCoopDraft] = useState<Map<string, boolean>>(new Map());
  // Asignación de TIENDA pendiente por grupo (clave → shopId | null). Mismo
  // patrón de borrador que Cooperativo: se aplica en lote al "Guardar cambios".
  const [shopDraft, setShopDraft] = useState<Map<string, string | null>>(new Map());
  const [editingPriceKey, setEditingPriceKey] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  // Tab activo del modal y gestión de nombres de tienda.
  const [activeTab, setActiveTab] = useState<'resumen' | 'tiendas' | 'porVendedor'>('resumen');
  const [newShopName, setNewShopName] = useState('');
  // Resumen por vendedor + reset. Solo lectura del backend (persistente).
  const summaryUtils = trpc.useUtils();
  const shopSummaryQ = trpc.items.shops.summary.useQuery(undefined, { enabled: open && activeTab === 'porVendedor' });
  const [resetConfirm, setResetConfirm] = useState(false);
  const resetShopsMut = trpc.items.shops.reset.useMutation({
    onSuccess: (r: any) => {
      summaryUtils.items.shops.summary.invalidate();
      summaryUtils.items.list.invalidate();
      summaryUtils.items.listPurchases.invalidate();
      setResetConfirm(false);
      toast.success(`Tiendas reseteadas: ${r?.items ?? 0} ítem(s) sin tienda, ${r?.sales ?? 0} venta(s) desvinculada(s).`);
    },
    onError: (e) => toast.error(e.message),
  });
  const [renamingShopId, setRenamingShopId] = useState<string | null>(null);
  const [renameShopDraft, setRenameShopDraft] = useState('');
  const [deleteShopTarget, setDeleteShopTarget] = useState<{ id: string; name: string; used: number } | null>(null);
  const shopName = (id: string | null | undefined) =>
    id ? (shops.find(s => s.id === String(id))?.name || 'Tienda') : 'Sin tienda';

  // Responsables presentes entre los ítems con stock disponible (para el filtro).
  const responsables = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      const available = (Number(it.quantity) || 0) - (Number(it.quantitySold) || 0);
      if (available <= 0) continue;
      const id = it.responsibleUserId ? String(it.responsibleUserId) : '__none__';
      if (!map.has(id)) {
        const name = id === '__none__'
          ? 'Sin responsable'
          : (resolveResponsibleName(id) || it.responsibleName || 'Sin responsable');
        map.set(id, name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, resolveResponsibleName]);

  const groups = useMemo(() => {
    const map = new Map<string, {
      key: string;
      name: string;
      category: ItemCategory;
      image: string;
      available: number;
      registros: number;
      itemIds: string[];
      prices: number[];
      coopCount: number;
      shopIds: (string | null)[];
    }>();
    for (const it of items) {
      const available = (Number(it.quantity) || 0) - (Number(it.quantitySold) || 0);
      if (available <= 0) continue; // opción A: solo stock disponible
      // Filtro por responsable.
      if (respFilter !== 'all') {
        const id = it.responsibleUserId ? String(it.responsibleUserId) : '__none__';
        if (id !== respFilter) continue;
      }
      // Filtro por tipo cooperativo/individual.
      if (coopFilter === 'coop' && !it.isCooperative) continue;
      if (coopFilter === 'indiv' && it.isCooperative) continue;
      const key = `${it.name.trim().toLowerCase()}||${it.category}`;
      const price = Number(it.price) || 0;
      const shopId = it.shopId ? String(it.shopId) : null;
      const existing = map.get(key);
      if (existing) {
        existing.available += available;
        existing.registros += 1;
        existing.itemIds.push(it.id);
        existing.prices.push(price);
        existing.shopIds.push(shopId);
        if (it.isCooperative) existing.coopCount += 1;
        if (!existing.image) existing.image = it.image?.publicUrl || '';
      } else {
        map.set(key, {
          key,
          name: it.name.trim(),
          category: it.category,
          image: it.image?.publicUrl || resolveCategoryIcon(it.category) || '',
          available,
          registros: 1,
          itemIds: [it.id],
          prices: [price],
          coopCount: it.isCooperative ? 1 : 0,
          shopIds: [shopId],
        });
      }
    }
    return Array.from(map.values())
      .map(g => {
        const min = Math.min(...g.prices);
        const max = Math.max(...g.prices);
        // El grupo se considera Cooperativo solo si TODOS sus ítems lo son.
        const allCoop = g.itemIds.length > 0 && g.coopCount === g.itemIds.length;
        // Tienda del grupo: uniformShopId si todos los ítems comparten la misma
        // (o null = sin tienda). undefined = mezcla (varios) → sin valor único.
        const distinctShops = Array.from(new Set(g.shopIds.map(s => s ?? '__none__')));
        const uniformShopId: string | null | undefined = distinctShops.length === 1
          ? (g.shopIds[0] ?? null)
          : undefined;
        return { ...g, minPrice: min, maxPrice: max, uniformPrice: min === max ? min : null, allCoop, uniformShopId };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, resolveCategoryIcon, respFilter, coopFilter]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q));
  }, [groups, search]);

  const totalUnits = groups.reduce((s, g) => s + g.available, 0);
  const validatedCount = groups.filter(g => validated.has(g.key)).length;

  const openModal = () => {
    setValidated(new Set());
    setSearch('');
    setRespFilter('all');
    setCoopFilter('all');
    setEditingPriceKey(null);
    setPriceDraft('');
    setCoopDraft(new Map());
    setShopDraft(new Map());
    setActiveTab('resumen');
    setNewShopName('');
    setRenamingShopId(null);
    setRenameShopDraft('');
    setOpen(true);
  };
  const closeModal = () => {
    setOpen(false);
    setValidated(new Set());
    setSearch('');
    setRespFilter('all');
    setCoopFilter('all');
    setEditingPriceKey(null);
    setPriceDraft('');
    setCoopDraft(new Map());
    setShopDraft(new Map());
    setActiveTab('resumen');
    setNewShopName('');
    setRenamingShopId(null);
    setRenameShopDraft('');
  };
  const toggleValidated = (key: string) => {
    setValidated(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Abre el editor de precio de un grupo, precargando el precio uniforme si lo hay.
  const startEditPrice = (g: { key: string; uniformPrice: number | null }) => {
    setEditingPriceKey(g.key);
    setPriceDraft(g.uniformPrice != null && g.uniformPrice > 0 ? formatThousands(g.uniformPrice) : '');
  };
  const cancelEditPrice = () => {
    setEditingPriceKey(null);
    setPriceDraft('');
  };
  // Aplica el nuevo precio base a TODOS los ítems del grupo (bulk). El descuento
  // de clan se sigue calculando solo; esto solo cambia el precio base.
  const saveGroupPrice = (g: { key: string; itemIds: string[]; name: string }) => {
    const parsed = parseThousands(priceDraft);
    if (parsed === null || parsed <= 0) { toast.error('Precio inválido.'); return; }
    // Una sola llamada en lote (evita N mutaciones que tumban la página con grupos grandes).
    bulkSetItemPrice(g.itemIds, parsed);
    toast.success(`Precio de "${g.name}" actualizado a $${parsed.toLocaleString()} (${g.itemIds.length} ${g.itemIds.length === 1 ? 'ítem' : 'ítems'}).`);
    setEditingPriceKey(null);
    setPriceDraft('');
  };

  // Estado de Cooperativo mostrado para un grupo: el borrador si existe, si no
  // el estado real guardado (g.allCoop).
  const groupCoopState = (g: { key: string; allCoop: boolean }) =>
    coopDraft.has(g.key) ? Boolean(coopDraft.get(g.key)) : g.allCoop;

  // Marca/desmarca un grupo en el BORRADOR (no escribe al backend todavía).
  const setGroupCoopDraft = (g: { key: string }, value: boolean) => {
    setCoopDraft(prev => {
      const next = new Map(prev);
      next.set(g.key, value);
      return next;
    });
  };

  // Marca/desmarca en el borrador TODOS los grupos visibles (respeta filtros y
  // buscador). El check global de arriba en el modal.
  const setAllShownCoopDraft = (value: boolean) => {
    setCoopDraft(prev => {
      const next = new Map(prev);
      for (const g of shown) next.set(g.key, value);
      return next;
    });
  };
  const allShownCoop = shown.length > 0 && shown.every(g => groupCoopState(g));

  // ---- Tienda por grupo (borrador) ----
  // Valor de tienda mostrado: el borrador si existe; si no, el uniforme del
  // grupo (string=tienda, null=sin tienda, undefined=varios/mezcla).
  const groupShopState = (g: { key: string; uniformShopId: string | null | undefined }): string | null | undefined =>
    shopDraft.has(g.key) ? shopDraft.get(g.key)! : g.uniformShopId;

  const setGroupShopDraft = (g: { key: string }, value: string | null) => {
    setShopDraft(prev => {
      const next = new Map(prev);
      next.set(g.key, value);
      return next;
    });
  };

  // Un grupo tiene cambio de tienda pendiente si su borrador difiere de la
  // tienda uniforme actual (o si el grupo estaba mezclado → cualquier valor unifica).
  const shopChanged = (g: { key: string; uniformShopId: string | null | undefined }) =>
    shopDraft.has(g.key) && shopDraft.get(g.key) !== g.uniformShopId;

  // Cambios pendientes: grupos cuyo estado en borrador difiere del real.
  const pendingGroups = shown.filter(g => coopDraft.has(g.key) && Boolean(coopDraft.get(g.key)) !== g.allCoop);
  const hasPendingCoop = pendingGroups.length > 0;
  const pendingShopGroups = shown.filter(shopChanged);
  const hasPendingShop = pendingShopGroups.length > 0;
  const hasPending = hasPendingCoop || hasPendingShop;
  const pendingCount = pendingGroups.length + pendingShopGroups.length;

  const discardChanges = () => { setCoopDraft(new Map()); setShopDraft(new Map()); };

  // Aplica TODOS los cambios pendientes al backend en pocas llamadas en lote
  // (una por valor de Cooperativo/Individual y una por cada tienda destino).
  const saveChanges = () => {
    const toCoop: string[] = [];
    const toIndiv: string[] = [];
    for (const g of pendingGroups) {
      const value = Boolean(coopDraft.get(g.key));
      (value ? toCoop : toIndiv).push(...g.itemIds);
    }
    if (toCoop.length > 0) bulkSetItemCooperative(toCoop, true);
    if (toIndiv.length > 0) bulkSetItemCooperative(toIndiv, false);

    // Agrupar los ítems por tienda destino → una llamada por destino distinto.
    const byShop = new Map<string, string[]>();
    for (const g of pendingShopGroups) {
      const target = shopDraft.get(g.key) ?? null;
      const bucket = target === null ? '__none__' : String(target);
      const arr = byShop.get(bucket) || [];
      arr.push(...g.itemIds);
      byShop.set(bucket, arr);
    }
    let shopItems = 0;
    for (const [bucket, ids] of Array.from(byShop.entries())) {
      bulkSetItemShop(ids, bucket === '__none__' ? null : bucket);
      shopItems += ids.length;
    }

    const coopItems = toCoop.length + toIndiv.length;
    const parts: string[] = [];
    if (coopItems > 0) parts.push(`${coopItems} en Cooperativo/Individual`);
    if (shopItems > 0) parts.push(`${shopItems} en Tienda`);
    toast.success(`Cambios guardados (${parts.join(' · ')}).`);
    setCoopDraft(new Map());
    setShopDraft(new Map());
  };

  // ---- Gestión de nombres de tienda (inmediato, no borrador) ----
  const handleCreateShop = () => {
    const name = newShopName.trim();
    if (!name) { toast.error('Escribe un nombre de tienda.'); return; }
    if (shops.some(s => s.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.error('Ya existe una tienda con ese nombre.'); return;
    }
    createShop(name);
    toast.success(`Tienda "${name}" creada.`);
    setNewShopName('');
  };
  const startRenameShop = (id: string, name: string) => { setRenamingShopId(id); setRenameShopDraft(name); };
  const handleRenameShop = (id: string) => {
    const name = renameShopDraft.trim();
    if (!name) { toast.error('El nombre no puede estar vacío.'); return; }
    if (shops.some(s => s.id !== id && s.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.error('Ya existe una tienda con ese nombre.'); return;
    }
    renameShop(id, name);
    toast.success('Tienda renombrada.');
    setRenamingShopId(null);
    setRenameShopDraft('');
  };
  const shopUsageCount = (id: string) => items.filter(it => String(it.shopId || '') === String(id)).length;
  const confirmDeleteShop = async () => {
    if (!deleteShopTarget) return;
    const { id } = deleteShopTarget;
    try {
      await deleteShop(id);
      toast.success('Tienda borrada.');
      setDeleteShopTarget(null);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo borrar la tienda.');
      setDeleteShopTarget(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-xl px-3 h-10 text-xs font-semibold transition"
        title="Resumen de inventario: agrupa por nombre + categoría y contabiliza el stock disponible para validar contra lo físico"
        style={{
          background: 'rgba(123,241,214,0.1)',
          border: '1px solid rgba(123,241,214,0.3)',
          color: '#7bf1d6',
        }}
      >
        <ClipboardList className="h-4 w-4" />
        Resumen
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col"
            style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', height: '90vh', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'rgba(123,241,214,0.1)', border: '1px solid rgba(123,241,214,0.25)' }}>
                  <ClipboardList className="h-4 w-4" style={{ color: '#7bf1d6' }} />
                </div>
                <div>
                  <h3 className="text-base font-bold leading-tight" style={{ color: 'rgba(255,255,255,0.95)' }}>Resumen de Inventario</h3>
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Stock, tiendas y ventas por vendedor</p>
                </div>
              </div>
              <button type="button" onClick={closeModal} title="Cerrar" className="rounded-lg p-1.5 transition-colors hover:bg-white/10">
                <X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
              </button>
            </div>

            {/* Tabs: Resumen / Tiendas */}
            <div className="flex items-center gap-1.5 px-6 pt-4 shrink-0">
              {([['resumen', '📋 Resumen'], ['tiendas', '🏪 Tiendas'], ['porVendedor', '💰 Por vendedor']] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                  style={{
                    background: activeTab === tab ? 'rgba(123,241,214,0.12)' : 'rgba(255,255,255,0.03)',
                    color: activeTab === tab ? '#7bf1d6' : 'rgba(255,255,255,0.55)',
                    border: `1px solid ${activeTab === tab ? 'rgba(123,241,214,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === 'resumen' && (
            <>
            {/* Stats + search */}
            <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-4 text-xs mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
                <span>Grupos: <span className="font-mono font-bold" style={{ color: '#7bf1d6' }}>{groups.length}</span></span>
                <span>Unidades disponibles: <span className="font-mono font-bold" style={{ color: '#a78bfa' }}>{totalUnits.toLocaleString()}</span></span>
                <span>Validados: <span className="font-mono font-bold" style={{ color: '#34d399' }}>{validatedCount}/{groups.length}</span></span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar en el resumen…"
                  className="w-full h-9 rounded-xl pl-9 pr-3 text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
                />
              </div>
              {/* Filtros: responsable + tipo */}
              <div className="flex items-center gap-2 mt-2">
                <select
                  value={respFilter}
                  onChange={e => setRespFilter(e.target.value)}
                  className="h-9 flex-1 min-w-0 rounded-xl px-2 text-xs outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
                >
                  <option value="all">👤 Responsable: Todos</option>
                  {responsables.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <select
                  value={coopFilter}
                  onChange={e => setCoopFilter(e.target.value as 'all' | 'coop' | 'indiv')}
                  className="h-9 rounded-xl px-2 text-xs outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
                >
                  <option value="all">Tipo: Todos</option>
                  <option value="coop">🤝 Cooperativo</option>
                  <option value="indiv">👤 Individual</option>
                </select>
              </div>
              {/* Marcar todo el lote (visible) como Cooperativo */}
              {shown.length > 0 && (
                <label
                  className="mt-2 flex items-center gap-2 rounded-xl px-2.5 py-1.5 cursor-pointer select-none w-fit"
                  style={{
                    background: allShownCoop ? 'rgba(123,241,214,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${allShownCoop ? 'rgba(123,241,214,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                  title="Marca o desmarca como Cooperativo todos los grupos que se están mostrando (respeta filtros y búsqueda)."
                >
                  <input
                    type="checkbox"
                    checked={allShownCoop}
                    onChange={e => setAllShownCoopDraft(e.target.checked)}
                    className="h-4 w-4 accent-[#7bf1d6]"
                  />
                  <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    🤝 Marcar todo el lote como Cooperativo
                  </span>
                </label>
              )}
            </div>

            {/* Groups list */}
            <div className="overflow-y-auto px-5 py-3 flex-1">
              {groups.length === 0 ? (
                <p className="text-center text-xs py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  No hay ítems con stock disponible.
                </p>
              ) : shown.length === 0 ? (
                <p className="text-center text-xs py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Sin resultados para “{search}”.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {shown.map(g => {
                    const isValidated = validated.has(g.key);
                    const meta = categoryMeta[g.category] || { emoji: '📦', label: g.category };
                    const isEditingPrice = editingPriceKey === g.key;
                    const priceLabel = g.uniformPrice != null
                      ? `$${g.uniformPrice.toLocaleString()}`
                      : `varios ($${g.minPrice.toLocaleString()}–$${g.maxPrice.toLocaleString()})`;
                    return (
                      <div
                        key={g.key}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors"
                        style={{
                          background: isValidated ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isValidated ? 'rgba(16,185,129,0.28)' : 'rgba(255,255,255,0.05)'}`,
                        }}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleValidated(g.key)}
                          title={isValidated ? 'Marcar como no validado' : 'Marcar como validado (confirmado contra lo físico)'}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                          style={{
                            background: isValidated ? '#10b981' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${isValidated ? '#10b981' : 'rgba(255,255,255,0.2)'}`,
                          }}
                        >
                          {isValidated && <Check className="h-3.5 w-3.5" style={{ color: '#fff' }} />}
                        </button>
                        {/* Image */}
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                          {g.image ? (
                            <img src={g.image} alt={g.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-white/5">
                              <ShoppingCart className="h-4 w-4 text-white/20" />
                            </div>
                          )}
                        </div>
                        {/* Name + category + precio */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: isValidated ? '#10b981' : 'rgba(255,255,255,0.9)' }}>
                            {g.name}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {meta.emoji} {meta.label}
                            {g.registros > 1 && <span> · {g.registros} registros</span>}
                          </p>
                          {isEditingPrice ? (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-base font-mono font-bold" style={{ color: '#7bf1d6' }}>$</span>
                              <input
                                type="text"
                                autoFocus
                                value={priceDraft}
                                onChange={e => setPriceDraft(reformatWhileTyping(e.target.value))}
                                onKeyDown={e => { if (e.key === 'Enter') saveGroupPrice(g); if (e.key === 'Escape') cancelEditPrice(); }}
                                placeholder="Precio base"
                                className="h-9 w-36 rounded-lg px-2.5 text-base font-mono font-bold outline-none"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(123,241,214,0.4)', color: '#7bf1d6' }}
                              />
                              <button type="button" onClick={() => saveGroupPrice(g)} title="Guardar precio" className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)' }}>
                                <Check className="h-4 w-4" style={{ color: '#34d399' }} />
                              </button>
                              <button type="button" onClick={cancelEditPrice} title="Cancelar" className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }}>
                                <X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditPrice(g)}
                              title="Editar precio base de todos los ítems del grupo"
                              className="mt-1.5 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-base font-mono font-bold transition-colors"
                              style={{ color: '#7bf1d6', background: 'rgba(123,241,214,0.08)', border: '1px solid rgba(123,241,214,0.22)' }}
                            >
                              {priceLabel}
                              <Pencil className="h-3.5 w-3.5" style={{ color: 'rgba(123,241,214,0.75)' }} />
                            </button>
                          )}
                          {/* Tipo Cooperativo/Individual — click marca/desmarca todo el grupo (pendiente hasta Guardar) */}
                          {(() => {
                            const coop = groupCoopState(g);
                            const dirty = coopDraft.has(g.key) && coop !== g.allCoop;
                            return (
                              <button
                                type="button"
                                onClick={() => setGroupCoopDraft(g, !coop)}
                                title={coop
                                  ? 'Cooperativo — clic para pasar todo el grupo a Individual'
                                  : 'Individual — clic para marcar todo el grupo como Cooperativo'}
                                className="mt-1.5 ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors align-middle"
                                style={{
                                  background: coop ? 'rgba(123,241,214,0.15)' : 'rgba(255,255,255,0.06)',
                                  color: coop ? '#7bf1d6' : 'rgba(255,255,255,0.5)',
                                  border: `1px solid ${coop ? 'rgba(123,241,214,0.3)' : 'rgba(255,255,255,0.12)'}`,
                                }}
                              >
                                {coop ? '🤝 Cooperativo' : '👤 Individual'}
                                {dirty && <span title="Cambio pendiente de guardar" style={{ color: '#fbbf24' }}>•</span>}
                              </button>
                            );
                          })()}
                          {/* Tienda del grupo — selector (borrador hasta Guardar). Solo referencia. */}
                          {(() => {
                            const shopState = groupShopState(g);
                            const dirty = shopChanged(g);
                            // Valor del <select>: '' = varios/mezcla, '__none__' = sin tienda.
                            const selectValue = shopState === undefined ? '' : (shopState === null ? '__none__' : String(shopState));
                            return (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>🏪</span>
                                <select
                                  value={selectValue}
                                  onChange={e => {
                                    const v = e.target.value;
                                    if (v === '') return; // "Varios" no es una acción
                                    setGroupShopDraft(g, v === '__none__' ? null : v);
                                  }}
                                  className="h-7 rounded-lg px-2 text-[11px] font-semibold outline-none"
                                  style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${dirty ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.12)'}`,
                                    color: shopState ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                                    maxWidth: '11rem',
                                  }}
                                  title="Tienda donde está puesto a la venta el grupo (solo referencia)"
                                >
                                  {shopState === undefined && <option value="">— Varios —</option>}
                                  <option value="__none__">Sin tienda</option>
                                  {shops.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                                {dirty && <span title="Cambio pendiente de guardar" style={{ color: '#fbbf24' }}>•</span>}
                              </div>
                            );
                          })()}
                        </div>
                        {/* Available count */}
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-mono font-bold" style={{ color: '#a78bfa' }}>{g.available.toLocaleString()}</p>
                          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>disponibles</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </>
            )}

            {activeTab === 'tiendas' && (
              <div className="overflow-y-auto px-5 py-3 flex-1">
                <p className="text-[11px] mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Registra los nombres de tienda (personajes) que luego asignarás a los grupos en la pestaña 📋 Resumen. Es solo una referencia: no cambia el estado del ítem ni afecta ciclos.
                </p>
                {/* Crear tienda */}
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={newShopName}
                    onChange={e => setNewShopName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateShop(); }}
                    placeholder="Nombre de la tienda…"
                    maxLength={60}
                    className="h-9 flex-1 rounded-xl px-3 text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateShop}
                    className="h-9 rounded-xl px-3 text-xs font-semibold transition-colors"
                    style={{ background: 'rgba(123,241,214,0.12)', color: '#7bf1d6', border: '1px solid rgba(123,241,214,0.3)' }}
                  >
                    + Agregar
                  </button>
                </div>
                {/* Lista de tiendas */}
                {shops.length === 0 ? (
                  <p className="text-center text-xs py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No hay tiendas registradas todavía.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {shops.slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => {
                      const used = shopUsageCount(s.id);
                      const isRenaming = renamingShopId === s.id;
                      return (
                        <div
                          key={s.id}
                          className="flex items-center gap-2 rounded-xl px-3 py-2"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          {isRenaming ? (
                            <>
                              <input
                                type="text"
                                autoFocus
                                value={renameShopDraft}
                                onChange={e => setRenameShopDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleRenameShop(s.id); if (e.key === 'Escape') { setRenamingShopId(null); setRenameShopDraft(''); } }}
                                maxLength={60}
                                className="h-8 flex-1 rounded-lg px-2 text-sm outline-none"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(123,241,214,0.4)', color: 'rgba(255,255,255,0.9)' }}
                              />
                              <button type="button" onClick={() => handleRenameShop(s.id)} title="Guardar nombre" className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)' }}>
                                <Check className="h-4 w-4" style={{ color: '#34d399' }} />
                              </button>
                              <button type="button" onClick={() => { setRenamingShopId(null); setRenameShopDraft(''); }} title="Cancelar" className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }}>
                                <X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>🏪 {s.name}</p>
                                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                  {used > 0 ? `${used} ítem(s) asignado(s)` : 'Sin ítems asignados'}
                                </p>
                              </div>
                              <button type="button" onClick={() => startRenameShop(s.id, s.name)} title="Renombrar" className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                <Pencil className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.6)' }} />
                              </button>
                              <button type="button" onClick={() => setDeleteShopTarget({ id: s.id, name: s.name, used })} title="Borrar" className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                                <Trash2 className="h-3.5 w-3.5" style={{ color: '#f87171' }} />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'porVendedor' && (
              <div className="overflow-y-auto px-5 py-3 flex-1">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Agrupa por vendedor los ítems asignados con stock y las ventas ya realizadas (precio real + interna/externa). La adena esperada es solo referencia para cuadrar montos.
                  </p>
                  <button
                    type="button"
                    onClick={() => setResetConfirm(true)}
                    disabled={resetShopsMut.isPending}
                    className="shrink-0 h-8 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-40"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    Resetear vendedores
                  </button>
                </div>

                {shopSummaryQ.isLoading ? (
                  <p className="text-center text-xs py-6" style={{ color: 'rgba(255,255,255,0.35)' }}>Cargando…</p>
                ) : !shopSummaryQ.data || shopSummaryQ.data.length === 0 ? (
                  <p className="text-center text-xs py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No hay tiendas registradas todavía.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {shopSummaryQ.data.map((sm: any) => (
                      <div key={sm.shopId} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>🏪 {sm.shopName}</p>
                          <span className="text-xs font-mono font-bold" style={{ color: '#34d399' }}>
                            Adena esperada: ${formatThousands(sm.expectedTotal)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          <span>En stock: <b style={{ color: '#a78bfa' }}>${formatThousands(sm.expectedActive)}</b></span>
                          <span>Vendido: <b style={{ color: '#7bf1d6' }}>${formatThousands(sm.soldTotal)}</b></span>
                        </div>

                        {sm.activeItems.length > 0 && (
                          <div className="mb-2">
                            <p className="text-[11px] font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>A la venta ({sm.activeItems.length})</p>
                            <div className="space-y-1">
                              {sm.activeItems.map((ai: any) => (
                                <div key={ai.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                  <span className="truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>{ai.name} · {ai.remaining} u.</span>
                                  <span className="shrink-0 font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>${formatThousands(ai.expected)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {sm.sales.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>Vendidos ({sm.sales.length})</p>
                            <div className="space-y-1">
                              {sm.sales.map((s: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(96,165,250,0.06)' }}>
                                  <span className="truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                    {s.itemName} · {s.quantity} u.
                                    <span className="ml-1 rounded px-1 py-0.5 text-[10px]" style={{ background: s.isExternalSale ? 'rgba(251,191,36,0.14)' : 'rgba(52,211,153,0.14)', color: s.isExternalSale ? '#fbbf24' : '#34d399' }}>
                                      {s.isExternalSale ? 'Externa' : s.isInternalSale ? 'Interna' : 'Normal'}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-mono" style={{ color: '#7bf1d6' }}>${formatThousands(s.total)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {sm.activeItems.length === 0 && sm.sales.length === 0 && (
                          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Sin ítems asignados ni ventas.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {resetConfirm && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-5" onClick={e => e.stopPropagation()} style={{ background: '#141821', border: '1px solid rgba(255,255,255,0.12)' }}>
                      <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>Resetear vendedores</h3>
                        <button type="button" onClick={() => setResetConfirm(false)} title="Cerrar" className="ml-auto rounded-lg p-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-xs leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        Esto deja todas las tiendas en 0: quita la asignación de tienda de todos los ítems y desvincula las ventas ya registradas de sus vendedores. No borra las compras ni afecta montos ni ciclos. Podrás empezar a asignar de nuevo.
                      </p>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setResetConfirm(false)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>Cancelar</button>
                        <button type="button" onClick={() => resetShopsMut.mutate()} disabled={resetShopsMut.isPending} className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
                          {resetShopsMut.isPending ? 'Reseteando…' : 'Resetear'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal borrar tienda (fuera de los tabs para que se muestre en cualquier pestaña) */}
            {deleteShopTarget && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                <div className="w-full max-w-sm rounded-2xl p-5" onClick={e => e.stopPropagation()} style={{ background: '#141821', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>Borrar tienda</h3>
                    <button type="button" onClick={() => setDeleteShopTarget(null)} title="Cerrar" className="ml-auto rounded-lg p-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {deleteShopTarget.used > 0
                      ? <>La tienda <b style={{ color: 'rgba(255,255,255,0.9)' }}>"{deleteShopTarget.name}"</b> está asignada a <b>{deleteShopTarget.used}</b> ítem(s). Al borrarla esos ítems quedarán <b>sin tienda</b>. Si tiene ventas registradas, el sistema no permitirá borrarla (usa "Resetear vendedores"). ¿Continuar?</>
                      : <>¿Borrar la tienda <b style={{ color: 'rgba(255,255,255,0.9)' }}>"{deleteShopTarget.name}"</b>?</>}
                  </p>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setDeleteShopTarget(null)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>Cancelar</button>
                    <button type="button" onClick={confirmDeleteShop} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>Borrar</button>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[11px]" style={{ color: hasPending ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}>
                {hasPending
                  ? `${pendingCount} ${pendingCount === 1 ? 'cambio' : 'cambios'} sin guardar`
                  : 'Sin cambios pendientes'}
              </div>
              <div className="flex items-center gap-2">
                {hasPending && (
                  <button
                    type="button"
                    onClick={discardChanges}
                    className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    Descartar
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveChanges}
                  disabled={!hasPending}
                  className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                  style={{
                    background: hasPending ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                    color: hasPending ? '#34d399' : 'rgba(255,255,255,0.3)',
                    border: `1px solid ${hasPending ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    cursor: hasPending ? 'pointer' : 'not-allowed',
                  }}
                >
                  Guardar cambios
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
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

  const { data: legacyBuyersData } = trpc.items.legacyBuyers.useQuery(undefined, { enabled: !!authUser });
  const legacyBuyers = (legacyBuyersData as any[]) || [];

  // Ventas reales por ítem: adena efectivamente cobrada (histórico de purchases),
  // no el estimado a precio actual. Se usa para que "Vendido" cuadre con la
  // adena real recaudada aunque se haya editado el precio del ítem tras vender.
  const { data: purchasesData } = trpc.items.listPurchases.useQuery(undefined, { enabled: !!authUser });
  const realRevenueByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of ((purchasesData as any[]) || [])) {
      const k = String(p.itemId);
      m.set(k, (m.get(k) || 0) + (Number(p.total) || 0));
    }
    return m;
  }, [purchasesData]);
  // Impuesto del clan cobrado por ítem (retención que va al Fondo del Clan).
  const clanTaxByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of ((purchasesData as any[]) || [])) {
      const k = String(p.itemId);
      m.set(k, (m.get(k) || 0) + (Number(p.clanTax) || 0));
    }
    return m;
  }, [purchasesData]);

  // #12: mapa categoría → ícono global (mismo catálogo que /raids/settings y que
  // usa Registro de ítem). Al cambiar categoría o elegir sugerencia en el modal
  // de edición, se asigna la imagen de la categoría cuando corresponde.
  const categoryIconsQ = trpc.raid.categoryIcons.list.useQuery(undefined, { staleTime: 60_000, enabled: !!authUser });
  const categoryIconMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    (categoryIconsQ.data || []).forEach((r: { category: string; imageUrl: string }) => {
      map[String(r.category).toUpperCase()] = r.imageUrl;
    });
    return map;
  }, [categoryIconsQ.data]);
  const resolveCategoryIcon = (cat: string): string => {
    if (!cat) return '';
    return categoryIconMap[String(cat).toUpperCase()] || '';
  };

  // Build combined character lookup: old characters + legacyBuyers (user accounts)
  // Items may have associatedCharacterIds with old char IDs OR new user IDs
  const allCharLookup = useMemo(() => {
    const map = new Map<string, Character>();
    // Old characters first
    for (const c of characters) {
      map.set(String(c.id), c);
    }
    // Legacy users (user accounts with legacyAccess) — overwrite if same ID
    for (const u of legacyBuyers) {
      const uid = String(u.id);
      if (!map.has(uid)) {
        const r = String(u.role || 'user').toLowerCase();
        const avatarGrad = r === 'super_admin' ? 'from-cyan-400 to-blue-600' : r === 'mapper' ? 'from-amber-400 to-orange-600' : r === 'admin' ? 'from-blue-400 to-indigo-600' : 'from-fuchsia-400 to-purple-600';
        map.set(uid, {
          id: uid,
          name: u.name || 'Sin nombre',
          role: (u.role || 'USER').toUpperCase(),
          avatar: avatarGrad,
          class: u.classMain || 'Sin clase',
          level: 1,
          itemIds: u.itemIds || [],
          totalEarnings: u.totalEarnings || 0,
          currentCycleEarnings: u.currentCycleEarnings || 0,
        });
      }
    }
    return map;
  }, [characters, legacyBuyers]);

  // #12/#17: lista de usuarios seleccionables para los pickers de personajes y
  // responsable del modal de edición (mismo formato que CreateItemPanel).
  const selectableUsers = useMemo(() => {
    return (legacyBuyers as any[]).map((u: any) => {
      const r = String(u.role || 'user').toLowerCase();
      const avatarGrad = r === 'super_admin' ? 'from-cyan-400 to-blue-600' : r === 'mapper' ? 'from-amber-400 to-orange-600' : r === 'admin' ? 'from-blue-400 to-indigo-600' : 'from-fuchsia-400 to-purple-600';
      const roleLabel = r === 'super_admin' ? 'Administrador del Sistema' : r === 'mapper' ? 'Mapper' : r === 'admin' ? 'Admin' : 'Usuario';
      return { id: String(u.id), name: u.name || 'Sin nombre', avatar: avatarGrad, class: String(u.classMain || '').trim() || 'Sin clase', role: roleLabel };
    });
  }, [legacyBuyers]);

  const utils = trpc.useUtils();
  const markPreSoldMutation = trpc.items.reservations.markPreSold.useMutation({
    onSuccess: () => { utils.items.reservations.list.invalidate(); toast.success('Reserva marcada como pre-vendida.'); },
    onError: (err) => toast.error(err.message || 'Error al marcar pre-venta.'),
  });
  const unmarkPreSoldMutation = trpc.items.reservations.unmarkPreSold.useMutation({
    onSuccess: () => { utils.items.reservations.list.invalidate(); toast.success('Pre-venta desmarcada.'); },
    onError: (err) => toast.error(err.message || 'Error al desmarcar pre-venta.'),
  });


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
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'ALL' | 'WITH_RESERVATIONS' | 'STALE_7D'>('ALL');
  const [sortKey, setSortKey] = useState<'name' | 'price' | 'createdAt'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // #12: edición completa del ítem (nombre/precio/stock/personajes/responsable).
  const [editModalItem, setEditModalItem] = useState<Item | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editCharIds, setEditCharIds] = useState<string[]>([]);
  const [editRespId, setEditRespId] = useState<string>('');
  // Flag cooperativo (solo separación visual en Ciclos de Venta), editable por SA/Mapper.
  const [editIsCoop, setEditIsCoop] = useState(false);
  const [editCharSearch, setEditCharSearch] = useState('');
  const [editRespSearch, setEditRespSearch] = useState('');
  // #12: imagen del ítem en edición. Se rellena al elegir una sugerencia del
  // typeahead de nombre (o al cambiar categoría) igual que en Registro de ítem.
  const [editImageUrl, setEditImageUrl] = useState('');
  // Venta parcial
  const [sellModalItem, setSellModalItem] = useState<Item | null>(null);
  const [sellQty, setSellQty] = useState('1');
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('');
  const [isInternalSale, setIsInternalSale] = useState(false);
  const [isExternalSale, setIsExternalSale] = useState(false);
  // Confirmación de borrado
  const [deleteModalItem, setDeleteModalItem] = useState<Item | null>(null);
  const [sellReservsOpen, setSellReservsOpen] = useState(false);
  const [sellDistribOpen, setSellDistribOpen] = useState(false);

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
        const remaining = (Number(i.quantity) || 0) - (Number(i.quantitySold) || 0);
        matchesStatus = !!(rs && rs.length > 0) && remaining > 0;
      } else if (statusStr === 'STALE_7D') {
        const daysOld = Math.floor((Date.now() - new Date(i.createdAt).getTime()) / 86400000);
        matchesStatus = daysOld >= 7 && i.status !== 'VENDIDO' && i.quantitySold < i.quantity;
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
  // (adena REAL cobrada del histórico de ventas), Restante (potencial =
  // price*remaining), Total (Vendido real + Restante potencial).
  const totals = useMemo(() => {
    const totalUnits = filtered.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const soldUnits = filtered.reduce((s, i) => s + (Number(i.quantitySold) || 0), 0);
    const remainingUnits = totalUnits - soldUnits;
    // Vendido = adena REAL cobrada (histórico de purchases). Si un ítem tiene
    // unidades vendidas pero no hay registro de venta (data legacy), caemos al
    // estimado precio_actual × vendidas para no subestimar.
    const soldRevenue = filtered.reduce((s, i) => {
      const key = String(i.id);
      const real = realRevenueByItem.get(key);
      if (real != null) return s + real;
      return s + (Number(i.price) || 0) * (Number(i.quantitySold) || 0);
    }, 0);
    const potentialRevenue = filtered.reduce(
      (s, i) =>
        s + (Number(i.price) || 0) * ((Number(i.quantity) || 0) - (Number(i.quantitySold) || 0)),
      0
    );
    const totalRevenue = soldRevenue + potentialRevenue;
    // Impuesto del clan retenido sobre lo vendido y neto que queda a personajes.
    const clanTax = filtered.reduce((s, i) => s + (clanTaxByItem.get(String(i.id)) || 0), 0);
    const soldNet = soldRevenue - clanTax;
    // Reservas: ítems distintos con al menos una reserva viva + total unidades
    // reservadas (suma de quantity). Solo cuenta ítems dentro de `filtered`
    // para que el contador respete los filtros actuales.
    let itemsWithReservations = 0;
    let reservedUnitsTotal = 0;
    for (const it of filtered) {
      const rs = reservationsByItem.get(String(it.id));
      const remaining = (Number(it.quantity) || 0) - (Number(it.quantitySold) || 0);
      if (rs && rs.length > 0 && remaining > 0) {
        itemsWithReservations += 1;
        for (const r of rs) reservedUnitsTotal += Number(r.quantity) || 0;
      }
    }
    return {
      totalUnits, soldUnits, remainingUnits,
      soldRevenue, potentialRevenue, totalRevenue,
      clanTax, soldNet,
      itemsWithReservations, reservedUnitsTotal,
    };
  }, [filtered, reservationsByItem, realRevenueByItem, clanTaxByItem]);

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

  // #12: abrir el modal de edición completa con los valores actuales del ítem.
  const openEditModal = (item: Item) => {
    setEditModalItem(item);
    setEditName(item.name || '');
    setEditCategory(item.category || '');
    setEditPrice(item.price ? formatThousands(item.price) : '');
    setEditQty(String(item.quantity ?? ''));
    setEditCharIds([...(item.associatedCharacterIds || [])]);
    setEditRespId(item.responsibleUserId ? String(item.responsibleUserId) : '');
    setEditIsCoop(Boolean(item.isCooperative));
    setEditCharSearch('');
    setEditRespSearch('');
    setEditImageUrl(item.image?.publicUrl || (item as any).imageUrl || '');
  };

  // #12: al elegir una sugerencia del typeahead en el modal de edición se
  // rellenan SOLO nombre, categoría e imagen (el precio no se toca, por pedido
  // explícito). Si el ítem sugerido no trae imagen propia, cae al ícono global
  // de la categoría (igual que Registro de ítem).
  const applyEditTypeahead = (picked: any) => {
    const cat = picked.category || '';
    const img = picked.image?.publicUrl || picked.imageUrl || '';
    const fallback = cat && CATEGORIES.includes(cat as ItemCategory) ? resolveCategoryIcon(cat) : '';
    setEditName(picked.name || '');
    if (cat && CATEGORIES.includes(cat as ItemCategory)) setEditCategory(cat);
    setEditImageUrl(img || fallback);
  };

  // Cambiar categoría en el modal reasigna la imagen al ícono global de esa
  // categoría (mismo comportamiento que Registro de ítem).
  const handleEditCategoryChange = (cat: ItemCategory) => {
    setEditCategory(cat);
    setEditImageUrl(resolveCategoryIcon(cat));
  };

  const handleSaveEdit = () => {
    if (!editModalItem) return;
    const name = editName.trim();
    if (!name) { toast.error('El nombre no puede estar vacío.'); return; }
    const priceNum = parseThousands(editPrice);
    const qtyNum = parseInt(editQty, 10);
    if (isNaN(qtyNum) || qtyNum < 1) { toast.error('El stock debe ser al menos 1.'); return; }
    if (qtyNum < editModalItem.quantitySold) {
      toast.error(`El stock no puede ser menor a las unidades ya vendidas (${editModalItem.quantitySold}).`);
      return;
    }
    if (!editCategory || !CATEGORIES.includes(editCategory as ItemCategory)) { toast.error('Debes seleccionar una categoría.'); return; }
    if (editCharIds.length === 0) { toast.error('Debes asociar al menos un personaje.'); return; }
    updateItem(editModalItem.id, {
      name,
      category: editCategory as ItemCategory,
      price: priceNum,
      quantity: qtyNum,
      associatedCharacterIds: editCharIds,
      responsibleUserId: editRespId || null,
      isCooperative: editIsCoop,
      image: {
        id: editModalItem.image?.id || `img-${editModalItem.id}`,
        publicUrl: editImageUrl || '',
        altText: name,
      },
    });
    toast.success(`Ítem "${name}" actualizado.`);
    setEditModalItem(null);
  };

  const toggleEditChar = (cid: string) => {
    setEditCharIds(prev => prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]);
  };

  const { data: clanFundSettings } = trpc.clanFund.getSettings.useQuery(undefined, { staleTime: 30_000 });

  const openSellModal = (item: Item) => {
    setSellModalItem(item);
    setSellQty('1');
    setSelectedBuyerId('');
    setIsInternalSale(false);
    setIsExternalSale(false);
    setSellReservsOpen(false);
    setSellDistribOpen(false);
  };

  const handleSell = () => {
    if (!sellModalItem) return;
    const qty = parseInt(sellQty);
    const remaining = sellModalItem.quantity - sellModalItem.quantitySold;
    if (isNaN(qty) || qty < 1 || qty > remaining) {
      toast.error(`Cantidad inválida. Máximo disponible: ${remaining}`);
      return;
    }

    if (isExternalSale) {
      sellItem({ 
        itemId: sellModalItem.id, 
        quantityToSell: qty,
        buyerId: 'external-city',
        buyerName: 'Venta Externa (City)',
        isInternalSale: false,
        isExternalSale: true,
      });
      const newRemaining = remaining - qty;
      if (newRemaining === 0) {
        toast.success(`"${sellModalItem.name}" vendido por fuera (City).`);
      } else {
        toast.success(`Vendidas ${qty} unidad(es) de "${sellModalItem.name}" por fuera (City). Quedan ${newRemaining}.`);
      }
    } else {
      if (!selectedBuyerId) {
        toast.error('Debes seleccionar un comprador');
        return;
      }
      const buyer = legacyBuyers.find((u: any) => String(u.id) === String(selectedBuyerId));
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
        isExternalSale: false,
      });
      const newRemaining = remaining - qty;
      if (newRemaining === 0) {
        toast.success(`"${sellModalItem.name}" completamente vendido a ${buyer.name}.`);
      } else {
        toast.success(`Vendidas ${qty} unidad(es) de "${sellModalItem.name}" a ${buyer.name}. Quedan ${newRemaining}.`);
      }
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
              {!compact && currentUser?.role === 'SUPER_ADMIN' && (
                <InventorySummaryButton items={items} resolveCategoryIcon={resolveCategoryIcon} resolveResponsibleName={(id) => allCharLookup.get(String(id))?.name || ''} />
              )}
              <span>
                Unid: <span style={{ color: '#7bf1d6' }}>{totals.remainingUnits}</span>/
                {totals.totalUnits}
              </span>
              <span>
                Vendidas: <span style={{ color: '#fbbf24' }}>{totals.soldUnits}</span>
              </span>
              <span
                className="cursor-help"
                title={
                  `Vendido = adena real cobrada (histórico de ventas).\n` +
                  `Bruto: $${totals.soldRevenue.toLocaleString()}\n` +
                  `− Impuesto del clan: $${totals.clanTax.toLocaleString()}\n` +
                  `= Neto para personajes: $${totals.soldNet.toLocaleString()}\n` +
                  `(el impuesto va al Fondo del Clan)`
                }
              >
                Vendido: <span style={{ color: '#fbbf24' }}>${totals.soldRevenue.toLocaleString()}</span>
                {totals.clanTax > 0 && (
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {' '}(neto ${totals.soldNet.toLocaleString()})
                  </span>
                )}
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
              <FancySelect<ItemStatus | 'ALL' | 'WITH_RESERVATIONS' | 'STALE_7D'>
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as ItemStatus | 'ALL' | 'WITH_RESERVATIONS' | 'STALE_7D')}
                accent="turquoise"
                size="md"
                placeholder="Todos los estados"
                options={[
                  { value: 'ALL', label: 'Todos los estados', emoji: '🧾' },
                  { value: 'CONFIRMADO', label: 'Con stock', emoji: '✅' },
                  { value: 'EN_REGISTRO', label: 'En Registro', emoji: '🟡' },
                  { value: 'VENDIDO', label: 'Vendido', emoji: '💰' },
                  { value: 'WITH_RESERVATIONS', label: 'Con reservas', emoji: '🔖' },
                  { value: 'STALE_7D', label: 'Sin vender (+7 días)', emoji: '⏳' },
                ]}
              />
            </div>
          )}
        </div>

        {/* Table */}
        <div className="table-scroll">
          <table className="w-full min-w-[920px]">
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Responsable</th>
                {!compact && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No se encontraron ítems con los filtros aplicados
                  </td>
                </tr>
              )}
              {filtered.map(item => {
                const catMeta = categoryMeta[item.category] || { label: item.category, badgeClass: 'badge-default', color: '#94a3b8', emoji: '📦' };
                const stMeta = statusMeta[item.status] || { label: item.status, badgeClass: 'badge-default', color: '#94a3b8' };
                // #12: SUPER_ADMIN y MAPPER pueden editar (nombre/precio/stock/personajes)
                // para corregir errores de registro, sin importar el estado.
                const canEdit = !!currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'MAPPER');
                const canConfirm = currentUser && currentUser.role === 'SUPER_ADMIN' && item.status === 'EN_REGISTRO';
                const canDelete = currentUser && currentUser.role === 'SUPER_ADMIN';
                // Si el responsable del ítem es la cuenta del Super Admin, la
                // venta la maneja SOLO el Super Admin (ítems más delicados que
                // él tiene en su poder). Si el responsable es otra persona, el
                // Mapper puede gestionar la venta con normalidad.
                const responsibleRole = item.responsibleUserId
                  ? String(allCharLookup.get(String(item.responsibleUserId))?.role || '').toUpperCase()
                  : '';
                const responsibleIsSuperAdmin = responsibleRole === 'SUPER_ADMIN';
                // #4: SUPER_ADMIN y MAPPER pueden vender ítems confirmados con stock,
                // salvo cuando el responsable es el Super Admin → solo Super Admin.
                const canSell =
                  !!currentUser &&
                  item.status === 'CONFIRMADO' &&
                  (currentUser.role === 'SUPER_ADMIN' ||
                    (currentUser.role === 'MAPPER' && !responsibleIsSuperAdmin));
                const remaining = item.quantity - item.quantitySold;
                const assocChars = item.associatedCharacterIds
                  .map(cid => allCharLookup.get(String(cid)))
                  .filter((c): c is Character => !!c);
                // #17: resolver el nombre del responsable del ítem.
                const respChar = item.responsibleUserId ? allCharLookup.get(String(item.responsibleUserId)) : undefined;
                // #10: nombre truncado a 50 chars.
                const nameInfo = truncateName(item.name);
                // #9: precio con descuento de clan (venta interna).
                const discountPct = Number(clanFundSettings?.internalDiscountPercent) || 0;
                const discountedPrice = item.price && discountPct > 0
                  ? Math.floor(item.price * (1 - discountPct / 100))
                  : null;
                const itemReservations = reservationsByItem.get(String(item.id)) || [];
                const reservedCount = itemReservations.length;
                const reservedUnits = itemReservations.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                const hasReservations = reservedCount > 0;
                const daysUnsold = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86400000);
                const isStale = daysUnsold >= 7 && item.status !== 'VENDIDO' && item.quantitySold < item.quantity;
                const staleColor = daysUnsold >= 30 ? '#ef4444' : daysUnsold >= 15 ? '#f97316' : '#fb923c';
                const staleBg = daysUnsold >= 30 ? 'rgba(239,68,68,0.1)' : daysUnsold >= 15 ? 'rgba(249,115,22,0.1)' : 'rgba(251,146,60,0.08)';
                const staleBorder = daysUnsold >= 30 ? 'rgba(239,68,68,0.3)' : daysUnsold >= 15 ? 'rgba(249,115,22,0.25)' : 'rgba(251,146,60,0.2)';

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
                        <p
                          className="text-sm font-medium max-w-[320px] truncate"
                          style={{ color: 'rgba(255,255,255,0.9)' }}
                          title={nameInfo.truncated ? item.name : undefined}
                        >
                          {nameInfo.shown}
                        </p>
                        {hasReservations && (
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
                        {isStale && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none align-middle"
                            style={{ background: staleBg, border: `1px solid ${staleBorder}`, color: staleColor }}
                            title={`Registrado hace ${daysUnsold} días sin vender todo el stock`}
                          >
                            ⏳ {daysUnsold}d
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
                    {/* Price — #9: precio original + precio con descuento de clan */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-mono" style={{ color: 'rgba(255,255,255,0.7)' }}>
                          {item.price ? `$${item.price.toLocaleString()}` : '—'}
                        </span>
                        {discountedPrice !== null && (
                          <span
                            className="flex items-center gap-1.5 mt-1"
                            title={`Precio con descuento de clan (-${discountPct}%) para venta interna`}
                          >
                            <span className="text-sm font-mono font-bold" style={{ color: '#fbbf24' }}>
                              ${discountedPrice.toLocaleString()}
                            </span>
                            <span
                              className="rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                              style={{ background: 'rgba(251,191,36,0.18)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)' }}
                            >
                              -{discountPct}% clan
                            </span>
                          </span>
                        )}
                      </div>
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
                    {/* #17 — Responsable del ítem */}
                    <td className="px-4 py-3">
                      {respChar ? (
                        <div className="flex items-center">
                          <div
                            title={respChar.name}
                            className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${respChar.avatar} text-white border`}
                            style={{ fontSize: '8px', fontWeight: 'bold', borderColor: 'rgba(10,14,22,0.8)' }}
                          >
                            {respChar.name.slice(0, 1).toUpperCase()}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                      )}
                    </td>
                    {/* Actions — reglas replicadas de RaidDropsTable:
                        - ✏️ editar precio: deshabilitado si todo vendido (no tiene sentido cambiar el precio)
                        - 🛒 vender: oculto si no hay stock restante
                        - 🗑️ eliminar: deshabilitado si ya hubo ventas (preserva integridad histórica de purchases/character earnings) */}
                    {!compact && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {canEdit && (
                            <button
                              onClick={() => openEditModal(item)}
                              className="btn-ghost p-2"
                              title="Editar ítem (nombre, precio, stock, personajes, responsable)"
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
                          {/* Historial de ventas del ítem — visible para todos */}
                          <ItemSaleHistoryButton itemId={String(item.id)} itemName={item.name} />
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

      {/* #12 — Modal de edición completa del ítem (nombre/precio/stock/personajes/responsable) */}
      {editModalItem && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
            style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4" style={{ color: '#7bf1d6' }} />
                <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Editar ítem</h3>
              </div>
              <button type="button" onClick={() => setEditModalItem(null)} className="rounded p-1 transition-colors hover:bg-white/5">
                <X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Nombre — mismo buscador con sugerencias del catálogo que en
                  "Registro de ítem". Al elegir una sugerencia se rellena
                  nombre, categoría e imagen (el precio no se toca). */}
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>Nombre</label>
                <ItemTypeahead
                  value={editName}
                  onChange={v => setEditName(v)}
                  onSelect={picked => applyEditTypeahead(picked)}
                  placeholder="Nombre del ítem (con sugerencias del catálogo)…"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>Categoría</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => {
                    const meta = categoryMeta[c] || { emoji: '📦', label: c };
                    const isSel = editCategory === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleEditCategoryChange(c)}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
                        style={{
                          background: isSel ? 'rgba(123,241,214,0.15)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isSel ? 'rgba(123,241,214,0.45)' : 'rgba(255,255,255,0.08)'}`,
                          color: isSel ? '#7bf1d6' : 'rgba(255,255,255,0.7)',
                        }}
                      >
                        <span>{meta.emoji}</span>
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Imagen (auto por categoría / sugerencia). Solo lectura. */}
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>Imagen</label>
                <div
                  className="rounded-lg overflow-hidden flex items-center gap-2 px-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)', height: 40 }}
                  title={editImageUrl ? 'Asignada por categoría / sugerencia' : 'Elige una categoría o una sugerencia para asignar la imagen'}
                >
                  {editImageUrl ? (
                    <>
                      <ImageHoverPreview src={editImageUrl} caption={editCategory} size={240}>
                        <img src={editImageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                      </ImageHoverPreview>
                      <span className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {editCategory ? `auto · ${editCategory}` : 'imagen asignada'}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      elige categoría o sugerencia
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Precio (#11 formateado) */}
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>Precio (Adena)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editPrice}
                    onChange={e => setEditPrice(reformatWhileTyping(e.target.value))}
                    className="input-dark h-9 w-full text-sm"
                    placeholder="0"
                  />
                </div>
                {/* Stock */}
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>Stock (total)</label>
                  <input
                    type="number"
                    min={1}
                    value={editQty}
                    onChange={e => setEditQty(e.target.value)}
                    className="input-dark h-9 w-full text-sm"
                    placeholder="0"
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Vendidas: {editModalItem.quantitySold} (mínimo permitido)
                  </p>
                </div>
              </div>

              {/* Personajes asociados (multi) */}
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Personajes asociados ({editCharIds.length})
                </label>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(10,14,22,0.98)', maxHeight: 180, overflowY: 'auto' }}>
                  <div className="flex items-center gap-2 border-b px-3 py-2 sticky top-0" style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
                    <input
                      value={editCharSearch}
                      onChange={e => setEditCharSearch(e.target.value)}
                      placeholder="Buscar personaje..."
                      className="bg-transparent text-xs outline-none w-full"
                      style={{ color: 'rgba(255,255,255,0.8)' }}
                    />
                  </div>
                  {selectableUsers
                    .filter(c => c.name.toLowerCase().includes(editCharSearch.toLowerCase()) || c.class.toLowerCase().includes(editCharSearch.toLowerCase()))
                    .map(char => {
                      const isSel = editCharIds.includes(char.id);
                      return (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => toggleEditChar(char.id)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-all hover:bg-white/5"
                          style={{ background: isSel ? 'rgba(123,241,214,0.06)' : undefined }}
                        >
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${char.avatar} text-[10px] font-bold text-white`}>
                            {char.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{char.name}</p>
                            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{char.class} · {char.role}</p>
                          </div>
                          <div className="shrink-0 h-4 w-4 rounded border flex items-center justify-center" style={{ borderColor: isSel ? '#7bf1d6' : 'rgba(255,255,255,0.2)', background: isSel ? 'rgba(123,241,214,0.2)' : 'transparent' }}>
                            {isSel && <span style={{ color: '#7bf1d6', fontSize: 10 }}>✓</span>}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Responsable (single) */}
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>Responsable del ítem</label>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(10,14,22,0.98)', maxHeight: 180, overflowY: 'auto' }}>
                  <div className="flex items-center gap-2 border-b px-3 py-2 sticky top-0" style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
                    <input
                      value={editRespSearch}
                      onChange={e => setEditRespSearch(e.target.value)}
                      placeholder="Buscar responsable..."
                      className="bg-transparent text-xs outline-none w-full"
                      style={{ color: 'rgba(255,255,255,0.8)' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditRespId('')}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-all hover:bg-white/5"
                    style={{ background: !editRespId ? 'rgba(139,183,250,0.06)' : undefined }}
                  >
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>— Sin responsable —</span>
                  </button>
                  {selectableUsers
                    .filter(c => c.name.toLowerCase().includes(editRespSearch.toLowerCase()) || c.class.toLowerCase().includes(editRespSearch.toLowerCase()))
                    .map(char => {
                      const isSel = editRespId === char.id;
                      return (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => setEditRespId(isSel ? '' : char.id)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-all hover:bg-white/5"
                          style={{ background: isSel ? 'rgba(139,183,250,0.06)' : undefined }}
                        >
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${char.avatar} text-[10px] font-bold text-white`}>
                            {char.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{char.name}</p>
                            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{char.class} · {char.role}</p>
                          </div>
                          <div className="shrink-0 h-4 w-4 rounded border flex items-center justify-center" style={{ borderColor: isSel ? '#8bb7fa' : 'rgba(255,255,255,0.2)', background: isSel ? 'rgba(139,183,250,0.2)' : 'transparent' }}>
                            {isSel && <span style={{ color: '#8bb7fa', fontSize: 10 }}>✓</span>}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Flag cooperativo (solo separación visual en Ciclos de Venta).
                  El modal de edición ya está gateado a SA/Mapper (canEdit). */}
              <label
                className="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer select-none w-fit"
                style={{
                  background: editIsCoop ? 'rgba(123,241,214,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${editIsCoop ? 'rgba(123,241,214,0.3)' : 'rgba(255,255,255,0.08)'}`,
                }}
                title="Marca este ítem como cooperativo (solo separa la vista en Ciclos de Venta)"
              >
                <input
                  type="checkbox"
                  checked={editIsCoop}
                  onChange={e => setEditIsCoop(e.target.checked)}
                  className="h-4 w-4 accent-[#7bf1d6]"
                />
                <span className="text-xs font-medium" style={{ color: editIsCoop ? '#7bf1d6' : 'rgba(255,255,255,0.7)' }}>
                  🤝 Ítem Cooperativo {editIsCoop ? '' : '(Individual)'}
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={() => setEditModalItem(null)} className="rounded-lg px-4 py-2 text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancelar
              </button>
              <button type="button" onClick={handleSaveEdit} className="btn-primary rounded-lg px-4 py-2 text-xs font-semibold">
                Guardar cambios
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de venta parcial */}
      {sellModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
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
                    <div className="space-y-1.5 overflow-y-auto px-2.5 pb-2.5 pr-1" style={{ maxHeight: 180 }}>
                      {itemReservs.map(r => {
                        const isPreSold = (r as any).status === 'pre_sold';
                        const isSold = (r as any).status === 'sold';
                        const rowBg = isSold ? 'rgba(34,197,94,0.1)' : isPreSold ? 'rgba(52,211,153,0.08)' : 'transparent';
                        const rowBorder = isSold ? '1px solid rgba(34,197,94,0.25)' : isPreSold ? '1px solid rgba(52,211,153,0.2)' : '1px solid transparent';
                        const avatarBg = isSold ? 'rgba(34,197,94,0.35)' : isPreSold ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.25)';
                        const nameColor = isSold ? '#22c55e' : isPreSold ? '#34d399' : 'rgba(255,255,255,0.75)';
                        const qtyColor = isSold ? '#22c55e' : isPreSold ? '#34d399' : '#fbbf24';
                        return (
                          <div key={r.id} className="flex items-center justify-between rounded-lg px-2 py-1.5"
                            style={{ background: rowBg, border: rowBorder }}>
                            <div className="flex items-center gap-2">
                              <div className="flex h-5 w-5 items-center justify-center rounded-full text-white"
                                style={{ fontSize: '8px', fontWeight: 'bold', background: avatarBg }}>
                                {(r.characterName || r.userName || '?').slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-sm" style={{ color: nameColor }}>
                                  {r.characterName || r.userName}
                                </span>
                                {isSold && (
                                  <span className="ml-1.5 text-xs font-semibold" style={{ color: '#22c55e' }}>(Vendido)</span>
                                )}
                                {isPreSold && !isSold && (
                                  <span className="ml-1.5 text-xs font-semibold" style={{ color: '#34d399' }}>(Pre-vendido)</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono" style={{ color: qtyColor }}>
                                {r.quantity} ud{r.quantity !== 1 ? 's' : ''}
                              </span>
                              {isSold ? null : isPreSold ? (
                                <button
                                  onClick={() => unmarkPreSoldMutation.mutate({ id: r.id })}
                                  disabled={unmarkPreSoldMutation.isPending}
                                  className="rounded-lg px-2 py-1 text-xs font-semibold transition-all hover:bg-red-500/10"
                                  style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                                  title="Desmarcar pre-venta"
                                >
                                  Desmarcar
                                </button>
                              ) : (
                                <button
                                  onClick={() => markPreSoldMutation.mutate({ id: r.id })}
                                  disabled={markPreSoldMutation.isPending}
                                  className="rounded-lg px-2 py-1 text-xs font-semibold transition-all hover:bg-green-500/10"
                                  style={{ color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}
                                  title="Marcar como vendido a este personaje"
                                >
                                  Pre-vendido
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Distribución de ganancias — collapsible */}
            {sellModalItem.associatedCharacterIds.length > 0 && (
              <div className="mb-3 rounded-xl" style={{ background: 'rgba(123,241,214,0.06)', border: '1px solid rgba(123,241,214,0.15)' }}>
                <button
                  type="button"
                  onClick={() => setSellDistribOpen(v => !v)}
                  className="w-full flex items-center justify-between p-2.5 text-left"
                >
                  <span className="text-xs font-semibold flex items-center gap-1" style={{ color: '#7bf1d6' }}>
                    <Users className="h-3.5 w-3.5" />
                    Distribución de ganancias ({sellModalItem.associatedCharacterIds.length})
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ color: '#7bf1d6', transform: sellDistribOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                </button>
                {sellDistribOpen && (
                  <div className="space-y-1 overflow-y-auto px-2.5 pb-2.5 pr-1" style={{ maxHeight: 120 }}>
                    {sellModalItem.associatedCharacterIds.map(cid => {
                      const char = allCharLookup.get(String(cid));
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
                            <span className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>{char.name}</span>
                          </div>
                          <span className="text-sm font-mono" style={{ color: '#7bf1d6' }}>
                            {qty > 0 ? `+$${perChar.toLocaleString()}` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tipo de venta: toggle entre Interna y Externa (City) */}
            <div className="mb-3 rounded-xl p-3" style={{ background: isExternalSale ? 'rgba(56,189,248,0.06)' : 'rgba(251,191,36,0.06)', border: `1px solid ${isExternalSale ? 'rgba(56,189,248,0.2)' : 'rgba(251,191,36,0.15)'}` }}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setIsExternalSale(false); }}
                  className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: !isExternalSale ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.03)',
                    color: !isExternalSale ? '#fbbf24' : 'rgba(255,255,255,0.4)',
                    border: !isExternalSale ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  🏠 Venta Interna (Clan)
                </button>
                <button
                  type="button"
                  onClick={() => { setIsExternalSale(true); setIsInternalSale(false); setSelectedBuyerId(''); }}
                  className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: isExternalSale ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.03)',
                    color: isExternalSale ? '#38bdf8' : 'rgba(255,255,255,0.4)',
                    border: isExternalSale ? '1px solid rgba(56,189,248,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  🏙️ Venta Externa (City)
                </button>
              </div>
              {isExternalSale && (
                <p className="text-xs mt-2" style={{ color: 'rgba(56,189,248,0.6)' }}>
                  Venta a jugadores fuera del clan. Sin descuento interno. Solo aplica retención del clan.
                </p>
              )}
            </div>

            {/* Selector de Comprador — solo para venta interna */}
            {!isExternalSale && (
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
                  options={legacyBuyers.map((u: any) => ({
                    value: String(u.id),
                    label: u.name,
                    description: u.classMain || u.role,
                    emoji: '👤',
                  } as FancyOption<string>))}
                />
              </div>
            )}

            {/* Descuento venta interna — solo si es venta interna y tiene descuento configurado */}
            {!isExternalSale && clanFundSettings && (Number(clanFundSettings.internalDiscountPercent) > 0 || Number(clanFundSettings.clanTaxPercent) > 0) && (
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

            {/* Retención del clan para venta externa */}
            {isExternalSale && clanFundSettings && Number(clanFundSettings.clanTaxPercent) > 0 && (
              <div className="mb-3 rounded-xl p-3" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
                <p className="text-xs" style={{ color: 'rgba(56,189,248,0.7)' }}>
                  🏰 Retención del clan: {clanFundSettings.clanTaxPercent}% del precio final
                </p>
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
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Total a recaudar {isExternalSale ? '(Venta Externa)' : ''}</p>
                    <p className="text-xl font-bold font-mono" style={{ color: isExternalSale ? '#38bdf8' : '#a78bfa' }}>
                      ${totalAfterDiscount.toLocaleString()}
                    </p>
                    {discPct > 0 && (
                      <p className="text-xs mt-1" style={{ color: '#fbbf24' }}>
                        Descuento interno: -${(baseTotal - totalAfterDiscount).toLocaleString()} ({discPct}%)
                      </p>
                    )}
                    {clanAmt > 0 && (
                      <p className="text-xs mt-1" style={{ color: isExternalSale ? '#38bdf8' : '#fbbf24' }}>
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
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
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
