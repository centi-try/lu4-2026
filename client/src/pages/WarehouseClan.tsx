import { useState, useMemo, useRef, useCallback } from 'react';
import { Package, Plus, CheckCircle, Trash2, Minus, Search, X, Hammer, ChevronDown, ChevronUp, ExternalLink, PackagePlus, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { useApp } from '../contexts/AppContext';
import { AppShell } from '../components/layout/AppShell';
import { FancySelect, type FancyOption } from '../components/ui/FancySelect';
import { categoryMeta, CATEGORIES } from '../lib/category-meta';
import type { ItemCategory } from '../lib/types';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════════
// CatalogTypeahead
// ═══════════════════════════════════════════════════════════════════════════

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(123,241,214,0.25)', color: '#7bf1d6', borderRadius: 3 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

interface CatalogTypeaheadProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (item: { name: string; category: string; imageUrl: string | null }) => void;
  catalog: any[];
  placeholder?: string;
}

function CatalogTypeahead({ value, onChange, onSelect, catalog, placeholder = 'Ej: Draconic Leather' }: CatalogTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const suppressRef = useRef(false);

  const results = useMemo(() => {
    if (!value.trim() || suppressRef.current) return [];
    const q = value.toLowerCase();
    return (catalog || []).filter((m: any) => String(m.name || '').toLowerCase().includes(q)).slice(0, 10);
  }, [catalog, value]);

  const handleSelect = useCallback((item: any) => {
    suppressRef.current = true;
    setOpen(false);
    setActiveIdx(-1);
    onSelect({ name: item.name, category: item.category, imageUrl: item.imageUrl || null });
    setTimeout(() => { suppressRef.current = false; }, 100);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(results[activeIdx]); }
    if (e.key === 'Escape') { setOpen(false); setActiveIdx(-1); }
  }, [open, results, activeIdx, handleSelect]);

  const handleChange = useCallback((v: string) => {
    suppressRef.current = false;
    onChange(v);
    if (v.trim()) {
      const q = v.toLowerCase();
      const r = (catalog || []).filter((m: any) => String(m.name || '').toLowerCase().includes(q)).slice(0, 10);
      setOpen(r.length > 0);
      setActiveIdx(-1);
    } else {
      setOpen(false);
    }
  }, [onChange, catalog]);

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 rounded-lg transition-all h-9 px-2"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Search className="shrink-0 h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.35)' }} />
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (value.trim() && !suppressRef.current) { const q = value.toLowerCase(); const r = (catalog || []).filter((m: any) => String(m.name || '').toLowerCase().includes(q)).slice(0, 10); setOpen(r.length > 0); } }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none text-xs"
          style={{ color: 'rgba(255,255,255,0.9)', caretColor: '#7bf1d6' }}
        />
      </div>

      {open && results.length > 0 && (
        <div ref={listRef} className="autocomplete-dropdown">
          {results.map((item: any, idx: number) => {
            const meta = categoryMeta[item.category] || { color: '#7bf1d6', emoji: '📦', label: item.category };
            const isActive = idx === activeIdx;
            return (
              <button
                key={item.id}
                onMouseDown={e => { e.preventDefault(); handleSelect(item); }}
                onMouseEnter={() => setActiveIdx(idx)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-all last:border-b-0"
                style={{ borderColor: 'rgba(255,255,255,0.05)', background: isActive ? 'rgba(123,241,214,0.06)' : 'transparent' }}
              >
                <div className="relative h-[30px] w-[30px] shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5">
                      <Package className="h-4 w-4 text-white/20" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {highlight(item.name, value)}
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {meta.emoji} {meta.label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Confirmation Modal
// ═══════════════════════════════════════════════════════════════════════════

function ConfirmModal({ open, title, message, confirmLabel, confirmColor, onConfirm, onCancel, icon, itemName, itemDetail, itemImage }: {
  open: boolean; title: string; message: string; confirmLabel: string; confirmColor: string;
  onConfirm: () => void; onCancel: () => void;
  icon?: React.ReactNode; itemName?: string; itemDetail?: string; itemImage?: string | null;
}) {
  if (!open) return null;
  const isDelete = confirmColor === '#ef4444';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{
          background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
          border: `1px solid ${confirmColor}40`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              {icon || (isDelete ? <Trash2 className="h-5 w-5" style={{ color: confirmColor }} /> : <CheckCircle className="h-5 w-5" style={{ color: confirmColor }} />)}
              <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                {title}
              </h3>
            </div>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {message}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {itemName && (
          <div className="rounded-xl p-3 mb-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {itemImage ? (
                <img src={itemImage} alt={itemName} className="h-full w-full object-cover" />
              ) : (
                <Package className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{itemName}</p>
              {itemDetail && <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{itemDetail}</p>}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2" style={{
            background: isDelete
              ? 'linear-gradient(90deg, rgba(239,68,68,0.9), rgba(232,121,249,0.9))'
              : `linear-gradient(90deg, ${confirmColor}dd, ${confirmColor}99)`,
            border: `1px solid ${confirmColor}60`,
            color: '#fff',
          }}>
            {isDelete ? <Trash2 className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Row type for multi-row registration
// ═══════════════════════════════════════════════════════════════════════════

interface RowState {
  id: string;
  name: string;
  category: ItemCategory | '';
  quantity: string;
  imageUrl: string;
}

let rowIdCounter = 0;
const emptyRow = (): RowState => ({
  id: `wr-${Date.now()}-${++rowIdCounter}`,
  name: '',
  category: '',
  quantity: '0',
  imageUrl: '',
});

const isInvalidQuantity = (q: string) => {
  const n = parseInt(q, 10);
  return !q || isNaN(n) || n < 1;
};

// ═══════════════════════════════════════════════════════════════════════════
// WarehouseClan — main page
// ═══════════════════════════════════════════════════════════════════════════

export default function WarehouseClan() {
  const { currentUser } = useApp();
  const roleLc = String(currentUser?.role || '').toLowerCase();
  const isSA = roleLc === 'super_admin';
  const isAdminOrAbove = isSA || roleLc === 'admin';
  const canRegister = isSA || roleLc === 'admin' || roleLc === 'mapper';

  // Data queries
  const { data: warehouseItems = [], refetch: refetchItems } = trpc.warehouse.list.useQuery();
  const { data: incoming = [], refetch: refetchIncoming } = trpc.warehouse.listIncoming.useQuery();
  const { data: recipes = [], refetch: refetchRecipes } = trpc.warehouse.recipes.list.useQuery();
  const { data: projects = [], refetch: refetchProjects } = trpc.warehouse.projects.list.useQuery();
  const { data: catalog = [] } = trpc.warehouse.catalog.list.useQuery();

  // Category icons
  const categoryIconsQ = trpc.raid.categoryIcons.list.useQuery(undefined, { staleTime: 60_000 });
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

  // Mutations
  const registerMut = trpc.warehouse.register.useMutation({ onSuccess: () => { refetchIncoming(); toast.success('Material registrado'); } });
  const confirmMut = trpc.warehouse.confirm.useMutation({ onSuccess: () => { refetchItems(); refetchIncoming(); toast.success('Confirmado y agrupado'); } });
  const deleteIncomingMut = trpc.warehouse.deleteIncoming.useMutation({ onSuccess: () => { refetchIncoming(); toast.success('Registro eliminado'); } });
  const withdrawMut = trpc.warehouse.withdraw.useMutation({ onSuccess: () => { refetchItems(); toast.success('Stock descontado'); } });
  const deleteItemMut = trpc.warehouse.deleteItem.useMutation({ onSuccess: () => { refetchItems(); toast.success('Ítem eliminado'); } });
  const createRecipeMut = trpc.warehouse.recipes.create.useMutation({ onSuccess: () => { refetchRecipes(); toast.success('Receta creada'); } });
  const deleteRecipeMut = trpc.warehouse.recipes.delete.useMutation({ onSuccess: () => { refetchRecipes(); toast.success('Receta eliminada'); } });
  const createProjectMut = trpc.warehouse.projects.create.useMutation({ onSuccess: () => { refetchProjects(); toast.success('Proyecto creado'); } });
  const completeProjectMut = trpc.warehouse.projects.complete.useMutation({ onSuccess: () => { refetchProjects(); toast.success('Proyecto completado'); } });
  const deleteProjectMut = trpc.warehouse.projects.delete.useMutation({ onSuccess: () => { refetchProjects(); toast.success('Proyecto eliminado'); } });

  // Tab state
  const [tab, setTab] = useState<'bodega' | 'crafteo'>('bodega');

  // Search / filters
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL');

  // Multi-row registration
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [pulseRowId, setPulseRowId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (id: string) => setRows(prev => (prev.length === 1 ? prev : prev.filter(r => r.id !== id)));

  // Withdraw modal
  const [withdrawItem, setWithdrawItem] = useState<any>(null);
  const [withdrawQty, setWithdrawQty] = useState('1');
  const [withdrawReason, setWithdrawReason] = useState('');

  // Confirmation modals
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; label: string; color: string; action: () => void; itemName?: string; itemDetail?: string; itemImage?: string | null } | null>(null);

  // Recipe form
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeImg, setRecipeImg] = useState('');
  const [recipeWiki, setRecipeWiki] = useState('');
  const [recipeMaterials, setRecipeMaterials] = useState<Array<{ name: string; quantity: string; imageUrl: string }>>([{ name: '', quantity: '1', imageUrl: '' }]);

  // Project form
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectRecipeId, setProjectRecipeId] = useState('');
  const [projectNotes, setProjectNotes] = useState('');
  const [expandedProject, setExpandedProject] = useState<number | null>(null);

  // Filtered items (combines name search + category filter + stock filter)
  const filtered = useMemo(() => {
    return (warehouseItems as any[]).filter((i: any) => {
      const q = search.toLowerCase();
      const matchName = !q || String(i.name || '').toLowerCase().includes(q);
      const matchCat = catFilter === 'ALL' || i.category === catFilter;
      const qty = Number(i.quantity) || 0;
      const matchStock = stockFilter === 'ALL' || (stockFilter === 'IN_STOCK' && qty > 0) || (stockFilter === 'OUT_OF_STOCK' && qty === 0);
      return matchName && matchCat && matchStock;
    });
  }, [warehouseItems, search, catFilter, stockFilter]);

  const stockLookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of warehouseItems as any[]) {
      const key = String(item.nameLower || item.name || '').toLowerCase();
      m.set(key, (m.get(key) || 0) + (Number(item.quantity) || 0));
    }
    return m;
  }, [warehouseItems]);

  const totalItems = filtered.length;
  const totalUnits = filtered.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
  const allItems = (warehouseItems as any[]);
  const inStockCount = allItems.filter((i: any) => (Number(i.quantity) || 0) > 0).length;
  const outOfStockCount = allItems.filter((i: any) => (Number(i.quantity) || 0) === 0).length;
  const activeProjects = (projects as any[]).filter((p: any) => p.status === 'active').length;

  const handleCatalogSelect = (rowId: string, item: { name: string; category: string; imageUrl: string | null }) => {
    updateRow(rowId, {
      name: item.name,
      category: (item.category as ItemCategory) || '',
      imageUrl: item.imageUrl || resolveCategoryIcon(item.category) || '',
      quantity: '0',
    });
  };

  const handleCategoryChange = (rowId: string, newCat: ItemCategory | '') => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const nextImg = newCat ? resolveCategoryIcon(newCat) : '';
      return { ...r, category: newCat, imageUrl: nextImg || r.imageUrl };
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);

    const invalidQtyRows = rows.filter(r => isInvalidQuantity(r.quantity));
    if (invalidQtyRows.length > 0) {
      const firstInvalid = invalidQtyRows[0];
      const firstIdx = rows.findIndex(r => r.id === firstInvalid.id);
      const el = rowRefs.current[firstInvalid.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPulseRowId(firstInvalid.id);
      window.setTimeout(() => setPulseRowId(null), 750);
      toast.error(
        invalidQtyRows.length === 1
          ? `Material #${firstIdx + 1}: ingresá una cantidad mayor a 0.`
          : `${invalidQtyRows.length} materiales necesitan una cantidad mayor a 0.`
      );
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.name.trim()) { toast.error(`Material #${i + 1}: Nombre es obligatorio`); return; }
      if (!r.category || !CATEGORIES.includes(r.category as ItemCategory)) { toast.error(`Material #${i + 1}: Seleccioná una categoría`); return; }
    }

    rows.forEach(r => {
      registerMut.mutate({
        name: r.name.trim(),
        category: r.category as string,
        quantity: parseInt(r.quantity, 10) || 1,
        imageUrl: r.imageUrl || undefined,
      });
    });

    if (rows.length === 1) {
      toast.success(`Material "${rows[0].name.trim()}" registrado.`);
    } else {
      toast.success(`${rows.length} materiales registrados.`);
    }
    setRows([emptyRow()]);
    setTriedSubmit(false);
  };

  const handleWithdraw = () => {
    if (!withdrawItem) return;
    if (!withdrawReason.trim()) { toast.error('Debe indicar un motivo'); return; }
    withdrawMut.mutate({
      id: Number(withdrawItem.id),
      quantity: Number(withdrawQty) || 1,
      reason: withdrawReason.trim(),
    });
    setWithdrawItem(null); setWithdrawQty('1'); setWithdrawReason('');
  };

  const handleCreateRecipe = () => {
    if (!recipeName.trim()) { toast.error('Nombre de receta requerido'); return; }
    const mats = recipeMaterials.filter(m => m.name.trim()).map(m => ({
      name: m.name.trim(),
      quantity: Number(m.quantity) || 1,
      imageUrl: m.imageUrl || undefined,
    }));
    if (mats.length === 0) { toast.error('Agrega al menos 1 material'); return; }
    createRecipeMut.mutate({
      name: recipeName.trim(),
      imageUrl: recipeImg || undefined,
      wikiUrl: recipeWiki || undefined,
      materials: mats,
    });
    setRecipeOpen(false);
    setRecipeName(''); setRecipeImg(''); setRecipeWiki('');
    setRecipeMaterials([{ name: '', quantity: '1', imageUrl: '' }]);
  };

  const handleCreateProject = () => {
    if (!projectRecipeId) { toast.error('Selecciona una receta'); return; }
    createProjectMut.mutate({
      recipeId: Number(projectRecipeId),
      notes: projectNotes || undefined,
    });
    setProjectOpen(false);
    setProjectRecipeId(''); setProjectNotes('');
  };

  const addMaterialRow = () => setRecipeMaterials(prev => [...prev, { name: '', quantity: '1', imageUrl: '' }]);
  const removeMaterialRow = (idx: number) => setRecipeMaterials(prev => prev.filter((_, i) => i !== idx));
  const updateMaterialRow = (idx: number, field: string, value: string) => setRecipeMaterials(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));

  const validCount = rows.filter(r => r.name.trim() && r.category).length;

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Warehouse Clan</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Bodega del clan — materiales para crafteo. Los ítems se acumulan automáticamente al confirmar.
        </p>
      </div>

      {/* Tabs — pill style */}
      <div
        className="flex items-center gap-1 mb-5 rounded-xl p-1"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          type="button"
          onClick={() => setTab('bodega')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background: tab === 'bodega'
              ? 'linear-gradient(135deg, rgba(123,241,214,0.25), rgba(139,183,250,0.25))'
              : 'transparent',
            color: tab === 'bodega' ? '#7bf1d6' : 'rgba(255,255,255,0.55)',
            border: tab === 'bodega' ? '1px solid rgba(123,241,214,0.25)' : '1px solid transparent',
          }}
        >
          <Package className="h-4 w-4" />
          Bodega ({totalItems})
        </button>
        <button
          type="button"
          onClick={() => setTab('crafteo')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background: tab === 'crafteo'
              ? 'linear-gradient(135deg, rgba(232,121,249,0.25), rgba(167,139,250,0.25))'
              : 'transparent',
            color: tab === 'crafteo' ? '#e879f9' : 'rgba(255,255,255,0.55)',
            border: tab === 'crafteo' ? '1px solid rgba(232,121,249,0.25)' : '1px solid transparent',
          }}
        >
          <Hammer className="h-4 w-4" />
          Crafteo ({activeProjects})
        </button>
      </div>

      {/* ═══ TAB: BODEGA ═══ */}
      {tab === 'bodega' && (
        <div className="space-y-5">
          {/* Registration Panel (card-glass, CreateItemPanel style) */}
          {canRegister && (
            <div className="card-glass rounded-2xl p-5 relative" style={{ zIndex: 20 }}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    <PackagePlus className="h-5 w-5" style={{ color: '#7bf1d6' }} />
                    Registro de Materiales
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Registrá materiales para la bodega. El autocompletado busca en el catálogo y copia
                    <strong style={{ color: 'rgba(255,255,255,0.7)' }}> nombre, categoría e imagen</strong>
                    {' '}— la cantidad siempre la ingresás vos.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Toolbar: counter + add */}
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Ítems <span style={{ color: '#f87171' }}>*</span> ({validCount})
                  </label>
                  <button
                    type="button"
                    onClick={addRow}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
                    style={{ background: 'rgba(123,241,214,0.1)', border: '1px solid rgba(123,241,214,0.25)', color: '#7bf1d6' }}
                  >
                    <Plus className="h-3 w-3" /> Añadir ítem
                  </button>
                </div>

                <div className="space-y-3">
                  {rows.map((row, idx) => {
                    const catOk = row.category && CATEGORIES.includes(row.category as ItemCategory);
                    const qtyInvalid = triedSubmit && isInvalidQuantity(row.quantity);
                    return (
                      <div
                        key={row.id}
                        ref={el => { rowRefs.current[row.id] = el; }}
                        className={`rounded-xl p-3 ${pulseRowId === row.id ? 'row-pulse-error' : ''}`}
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: `1px solid ${qtyInvalid ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.06)'}`,
                          transition: 'border-color 200ms ease',
                        }}
                      >
                        {/* Row header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                            Material #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            disabled={rows.length <= 1}
                            className="rounded-lg px-2 py-1 text-xs transition-all flex items-center gap-1"
                            style={{
                              background: 'rgba(255,120,120,0.05)',
                              border: '1px solid rgba(255,120,120,0.15)',
                              color: 'rgba(255,120,120,0.7)',
                              opacity: rows.length <= 1 ? 0.3 : 1,
                              cursor: rows.length <= 1 ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <Trash2 className="h-3 w-3" /> quitar
                          </button>
                        </div>

                        {/* Grid: name + cat + qty + image */}
                        <div className="grid gap-3 sm:grid-cols-12">
                          {/* Name with catalog typeahead */}
                          <div className="sm:col-span-4">
                            <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              Nombre del item <span style={{ color: '#f87171' }}>*</span>
                            </label>
                            <CatalogTypeahead
                              value={row.name}
                              onChange={v => updateRow(row.id, { name: v })}
                              onSelect={item => handleCatalogSelect(row.id, item)}
                              catalog={catalog as any[]}
                              placeholder="Ej: Draconic Leather"
                            />
                          </div>

                          {/* Category with FancySelect */}
                          <div className="sm:col-span-3">
                            <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              Categoría <span style={{ color: '#f87171' }}>*</span>
                            </label>
                            <FancySelect<ItemCategory | ''>
                              value={catOk ? (row.category as ItemCategory) : ''}
                              onChange={v => handleCategoryChange(row.id, v as ItemCategory | '')}
                              accent="turquoise"
                              size="md"
                              placeholder="-- Seleccionar --"
                              options={CATEGORIES.map<FancyOption<ItemCategory | ''>>(cat => {
                                const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                                return { value: cat, label: meta.label, emoji: meta.emoji };
                              })}
                            />
                          </div>

                          {/* Quantity */}
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              Cant. <span style={{ color: '#f87171' }}>*</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={row.quantity}
                              onChange={e => updateRow(row.id, { quantity: e.target.value })}
                              onFocus={e => { if (row.quantity === '0') { updateRow(row.id, { quantity: '' }); e.target.select?.(); } }}
                              placeholder="0"
                              className={`w-full rounded-lg px-2 py-1.5 text-xs ${qtyInvalid ? 'input-error' : ''}`}
                              style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: `1px solid ${qtyInvalid ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                color: 'rgba(255,255,255,0.9)',
                                height: 36,
                              }}
                              aria-invalid={qtyInvalid}
                            />
                            {qtyInvalid && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] font-medium" style={{ color: '#f87171', whiteSpace: 'nowrap' }}>
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                <span>debe ser &gt; 0</span>
                              </div>
                            )}
                          </div>

                          {/* Image preview */}
                          <div className="sm:col-span-3">
                            <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              Imagen
                            </label>
                            <div
                              className="rounded-lg overflow-hidden flex items-center justify-center px-2 gap-2"
                              style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)', height: 36 }}
                              title={row.imageUrl ? 'Asignada desde catálogo' : 'Elegí del catálogo o una categoría'}
                            >
                              {row.imageUrl ? (
                                <>
                                  <img src={row.imageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  <span className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                    auto · {catOk ? row.category : ''}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <ImageIcon className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    elegí categoría
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={registerMut.isPending}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                  style={{
                    background: 'linear-gradient(135deg, rgba(123,241,214,0.2), rgba(139,183,250,0.2))',
                    border: '1px solid rgba(123,241,214,0.35)',
                    color: '#7bf1d6',
                    opacity: registerMut.isPending ? 0.5 : 1,
                    cursor: registerMut.isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {registerMut.isPending
                    ? 'Registrando…'
                    : rows.length === 1
                    ? 'Registrar item'
                    : `Registrar ${rows.length} items`}
                </button>
              </form>
            </div>
          )}

          {/* Incoming (pending confirmation) */}
          {(incoming as any[]).length > 0 && (
            <div className="card-glass rounded-2xl p-5" style={{ borderColor: 'rgba(251,191,36,0.15)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: '#fbbf24' }}>
                ⏳ Pendientes de confirmación ({(incoming as any[]).length})
              </p>
              <div className="space-y-1.5">
                {(incoming as any[]).map((inc: any) => (
                  <div key={inc.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-3 text-sm">
                      {inc.imageUrl && <img src={inc.imageUrl} alt="" className="h-6 w-6 rounded object-cover" />}
                      <span style={{ color: 'rgba(255,255,255,0.8)' }}>{inc.name}</span>
                      {(() => {
                        const meta = categoryMeta[inc.category];
                        return meta ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30`, color: meta.color }}>
                            {meta.emoji} {meta.label}
                          </span>
                        ) : null;
                      })()}
                      <span className="font-mono font-bold" style={{ color: '#60a5fa' }}>×{inc.quantity}</span>
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>por {inc.registeredBy}</span>
                    </div>
                    {isSA && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setConfirmAction({
                            title: 'Confirmar material',
                            message: `¿Confirmar "${inc.name}" ×${inc.quantity}? Se agrupará con el stock existente.`,
                            label: 'Confirmar',
                            color: '#34d399',
                            action: () => { confirmMut.mutate({ id: Number(inc.id) }); setConfirmAction(null); },
                            itemName: inc.name,
                            itemDetail: `${(() => { const m = categoryMeta[inc.category]; return m ? m.emoji + ' ' + m.label : inc.category; })()} · ×${inc.quantity}`,
                            itemImage: inc.imageUrl || null,
                          })}
                          className="p-1.5 rounded-lg" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }} title="Confirmar"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmAction({
                            title: 'Rechazar material',
                            message: `¿Eliminar el registro pendiente de "${inc.name}" ×${inc.quantity}? Esta acción no se puede deshacer.`,
                            label: 'Sí, eliminar',
                            color: '#ef4444',
                            action: () => { deleteIncomingMut.mutate({ id: Number(inc.id) }); setConfirmAction(null); },
                            itemName: inc.name,
                            itemDetail: `Pendiente · ×${inc.quantity} · por ${inc.registeredBy}`,
                            itemImage: inc.imageUrl || null,
                          })}
                          className="p-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }} title="Rechazar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warehouse Items Table */}
          <div className="card-glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  Warehouse Items
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(123,241,214,0.15)', color: '#7bf1d6' }}>{totalItems}</span>
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Unid: {totalUnits.toLocaleString()} · Con stock: {inStockCount} · Sin stock: {outOfStockCount}
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center mb-4">
              <div className="relative min-w-[180px]" style={{ flex: '1 1 180px' }}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <input
                  type="text" placeholder="Buscar por nombre..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-lg pl-10 pr-3 py-2 text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}
                />
              </div>
              <div style={{ minWidth: 210, flex: '0 0 auto' }}>
                <FancySelect<string>
                  value={catFilter}
                  onChange={setCatFilter}
                  accent="turquoise"
                  size="md"
                  placeholder="Todas las categorías"
                  options={[
                    { value: 'ALL', label: 'Todas las categorías', emoji: '📦' },
                    ...CATEGORIES.map(cat => {
                      const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                      return { value: cat, label: meta.label, emoji: meta.emoji };
                    }),
                  ]}
                />
              </div>
              <div style={{ minWidth: 190, flex: '0 0 auto' }}>
                <FancySelect<string>
                  value={stockFilter}
                  onChange={setStockFilter}
                  accent="turquoise"
                  size="md"
                  placeholder="Todos los estados"
                  options={[
                    { value: 'ALL', label: 'Todos los estados', emoji: '📋' },
                    { value: 'IN_STOCK', label: 'Con stock', emoji: '✅' },
                    { value: 'OUT_OF_STOCK', label: 'Sin stock', emoji: '❌' },
                  ]}
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>IMG</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>NOMBRE</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>CATEGORÍA</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>CANTIDAD</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>ESTADO</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      No hay materiales en la bodega.
                    </td></tr>
                  )}
                  {filtered.map((item: any) => {
                    const qty = Number(item.quantity) || 0;
                    const inStock = qty > 0;
                    const meta = categoryMeta[item.category] || { emoji: '📦', label: item.category, color: '#7bf1d6' };
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover border" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                          ) : (
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                              <Package className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{item.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30`, color: meta.color }}>
                            {meta.emoji} {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-sm" style={{ color: inStock ? '#34d399' : '#ef4444' }}>
                            {qty.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{
                            background: inStock ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${inStock ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
                            color: inStock ? '#34d399' : '#ef4444',
                          }}>
                            {inStock ? '✅ Con stock' : '❌ Sin stock'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {isAdminOrAbove && inStock && (
                              <button onClick={() => { setWithdrawItem(item); setWithdrawQty('1'); setWithdrawReason(''); }} className="p-1.5 rounded-lg transition-all hover:bg-white/5" style={{ color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }} title="Descontar">
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {isSA && (
                              <button
                                onClick={() => setConfirmAction({
                                  title: 'Eliminar material',
                                  message: 'Esta acción eliminará el material de la bodega de forma permanente. No se puede deshacer.',
                                  label: 'Sí, eliminar',
                                  color: '#ef4444',
                                  action: () => { deleteItemMut.mutate({ id: Number(item.id) }); setConfirmAction(null); },
                                  itemName: item.name,
                                  itemDetail: `${meta.emoji} ${meta.label} · Stock ${qty}`,
                                  itemImage: item.imageUrl || null,
                                })}
                                className="p-1.5 rounded-lg transition-all hover:bg-white/5" style={{ color: 'rgba(255,120,120,0.7)', border: '1px solid rgba(239,68,68,0.2)' }} title="Eliminar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: CRAFTEO ═══ */}
      {tab === 'crafteo' && (
        <div className="space-y-5">
          {isSA && (
            <div className="flex gap-2">
              <button onClick={() => setRecipeOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>
                <Plus className="h-3.5 w-3.5" /> Nueva Receta
              </button>
              <button onClick={() => setProjectOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                <Hammer className="h-3.5 w-3.5" /> Nuevo Proyecto
              </button>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>Proyectos Activos</h3>
            {(projects as any[]).filter((p: any) => p.status === 'active').length === 0 && (
              <div className="card-glass rounded-2xl p-8 text-center">
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay proyectos activos. {isSA ? 'Crea uno desde "Nuevo Proyecto".' : ''}</p>
              </div>
            )}
            {(projects as any[]).filter((p: any) => p.status === 'active').map((project: any) => {
              const recipe = (recipes as any[]).find((r: any) => Number(r.id) === Number(project.recipeId));
              const materials = recipe?.materials || [];
              const totalMats = materials.length;
              const completedMats = materials.filter((m: any) => {
                const have = stockLookup.get(String(m.nameLower || m.name || '').toLowerCase()) || 0;
                return have >= (Number(m.quantity) || 0);
              }).length;
              const progress = totalMats > 0 ? Math.round((completedMats / totalMats) * 100) : 0;
              const isExpanded = expandedProject === Number(project.id);

              return (
                <div key={project.id} className="card-glass rounded-2xl overflow-hidden" style={{ borderColor: 'rgba(168,85,247,0.15)' }}>
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => setExpandedProject(isExpanded ? null : Number(project.id))}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🎯</span>
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>{project.recipeName}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Creado por {project.createdBy} · {new Date(project.createdAt).toLocaleDateString('es-CL')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: progress === 100 ? '#34d399' : progress >= 50 ? '#fbbf24' : '#ef4444' }} />
                        </div>
                        <span className="text-xs font-mono font-bold" style={{ color: progress === 100 ? '#34d399' : 'rgba(255,255,255,0.6)' }}>{progress}%</span>
                      </div>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{completedMats}/{totalMats}</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      {recipe?.wikiUrl && (
                        <a href={recipe.wikiUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] mt-3 mb-3 px-2 py-1 rounded-lg" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}>
                          <ExternalLink className="h-3 w-3" /> Ver en Wiki
                        </a>
                      )}
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <th className="py-2 text-left font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Material</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Necesario</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Tenemos</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Falta</th>
                            <th className="py-2 text-center font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {materials.map((mat: any, mi: number) => {
                            const need = Number(mat.quantity) || 0;
                            const have = stockLookup.get(String(mat.nameLower || mat.name || '').toLowerCase()) || 0;
                            const missing = Math.max(0, need - have);
                            const status = have >= need ? 'complete' : have > 0 ? 'partial' : 'none';
                            return (
                              <tr key={mi} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td className="py-2"><span style={{ color: status === 'complete' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.8)', textDecoration: status === 'complete' ? 'line-through' : 'none' }}>{mat.name}</span></td>
                                <td className="py-2 text-right font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>{need.toLocaleString()}</td>
                                <td className="py-2 text-right font-mono" style={{ color: have > 0 ? '#34d399' : 'rgba(255,255,255,0.3)' }}>{have.toLocaleString()}</td>
                                <td className="py-2 text-right font-mono font-bold" style={{ color: missing > 0 ? '#ef4444' : '#34d399' }}>{missing > 0 ? missing.toLocaleString() : '—'}</td>
                                <td className="py-2 text-center"><span style={{ fontSize: 14 }}>{status === 'complete' ? '✅' : status === 'partial' ? '⚠️' : '❌'}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {isSA && (
                        <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {progress === 100 && (
                            <button
                              onClick={() => setConfirmAction({
                                title: 'Completar proyecto',
                                message: 'Se marcará como completado. Los materiales no se descontarán automáticamente.',
                                label: 'Sí, completar',
                                color: '#34d399',
                                action: () => { completeProjectMut.mutate({ id: Number(project.id) }); setConfirmAction(null); },
                                itemName: project.recipeName,
                                itemDetail: `Progreso ${progress}% · ${completedMats}/${totalMats} materiales`,
                              })}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}
                            >
                              <CheckCircle className="inline h-3.5 w-3.5 mr-1" /> Marcar Completado
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmAction({
                              title: 'Eliminar proyecto',
                              message: 'Esta acción eliminará el proyecto de forma permanente. No se puede deshacer.',
                              label: 'Sí, eliminar',
                              color: '#ef4444',
                              action: () => { deleteProjectMut.mutate({ id: Number(project.id) }); setConfirmAction(null); },
                              itemName: project.recipeName,
                              itemDetail: `Proyecto activo · ${completedMats}/${totalMats} materiales`,
                            })}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                          >
                            <Trash2 className="inline h-3.5 w-3.5 mr-1" /> Eliminar Proyecto
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>Recetas Guardadas ({(recipes as any[]).length})</h3>
            {(recipes as any[]).length === 0 && (
              <div className="card-glass rounded-2xl p-6 text-center">
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay recetas. {isSA ? 'Crea una desde "Nueva Receta".' : ''}</p>
              </div>
            )}
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {(recipes as any[]).map((recipe: any) => (
                <div key={recipe.id} className="card-glass rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{recipe.name}</p>
                    {isSA && (
                      <button
                        onClick={() => setConfirmAction({
                          title: 'Eliminar receta',
                          message: 'Los proyectos existentes no se eliminarán, pero ya no podrás crear nuevos proyectos con esta receta.',
                          label: 'Sí, eliminar',
                          color: '#ef4444',
                          action: () => { deleteRecipeMut.mutate({ id: Number(recipe.id) }); setConfirmAction(null); },
                          itemName: recipe.name,
                          itemDetail: `${recipe.materials?.length || 0} materiales · por ${recipe.createdBy}`,
                        })}
                        className="p-1 rounded hover:bg-white/5" style={{ color: 'rgba(239,68,68,0.6)' }} title="Eliminar receta"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{recipe.materials?.length || 0} materiales · por {recipe.createdBy}</p>
                  {recipe.wikiUrl && (
                    <a href={recipe.wikiUrl} target="_blank" rel="noopener noreferrer" className="text-[10px]" style={{ color: '#60a5fa' }}>
                      <ExternalLink className="inline h-2.5 w-2.5 mr-0.5" /> Wiki
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {(projects as any[]).filter((p: any) => p.status === 'completed').length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>Proyectos Completados</h3>
              {(projects as any[]).filter((p: any) => p.status === 'completed').map((project: any) => (
                <div key={project.id} className="card-glass rounded-lg flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <span>✅</span>
                    <span className="line-through">{project.recipeName}</span>
                    <span className="text-[10px]">{project.completedAt ? new Date(project.completedAt).toLocaleDateString('es-CL') : ''}</span>
                  </div>
                  {isSA && (
                    <button
                      onClick={() => setConfirmAction({
                        title: 'Eliminar proyecto completado',
                        message: 'Se eliminará el registro del proyecto completado. No se puede deshacer.',
                        label: 'Sí, eliminar',
                        color: '#ef4444',
                        action: () => { deleteProjectMut.mutate({ id: Number(project.id) }); setConfirmAction(null); },
                        itemName: project.recipeName,
                        itemDetail: `Completado ${project.completedAt ? new Date(project.completedAt).toLocaleDateString('es-CL') : ''}`,
                      })}
                      className="p-1 rounded hover:bg-white/5" style={{ color: 'rgba(239,68,68,0.4)' }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Generic Confirmation Modal */}
      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmLabel={confirmAction?.label || 'Confirmar'}
        confirmColor={confirmAction?.color || '#34d399'}
        onConfirm={() => confirmAction?.action()}
        onCancel={() => setConfirmAction(null)}
        itemName={confirmAction?.itemName}
        itemDetail={confirmAction?.itemDetail}
        itemImage={confirmAction?.itemImage}
      />

      {/* Withdraw Modal */}
      {withdrawItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Descontar: {withdrawItem.name}</h3>
              <button onClick={() => setWithdrawItem(null)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Stock actual: <span className="font-bold" style={{ color: '#34d399' }}>{Number(withdrawItem.quantity).toLocaleString()}</span></p>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Cantidad a descontar *</label>
                <input type="number" min="1" max={withdrawItem.quantity} value={withdrawQty} onChange={e => setWithdrawQty(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Motivo *</label>
                <input value={withdrawReason} onChange={e => setWithdrawReason(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Crafteo Lance, donación, etc." />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setWithdrawItem(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button onClick={handleWithdraw} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>Descontar</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Recipe Modal */}
      {recipeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-lg mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Nueva Receta de Crafteo</h3>
              <button onClick={() => setRecipeOpen(false)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Nombre del ítem final *</label>
                <input value={recipeName} onChange={e => setRecipeName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Lance, Majestic Plate Armor, etc." />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>URL Wiki (opcional)</label>
                <input value={recipeWiki} onChange={e => setRecipeWiki(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="https://wikipedia1.mw2.wiki/lu4/item/..." />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>URL Imagen (opcional)</label>
                <input value={recipeImg} onChange={e => setRecipeImg(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="https://..." />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Materiales requeridos *</label>
                <div className="space-y-2">
                  {recipeMaterials.map((mat, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input value={mat.name} onChange={e => updateMaterialRow(idx, 'name', e.target.value)} placeholder="Nombre del material" className="flex-1 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} />
                      <input type="number" min="1" value={mat.quantity} onChange={e => updateMaterialRow(idx, 'quantity', e.target.value)} className="w-20 rounded-lg px-3 py-1.5 text-xs text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} />
                      {recipeMaterials.length > 1 && (
                        <button onClick={() => removeMaterialRow(idx)} className="p-1 rounded" style={{ color: 'rgba(239,68,68,0.5)' }}><X className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={addMaterialRow} className="mt-2 text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
                  + Agregar material
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setRecipeOpen(false)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button onClick={handleCreateRecipe} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(168,85,247,0.2)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>Crear Receta</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {projectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Nuevo Proyecto de Crafteo</h3>
              <button onClick={() => setProjectOpen(false)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Seleccionar Receta *</label>
                <select value={projectRecipeId} onChange={e => setProjectRecipeId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
                  <option value="">— Seleccionar —</option>
                  {(recipes as any[]).map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.materials?.length || 0} materiales)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Notas (opcional)</label>
                <input value={projectNotes} onChange={e => setProjectNotes(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Para armar a Juan, etc." />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setProjectOpen(false)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button onClick={handleCreateProject} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(52,211,153,0.2)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>Crear Proyecto</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
