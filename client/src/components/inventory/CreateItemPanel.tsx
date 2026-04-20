import React, { useMemo, useRef, useState } from 'react';
import { ShieldCheck, Plus, Users, X, Search, Trash2, PackagePlus, Image as ImageIcon, ChevronDown, ChevronUp, Copy, Check, AlertCircle } from 'lucide-react';
import { ItemTypeahead } from './ItemTypeahead';
import { useApp } from '../../contexts/AppContext';
import { categoryMeta, CATEGORIES } from '../../lib/category-meta';
import type { Item, ItemCategory } from '../../lib/types';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import { FancySelect, type FancyOption } from '../ui/FancySelect';

// Íconos por categoría — ya no están hardcodeados. El super admin los setea
// en /raids/settings → "Iconos por categoría de drop" y el mismo mapa se
// usa acá al seleccionar categoría (fuente única, categorías compartidas
// entre inventario legacy y raid). Si una categoría no tiene icono cargado,
// la imagen queda vacía y el usuario puede subir la suya manualmente.
// Endpoint: trpc.raid.categoryIcons.list (protectedProcedure — accesible a
// USER / MAPPER / SUPER_ADMIN aunque no tengan acceso al módulo raid).

// ============================================================================
// Registro de ítems — layout compacto multi-fila, mismo patrón que el
// formulario "Registrar nuevo evento de raid" en /raids/inventory.
//
// Estructura de cada fila (columnas grid-12):
//   [Nombre (typeahead, 4)] [Categoría (3)] [Precio (2)] [Cant. (1)] [Imagen preview (2)]
//   + segunda línea colapsable con selector de "Personajes asociados".
//
// Autocompletado del typeahead (al seleccionar un ítem existente):
//   ✅ nombre, categoría, precio
//   ✅ imagen ← copia la imagen del ítem seleccionado; si queda vacía, se
//      auto-asigna el ícono default por categoría al elegir categoría.
//   ❌ cantidad  (queda en 1)
//   ❌ personajes (quedan vacíos — se asignan a mano por ítem)
// ============================================================================

interface RowState {
  id: string;
  name: string;
  category: ItemCategory | '';
  price: string;
  quantity: string;
  imageUrl: string;
  selectedCharIds: string[];
  showCharPicker: boolean;
  charSearch: string;
}

const emptyRow = (): RowState => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  category: '',
  price: '',
  // Cantidad arranca en 0 a propósito — obliga al usuario a tipear la cantidad
  // real en vez de arrastrar un "1" por defecto. La validación al submit lo
  // marca en rojo si no cambió.
  quantity: '0',
  imageUrl: '',
  selectedCharIds: [],
  showCharPicker: false,
  charSearch: '',
});

/** Indica si el string de cantidad representa un valor inválido (0, vacío, NaN, negativo). */
const isInvalidQuantity = (q: string): boolean => {
  const n = parseInt(q, 10);
  return isNaN(n) || n < 1;
};

export function CreateItemPanel() {
  const { addItem, currentUser, characters } = useApp();
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  // Mapa categoría (uppercase) → imageUrl, leído desde raid.categoryIcons.
  // Re-usamos el mismo catálogo que /raids/settings para que al seleccionar
  // Categoría en el form legacy se asigne automáticamente la imagen global.
  const categoryIconsQ = trpc.raid.categoryIcons.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const categoryIconMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    (categoryIconsQ.data || []).forEach((r: { category: string; imageUrl: string }) => {
      map[String(r.category).toUpperCase()] = r.imageUrl;
    });
    return map;
  }, [categoryIconsQ.data]);
  const resolveCategoryIcon = (cat: ItemCategory | ''): string => {
    if (!cat) return '';
    return categoryIconMap[String(cat).toUpperCase()] || '';
  };

  // Una vez que el usuario intenta submitir al menos una vez, cualquier fila
  // con cantidad inválida queda permanentemente en rojo hasta que la corrija.
  // Antes del primer intento no mostramos errores en rojo — solo el 0 inicial
  // en estado neutro, para no asustar al usuario ni bien entra a la pantalla.
  const [triedSubmit, setTriedSubmit] = useState(false);

  // Refs a cada fila (por id) para hacer scroll a la primera inválida cuando
  // el usuario intenta registrar con qty=0. También disparamos un pulso breve
  // en esa fila para remarcarla.
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pulseRowId, setPulseRowId] = useState<string | null>(null);

  // Estado del "mini-panel de copiar personajes a otras filas".
  // copyPanelRowId  = id de la fila que está actuando como origen de la copia.
  // copyTargets     = set de ids de las filas destino que el usuario marcó.
  // Se resetea al cerrar el panel, cambiar de fila, o tras copiar.
  const [copyPanelRowId, setCopyPanelRowId] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());

  const openCopyPanel = (rowId: string) => {
    if (copyPanelRowId === rowId) {
      // toggle cerrar
      setCopyPanelRowId(null);
      setCopyTargets(new Set());
    } else {
      setCopyPanelRowId(rowId);
      setCopyTargets(new Set());
    }
  };

  const toggleCopyTarget = (rowId: string) => {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const copyCharsToTargets = (fromRowId: string) => {
    const source = rows.find((r) => r.id === fromRowId);
    if (!source) return;
    if (copyTargets.size === 0) {
      toast.error('Seleccioná al menos una fila destino');
      return;
    }
    const charIds = [...source.selectedCharIds];
    setRows((prev) =>
      prev.map((r) =>
        copyTargets.has(r.id) ? { ...r, selectedCharIds: charIds } : r,
      ),
    );
    toast.success(
      `Personajes copiados a ${copyTargets.size} fila${copyTargets.size === 1 ? '' : 's'}.`,
    );
    setCopyPanelRowId(null);
    setCopyTargets(new Set());
  };

  const canCreate =
    (currentUser && currentUser.role === 'MAPPER') ||
    (currentUser && currentUser.role === 'SUPER_ADMIN');

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  // Cambiar categoría auto-asigna el ícono default si la fila no tiene imagen
  // propia todavía (misma lógica que /raids/inventory).
  const handleCategoryChange = (rowId: string, newCat: ItemCategory | '') => {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r;
        // Al elegir categoría sobrescribimos siempre la imagen con el icono
        // global de la categoría (o vacío si la categoría no tiene icono
        // cargado en /raids/settings). Si el usuario ya había subido/pegado
        // una imagen manual, queda reemplazada — misma lógica que raid.
        const nextImg =
          newCat && CATEGORIES.includes(newCat as ItemCategory)
            ? resolveCategoryIcon(newCat)
            : '';
        return { ...r, category: newCat, imageUrl: nextImg };
      }),
    );
  };

  const addRow = () => {
    setRows(prev => [...prev, emptyRow()]);
  };

  const removeRow = (id: string) => {
    setRows(prev => (prev.length === 1 ? prev : prev.filter(r => r.id !== id)));
    // Si la fila eliminada era la fuente de la copia o un destino marcado,
    // reseteo el mini-panel para que el estado no quede colgado.
    if (copyPanelRowId === id) {
      setCopyPanelRowId(null);
      setCopyTargets(new Set());
    } else if (copyTargets.has(id)) {
      setCopyTargets((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Typeahead select: autocompleta nombre, categoría, precio, imagen.
  // Cantidad y personajes NO se autocompletan, y además la cantidad se
  // resetea a '0' para forzar al usuario a tipearla manualmente — así
  // evitamos registrar accidentalmente 1 unidad cuando el mapper solo
  // quiso reutilizar los datos del ítem existente.
  const applyTypeaheadSelection = (rowId: string, item: Item) => {
    const pickedCat = item.category;
    const picked = item.image?.publicUrl;
    // Si el ítem histórico tiene imagen propia la reutilizamos; si no, caemos
    // al icono global de la categoría (cargado en /raids/settings).
    const fallback =
      pickedCat && CATEGORIES.includes(pickedCat as ItemCategory)
        ? resolveCategoryIcon(pickedCat)
        : '';
    updateRow(rowId, {
      name: item.name,
      category: pickedCat,
      price: item.price != null ? String(item.price) : '',
      imageUrl: picked || fallback,
      quantity: '0', // <- reset de seguridad, obliga a re-ingresar
      // selectedCharIds se mantienen como estaban (vacíos o lo que haya)
    });
  };

  const toggleCharInRow = (rowId: string, charId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const next = row.selectedCharIds.includes(charId)
      ? row.selectedCharIds.filter(id => id !== charId)
      : [...row.selectedCharIds, charId];
    updateRow(rowId, { selectedCharIds: next });
  };

  const validateRow = (r: RowState): string | null => {
    if (!r.name.trim()) return 'Nombre del ítem es obligatorio';
    if (!r.category || !CATEGORIES.includes(r.category as ItemCategory))
      return 'Debes seleccionar una categoría';
    const qty = parseInt(r.quantity);
    if (isNaN(qty) || qty < 1) return 'La cantidad debe ser al menos 1';
    if (r.price && isNaN(Number(r.price))) return 'Precio inválido';
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Al primer submit activamos el modo "mostrar errores" para que las
    // filas inválidas queden en rojo hasta que se corrijan.
    setTriedSubmit(true);

    // Chequeo específico de cantidad: si hay 1+ filas con qty inválida
    // concentramos el feedback en el input de cantidad (rojo + scroll + pulse).
    const invalidQtyRows = rows.filter((r) => isInvalidQuantity(r.quantity));
    if (invalidQtyRows.length > 0) {
      const firstInvalid = invalidQtyRows[0];
      const firstIdx = rows.findIndex((r) => r.id === firstInvalid.id);
      const el = rowRefs.current[firstInvalid.id];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Pulso breve (se limpia solo con el timeout)
      setPulseRowId(firstInvalid.id);
      window.setTimeout(() => setPulseRowId(null), 750);
      toast.error(
        invalidQtyRows.length === 1
          ? `Ítem #${firstIdx + 1}: ingresá una cantidad mayor a 0.`
          : `${invalidQtyRows.length} ítems necesitan una cantidad mayor a 0.`,
      );
      return;
    }

    // Validaciones restantes (nombre, categoría, precio) — mantienen el
    // toast clásico fila-por-fila como estaba antes.
    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(rows[i]);
      if (err) {
        toast.error(`Ítem #${i + 1}: ${err}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      rows.forEach(r => {
        const cat = r.category as ItemCategory;
        const qty = parseInt(r.quantity) || 1;
        const finalImage = r.imageUrl || resolveCategoryIcon(cat);
        addItem({
          name: r.name.trim(),
          category: cat,
          price: r.price ? Number(r.price) : null,
          status: 'EN_REGISTRO',
          image: {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            publicUrl: finalImage,
            altText: categoryMeta[cat].label,
          },
          associatedCharacterIds: r.selectedCharIds,
          quantity: qty,
          quantitySoldInCycle: 0,
        });
      });

      if (rows.length === 1) {
        toast.success(`Ítem "${rows[0].name.trim()}" registrado correctamente.`);
      } else {
        toast.success(`${rows.length} ítems registrados correctamente.`);
      }
      setRows([emptyRow()]);
      setTriedSubmit(false); // Reset — lote siguiente arranca limpio
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar los ítems');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canCreate) {
    return (
      <div className="card-glass rounded-2xl p-5">
        <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
          Registro de Ítems
        </h3>
        <p className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Tu rol actual no permite registrar ítems. Contactá a un administrador.
        </p>
      </div>
    );
  }

  const validCount = rows.filter(r => r.name.trim() && r.category).length;

  return (
    // NOTE: `.card-glass` aplica `backdrop-filter: blur(12px)` y eso crea un
    // stacking context. Como hay otro card-glass debajo (Inventario de Ítems),
    // ese otro pinta por encima y tapa el dropdown del typeahead. Subimos el
    // z-index de este card para que su dropdown siempre quede visible.
    <div className="card-glass rounded-2xl p-5 relative" style={{ zIndex: 20 }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
            <PackagePlus className="h-5 w-5" style={{ color: '#7bf1d6' }} />
            Registro de Ítems
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Registrá uno o varios ítems. El autocompletado busca ítems existentes y copia
            <strong style={{ color: 'rgba(255,255,255,0.7)' }}> nombre, categoría, precio e imagen</strong>
            {' '}— la cantidad y los personajes siempre los ingresás vos.
          </p>
        </div>
        <div
          className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
          style={{
            borderColor: 'rgba(123,241,214,0.25)',
            background: 'rgba(123,241,214,0.08)',
            color: '#7bf1d6',
          }}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Reglas por rol activas
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Toolbar: contador + añadir ítem */}
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs block" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Ítems <span style={{ color: '#f87171' }}>*</span> ({validCount})
          </label>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
            style={{
              background: 'rgba(123,241,214,0.1)',
              border: '1px solid rgba(123,241,214,0.25)',
              color: '#7bf1d6',
            }}
          >
            <Plus className="h-3 w-3" /> Añadir ítem
          </button>
        </div>

        <div className="space-y-3">
          {rows.map((row, idx) => {
            const catOk =
              row.category && CATEGORIES.includes(row.category as ItemCategory);
            const filteredChars = characters.filter(
              c =>
                c.name.toLowerCase().includes(row.charSearch.toLowerCase()) ||
                c.class.toLowerCase().includes(row.charSearch.toLowerCase()),
            );

            const qtyInvalid = triedSubmit && isInvalidQuantity(row.quantity);
            return (
              <div
                key={row.id}
                ref={(el) => {
                  rowRefs.current[row.id] = el;
                }}
                className={`rounded-xl p-3 ${pulseRowId === row.id ? 'row-pulse-error' : ''}`}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${qtyInvalid ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'border-color 200ms ease',
                }}
              >
                {/* Row header: #N + quitar */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    Ítem #{idx + 1}
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

                {/* Grid principal horizontal: nombre + cat + precio + cant + imagen */}
                <div className="grid gap-3 sm:grid-cols-12">
                  {/* Nombre con typeahead */}
                  <div className="sm:col-span-4">
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.55)' }}
                    >
                      Nombre del ítem <span style={{ color: '#f87171' }}>*</span>
                    </label>
                    <ItemTypeahead
                      value={row.name}
                      onChange={v => updateRow(row.id, { name: v })}
                      onSelect={item => applyTypeaheadSelection(row.id, item)}
                      placeholder="Ej: Draconic Leather"
                      compact
                    />
                  </div>

                  {/* Categoría */}
                  <div className="sm:col-span-3">
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.55)' }}
                    >
                      Categoría <span style={{ color: '#f87171' }}>*</span>
                    </label>
                    <FancySelect<ItemCategory | ''>
                      value={catOk ? (row.category as ItemCategory) : ''}
                      onChange={(v) =>
                        handleCategoryChange(row.id, v as ItemCategory | '')
                      }
                      accent="turquoise"
                      size="md"
                      placeholder="-- Seleccionar --"
                      options={CATEGORIES.map<FancyOption<ItemCategory | ''>>(cat => {
                        const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                        return { value: cat, label: meta.label, emoji: meta.emoji };
                      })}
                    />
                  </div>

                  {/* Precio */}
                  <div className="sm:col-span-2">
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.55)' }}
                    >
                      Precio (Adena)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={row.price}
                      onChange={e => updateRow(row.id, { price: e.target.value })}
                      placeholder="0"
                      className="w-full rounded-lg px-2 py-1.5 text-xs"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.9)',
                        height: 36,
                      }}
                    />
                  </div>

                  {/* Cantidad */}
                  <div className="sm:col-span-1">
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.55)' }}
                    >
                      Cant. <span style={{ color: '#f87171' }}>*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={e => updateRow(row.id, { quantity: e.target.value })}
                      onFocus={e => {
                        // UX: si el valor es '0' (default o post-typeahead),
                        // al hacer focus lo vaciamos para que el usuario
                        // pueda tipear sin borrar manualmente.
                        if (row.quantity === '0') {
                          updateRow(row.id, { quantity: '' });
                          // preservar el cursor — el browser se encarga después del re-render
                          e.target.select?.();
                        }
                      }}
                      placeholder="0"
                      className={`w-full rounded-lg px-2 py-1.5 text-xs ${qtyInvalid ? 'input-error' : ''}`}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.9)',
                        height: 36,
                      }}
                      aria-invalid={qtyInvalid}
                    />
                    {qtyInvalid && (
                      <div
                        className="flex items-center gap-1 mt-1 text-[10px] font-medium"
                        style={{ color: '#f87171', whiteSpace: 'nowrap' }}
                      >
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>debe ser &gt; 0</span>
                      </div>
                    )}
                  </div>

                  {/* Imagen preview (solo lectura, se asigna por categoría) */}
                  <div className="sm:col-span-2">
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.55)' }}
                    >
                      Imagen
                    </label>
                    <div
                      className="rounded-lg overflow-hidden flex items-center justify-center px-2 gap-2"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px dashed rgba(255,255,255,0.08)',
                        height: 36,
                      }}
                      title={
                        row.imageUrl
                          ? 'Asignada automáticamente por categoría'
                          : 'Elegí una categoría para asignar el ícono'
                      }
                    >
                      {row.imageUrl ? (
                        <>
                          <img
                            src={row.imageUrl}
                            alt=""
                            className="h-7 w-7 rounded object-cover shrink-0"
                          />
                          <span
                            className="text-[10px] truncate"
                            style={{ color: 'rgba(255,255,255,0.5)' }}
                          >
                            auto · {catOk ? row.category : ''}
                          </span>
                        </>
                      ) : (
                        <>
                          <ImageIcon
                            className="h-4 w-4 shrink-0"
                            style={{ color: 'rgba(255,255,255,0.25)' }}
                          />
                          <span
                            className="text-[10px]"
                            style={{ color: 'rgba(255,255,255,0.3)' }}
                          >
                            elegí categoría
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Segunda línea: personajes asociados (colapsable) */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() =>
                      updateRow(row.id, { showCharPicker: !row.showCharPicker })
                    }
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${
                        row.showCharPicker
                          ? 'rgba(123,241,214,0.4)'
                          : 'rgba(255,255,255,0.08)'
                      }`,
                      color: 'rgba(255,255,255,0.7)',
                    }}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Personajes asociados
                    {row.selectedCharIds.length > 0 && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: 'rgba(123,241,214,0.2)',
                          color: '#7bf1d6',
                        }}
                      >
                        {row.selectedCharIds.length}
                      </span>
                    )}
                    {row.showCharPicker ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {/* Chips de personajes ya seleccionados (visibles siempre si hay) */}
                  {row.selectedCharIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {row.selectedCharIds.map(cid => {
                        const char = characters.find(c => c.id === cid);
                        if (!char) return null;
                        return (
                          <div
                            key={cid}
                            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                            style={{
                              background: 'rgba(123,241,214,0.12)',
                              border: '1px solid rgba(123,241,214,0.25)',
                              color: '#7bf1d6',
                            }}
                          >
                            <div
                              className={`flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gradient-to-br ${char.avatar} text-white`}
                              style={{ fontSize: 8, fontWeight: 'bold' }}
                            >
                              {char.name.slice(0, 1).toUpperCase()}
                            </div>
                            <span>{char.name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                updateRow(row.id, {
                                  selectedCharIds: row.selectedCharIds.filter(
                                    id => id !== cid,
                                  ),
                                })
                              }
                              className="ml-0.5 hover:opacity-70"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Copiar personajes a otras filas — atajo para cuando varias
                      filas del mismo lote comparten los mismos personajes.
                      Solo se muestra si hay más de una fila Y la fila actual
                      tiene personajes seleccionados (si no hay nada para copiar,
                      el botón no aparece). */}
                  {rows.length > 1 && row.selectedCharIds.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => openCopyPanel(row.id)}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-all"
                        style={{
                          background: copyPanelRowId === row.id
                            ? 'rgba(139,183,250,0.18)'
                            : 'rgba(139,183,250,0.08)',
                          border: `1px solid ${
                            copyPanelRowId === row.id
                              ? 'rgba(139,183,250,0.45)'
                              : 'rgba(139,183,250,0.25)'
                          }`,
                          color: '#8bb7fa',
                        }}
                        title="Aplicá los personajes de esta fila a otras filas del lote"
                      >
                        <Copy className="h-3 w-3" />
                        Copiar estos personajes a otras filas
                        {copyPanelRowId === row.id ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>

                      {copyPanelRowId === row.id && (
                        <div
                          className="mt-2 rounded-xl border p-3"
                          style={{
                            background: 'rgba(10,14,22,0.98)',
                            borderColor: 'rgba(139,183,250,0.25)',
                          }}
                        >
                          <p
                            className="text-[11px] mb-2"
                            style={{ color: 'rgba(255,255,255,0.6)' }}
                          >
                            Marcá las filas a las que querés copiarle estos{' '}
                            <strong style={{ color: '#8bb7fa' }}>
                              {row.selectedCharIds.length} personaje
                              {row.selectedCharIds.length === 1 ? '' : 's'}
                            </strong>
                            . Los personajes que esas filas tuvieran se
                            reemplazan por los de acá.
                          </p>

                          <div className="space-y-1 mb-3">
                            {rows.map((other, otherIdx) => {
                              if (other.id === row.id) return null;
                              const checked = copyTargets.has(other.id);
                              const display =
                                other.name.trim() || `(sin nombre)`;
                              return (
                                <label
                                  key={other.id}
                                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-all"
                                  style={{
                                    background: checked
                                      ? 'rgba(139,183,250,0.1)'
                                      : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${
                                      checked
                                        ? 'rgba(139,183,250,0.35)'
                                        : 'rgba(255,255,255,0.05)'
                                    }`,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleCopyTarget(other.id)}
                                    className="cursor-pointer"
                                    style={{ accentColor: '#8bb7fa' }}
                                  />
                                  <span
                                    className="text-xs font-medium"
                                    style={{
                                      color: 'rgba(255,255,255,0.85)',
                                    }}
                                  >
                                    Ítem #{otherIdx + 1}
                                  </span>
                                  <span
                                    className="text-xs truncate flex-1"
                                    style={{
                                      color: 'rgba(255,255,255,0.45)',
                                    }}
                                  >
                                    {display}
                                  </span>
                                  {other.selectedCharIds.length > 0 && (
                                    <span
                                      className="rounded-full px-1.5 py-0.5 text-[10px]"
                                      style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        color: 'rgba(255,255,255,0.5)',
                                      }}
                                      title="Esta fila ya tenía personajes; se reemplazan"
                                    >
                                      ya tiene {other.selectedCharIds.length}
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCopyPanelRowId(null);
                                setCopyTargets(new Set());
                              }}
                              className="rounded-lg px-3 py-1.5 text-xs transition-all"
                              style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'rgba(255,255,255,0.7)',
                              }}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => copyCharsToTargets(row.id)}
                              disabled={copyTargets.size === 0}
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                              style={{
                                background:
                                  copyTargets.size === 0
                                    ? 'rgba(139,183,250,0.1)'
                                    : 'rgba(139,183,250,0.2)',
                                border: '1px solid rgba(139,183,250,0.4)',
                                color: '#8bb7fa',
                                opacity: copyTargets.size === 0 ? 0.5 : 1,
                                cursor:
                                  copyTargets.size === 0
                                    ? 'not-allowed'
                                    : 'pointer',
                              }}
                            >
                              <Check className="h-3 w-3" />
                              Copiar a {copyTargets.size} fila
                              {copyTargets.size === 1 ? '' : 's'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Picker expandido */}
                  {row.showCharPicker && (
                    <div
                      className="mt-2 rounded-xl border overflow-hidden"
                      style={{
                        background: 'rgba(10,14,22,0.98)',
                        borderColor: 'rgba(255,255,255,0.1)',
                        maxHeight: 220,
                        overflowY: 'auto',
                      }}
                    >
                      <div
                        className="flex items-center gap-2 border-b px-3 py-2 sticky top-0"
                        style={{
                          background: 'rgba(10,14,22,0.98)',
                          borderColor: 'rgba(255,255,255,0.06)',
                        }}
                      >
                        <Search
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: 'rgba(255,255,255,0.35)' }}
                        />
                        <input
                          value={row.charSearch}
                          onChange={e =>
                            updateRow(row.id, { charSearch: e.target.value })
                          }
                          placeholder="Buscar personaje..."
                          className="bg-transparent text-xs outline-none w-full"
                          style={{ color: 'rgba(255,255,255,0.8)' }}
                        />
                      </div>
                      {filteredChars.map(char => {
                        const isSelected = row.selectedCharIds.includes(char.id);
                        return (
                          <button
                            key={char.id}
                            type="button"
                            onClick={() => toggleCharInRow(row.id, char.id)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-all hover:bg-white/5"
                            style={{
                              background: isSelected
                                ? 'rgba(123,241,214,0.06)'
                                : undefined,
                            }}
                          >
                            <div
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${char.avatar} text-xs font-bold text-white`}
                            >
                              {char.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-xs font-medium truncate"
                                style={{ color: 'rgba(255,255,255,0.85)' }}
                              >
                                {char.name}
                              </p>
                              <p
                                className="text-xs"
                                style={{ color: 'rgba(255,255,255,0.35)' }}
                              >
                                {char.class} · Nv.{char.level}
                              </p>
                            </div>
                            <div
                              className="shrink-0 h-4 w-4 rounded border flex items-center justify-center"
                              style={{
                                borderColor: isSelected
                                  ? '#7bf1d6'
                                  : 'rgba(255,255,255,0.2)',
                                background: isSelected
                                  ? 'rgba(123,241,214,0.2)'
                                  : 'transparent',
                              }}
                            >
                              {isSelected && (
                                <span style={{ color: '#7bf1d6', fontSize: 10 }}>
                                  ✓
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {filteredChars.length === 0 && (
                        <p
                          className="px-3 py-4 text-xs text-center"
                          style={{ color: 'rgba(255,255,255,0.3)' }}
                        >
                          No se encontraron personajes
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Botón submit (estilo raid) */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all"
          style={{
            background:
              'linear-gradient(135deg, rgba(123,241,214,0.2), rgba(139,183,250,0.2))',
            border: '1px solid rgba(123,241,214,0.35)',
            color: '#7bf1d6',
            opacity: submitting ? 0.5 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting
            ? 'Registrando…'
            : rows.length === 1
            ? 'Registrar ítem'
            : `Registrar ${rows.length} ítems`}
        </button>
      </form>
    </div>
  );
}
