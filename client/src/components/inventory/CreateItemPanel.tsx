import React, { useState } from 'react';
import { ShieldCheck, Plus, Users, X, Search, Trash2, PackagePlus, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { ItemTypeahead } from './ItemTypeahead';
import { useApp } from '../../contexts/AppContext';
import { categoryMeta, CATEGORIES } from '../../lib/category-meta';
import type { Item, ItemCategory } from '../../lib/types';
import { toast } from 'sonner';

// Íconos por categoría — se asignan automáticamente cuando el usuario elige
// categoría (mismo patrón visual que /raids/inventory → drops).
const DEFAULT_IMAGES: Record<ItemCategory, string> = {
  ARMADURA:   'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?auto=format&fit=crop&w=80&q=80',
  ARMA:       'https://images.unsplash.com/photo-1589656966895-2f33e7653819?auto=format&fit=crop&w=80&q=80',
  JOYA:       'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=80&q=80',
  KEY:        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=80&q=80',
  RECIPE:     'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=80&q=80',
  MATERIALES: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=80&q=80',
  QUEST:      'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=80&q=80',
  ADENA:      'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=80&q=80',
};

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
  quantity: '1',
  imageUrl: '',
  selectedCharIds: [],
  showCharPicker: false,
  charSearch: '',
});

export function CreateItemPanel() {
  const { addItem, currentUser, characters } = useApp();
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);

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
        const nextImg =
          newCat && CATEGORIES.includes(newCat as ItemCategory)
            ? DEFAULT_IMAGES[newCat as ItemCategory]
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
  };

  // Typeahead select: autocompleta nombre, categoría, precio, imagen.
  // NO toca cantidad ni personajes — permite re-registrar un ítem conocido
  // asignándole un reparto distinto.
  const applyTypeaheadSelection = (rowId: string, item: Item) => {
    const pickedCat = item.category;
    const picked = item.image?.publicUrl;
    const fallback =
      pickedCat && CATEGORIES.includes(pickedCat as ItemCategory)
        ? DEFAULT_IMAGES[pickedCat as ItemCategory]
        : '';
    updateRow(rowId, {
      name: item.name,
      category: pickedCat,
      price: item.price != null ? String(item.price) : '',
      imageUrl: picked || fallback,
      // quantity y selectedCharIds explícitamente NO se tocan
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
        const finalImage = r.imageUrl || DEFAULT_IMAGES[cat];
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

            return (
              <div
                key={row.id}
                className="rounded-xl p-3"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
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
                    <select
                      value={catOk ? row.category : ''}
                      onChange={e =>
                        handleCategoryChange(row.id, e.target.value as ItemCategory | '')
                      }
                      className="select-dark w-full rounded-lg px-2 py-1.5 text-xs"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.9)',
                        height: 36,
                      }}
                    >
                      <option value="" className="bg-[#0a0e16]">
                        -- Seleccionar --
                      </option>
                      {CATEGORIES.map(cat => {
                        const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                        return (
                          <option key={cat} value={cat} className="bg-[#0a0e16]">
                            {meta.emoji} {meta.label}
                          </option>
                        );
                      })}
                    </select>
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
                      placeholder="1"
                      className="w-full rounded-lg px-2 py-1.5 text-xs"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.9)',
                        height: 36,
                      }}
                    />
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
