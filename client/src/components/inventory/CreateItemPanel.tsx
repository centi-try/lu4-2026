import React, { useState } from 'react';
import { ImagePlus, ShieldCheck, Plus, Users, X, Search, Trash2, PackagePlus } from 'lucide-react';
import { ItemTypeahead } from './ItemTypeahead';
import { useApp } from '../../contexts/AppContext';
import { categoryMeta, CATEGORIES } from '../../lib/category-meta';
import type { Item, ItemCategory } from '../../lib/types';
import { toast } from 'sonner';

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
// Registro de ítems — formulario multi-fila (inspirado en RaidInventory)
//
// Cada fila representa UN ítem a registrar. El usuario puede agregar N filas
// y registrarlas todas de una sola vez con el botón "Registrar lote".
//
// Autocompletado por fila (typeahead de ítems existentes):
//   - ✅ autocompleta: nombre, categoría, precio, imagen
//   - ❌ NO autocompleta: cantidad (queda en 1) ni personajes (quedan vacíos)
//
// Esto permite registrar variantes de un ítem ya conocido asignándole otros
// personajes o una cantidad distinta sin arrastrar los del original.
//
// Backend: se invoca `addItem` N veces (una por fila válida). Cero cambios
// de schema; cero cambios en otras pantallas.
// ============================================================================

interface RowState {
  id: string;
  name: string;
  category: ItemCategory;
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
  category: 'ARMA',
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

  const addRow = () => {
    setRows(prev => [...prev, emptyRow()]);
  };

  const removeRow = (id: string) => {
    setRows(prev => (prev.length === 1 ? prev : prev.filter(r => r.id !== id)));
  };

  // Typeahead select: autocompleta nombre, categoría, precio, imagen.
  // NO toca cantidad ni personajes — permite que el usuario re-registre
  // un ítem conocido asignándole un reparto distinto.
  const applyTypeaheadSelection = (rowId: string, item: Item) => {
    updateRow(rowId, {
      name: item.name,
      category: item.category,
      price: item.price != null ? String(item.price) : '',
      imageUrl: item.image?.publicUrl ?? '',
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
    const qty = parseInt(r.quantity);
    if (isNaN(qty) || qty < 1) return 'La cantidad debe ser al menos 1';
    if (r.price && isNaN(Number(r.price))) return 'Precio inválido';
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Validar cada fila
    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(rows[i]);
      if (err) {
        toast.error(`Fila ${i + 1}: ${err}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      rows.forEach(r => {
        const qty = parseInt(r.quantity) || 1;
        const finalImage = r.imageUrl || DEFAULT_IMAGES[r.category];
        addItem({
          name: r.name.trim(),
          category: r.category,
          price: r.price ? Number(r.price) : null,
          status: 'EN_REGISTRO',
          image: {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            publicUrl: finalImage,
            altText: categoryMeta[r.category].label,
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

      // Reset a una sola fila vacía
      setRows([emptyRow()]);
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar el lote');
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

  return (
    <div className="card-glass rounded-2xl p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
            <PackagePlus className="h-5 w-5" style={{ color: '#7bf1d6' }} />
            Registro de Ítems
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Registrá uno o varios ítems en un solo lote. El autocompletado busca ítems existentes
            y copia <strong style={{ color: 'rgba(255,255,255,0.7)' }}>nombre, categoría, precio e imagen</strong>
            {' '}— la cantidad y los personajes asociados siempre los ingresás vos.
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
        {rows.map((row, idx) => {
          const thumbnail = row.imageUrl || DEFAULT_IMAGES[row.category];
          const filteredChars = characters.filter(
            c =>
              c.name.toLowerCase().includes(row.charSearch.toLowerCase()) ||
              c.class.toLowerCase().includes(row.charSearch.toLowerCase()),
          );

          return (
            <div
              key={row.id}
              className="rounded-2xl border p-4"
              style={{
                borderColor: 'rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              {/* Row header: numerito + botón remover */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-mono font-semibold"
                    style={{
                      background: 'rgba(123,241,214,0.12)',
                      color: '#7bf1d6',
                      border: '1px solid rgba(123,241,214,0.25)',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Ítem {idx + 1} de {rows.length}
                  </span>
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="rounded-lg p-1.5 transition-all"
                    style={{
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: '#f87171',
                    }}
                    title="Quitar esta fila"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Grid principal: typeahead + thumbnail */}
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                {/* Left: fields */}
                <div className="space-y-3">
                  {/* Nombre (typeahead) */}
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.6)' }}
                    >
                      Nombre del ítem <span style={{ color: '#f87171' }}>*</span>
                    </label>
                    <ItemTypeahead
                      value={row.name}
                      onChange={v => updateRow(row.id, { name: v })}
                      onSelect={item => applyTypeaheadSelection(row.id, item)}
                    />
                  </div>

                  {/* Categoría + Precio + Cantidad */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label
                        className="mb-1 block text-xs font-medium"
                        style={{ color: 'rgba(255,255,255,0.6)' }}
                      >
                        Categoría <span style={{ color: '#f87171' }}>*</span>
                      </label>
                      <select
                        value={row.category}
                        onChange={e =>
                          updateRow(row.id, { category: e.target.value as ItemCategory })
                        }
                        className="select-dark h-10"
                      >
                        {CATEGORIES.map(cat => {
                          const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                          return (
                            <option key={cat} value={cat}>
                              {meta.emoji} {meta.label}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label
                        className="mb-1 block text-xs font-medium"
                        style={{ color: 'rgba(255,255,255,0.6)' }}
                      >
                        Precio (Adena)
                      </label>
                      <input
                        type="number"
                        value={row.price}
                        onChange={e => updateRow(row.id, { price: e.target.value })}
                        placeholder="Ej: 1200"
                        className="input-dark h-10"
                        min="0"
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1 block text-xs font-medium"
                        style={{ color: 'rgba(255,255,255,0.6)' }}
                      >
                        Cantidad <span style={{ color: '#f87171' }}>*</span>
                      </label>
                      <input
                        type="number"
                        value={row.quantity}
                        onChange={e => updateRow(row.id, { quantity: e.target.value })}
                        placeholder="1"
                        className="input-dark h-10"
                        min="1"
                      />
                    </div>
                  </div>

                  {/* URL de imagen */}
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.6)' }}
                    >
                      URL de imagen (opcional)
                    </label>
                    <input
                      type="url"
                      value={row.imageUrl}
                      onChange={e => updateRow(row.id, { imageUrl: e.target.value })}
                      placeholder="https://..."
                      className="input-dark h-10"
                    />
                  </div>

                  {/* Personajes asociados */}
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.6)' }}
                    >
                      <Users className="inline h-3.5 w-3.5 mr-1" />
                      Personajes asociados{' '}
                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                        (quienes ayudaron a conseguir el ítem)
                      </span>
                    </label>

                    {row.selectedCharIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {row.selectedCharIds.map(cid => {
                          const char = characters.find(c => c.id === cid);
                          if (!char) return null;
                          return (
                            <div
                              key={cid}
                              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                              style={{
                                background: 'rgba(123,241,214,0.12)',
                                border: '1px solid rgba(123,241,214,0.25)',
                                color: '#7bf1d6',
                              }}
                            >
                              <div
                                className={`flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br ${char.avatar} text-white`}
                                style={{ fontSize: '8px', fontWeight: 'bold' }}
                              >
                                {char.name.slice(0, 1).toUpperCase()}
                              </div>
                              <span>{char.name}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateRow(row.id, {
                                    selectedCharIds: row.selectedCharIds.filter(id => id !== cid),
                                  })
                                }
                                className="ml-0.5 hover:opacity-70"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        updateRow(row.id, { showCharPicker: !row.showCharPicker })
                      }
                      className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs w-full text-left transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderColor: row.showCharPicker
                          ? 'rgba(123,241,214,0.4)'
                          : 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.6)',
                      }}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {row.selectedCharIds.length === 0
                        ? 'Seleccionar personajes...'
                        : `${row.selectedCharIds.length} personaje(s) seleccionado(s)`}
                    </button>

                    {row.showCharPicker && (
                      <div
                        className="mt-1 rounded-xl border overflow-hidden"
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
                            onChange={e => updateRow(row.id, { charSearch: e.target.value })}
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
                                background: isSelected ? 'rgba(123,241,214,0.06)' : undefined,
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
                                  <span style={{ color: '#7bf1d6', fontSize: 10 }}>✓</span>
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

                {/* Right: thumbnail */}
                <div
                  className="hidden lg:flex flex-col items-center justify-center rounded-xl border border-dashed p-3 w-32"
                  style={{
                    borderColor: 'rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.01)',
                  }}
                >
                  <div
                    className="relative h-20 w-20 overflow-hidden rounded-xl border"
                    style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/5">
                        <ImagePlus
                          className="h-6 w-6"
                          style={{ color: 'rgba(255,255,255,0.3)' }}
                        />
                      </div>
                    )}
                  </div>
                  <p
                    className="mt-2 text-[10px] text-center"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    Vista previa
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add row button */}
        <button
          type="button"
          onClick={addRow}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-all hover:bg-white/[0.03]"
          style={{
            borderColor: 'rgba(123,241,214,0.3)',
            background: 'rgba(123,241,214,0.04)',
            color: '#7bf1d6',
          }}
        >
          <Plus className="h-4 w-4" />
          Agregar otro ítem al lote
        </button>

        {/* Submit */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {rows.length === 1 ? '1 ítem listo para registrar' : `${rows.length} ítems listos para registrar`}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary h-11 px-6 text-sm font-semibold"
            style={{
              opacity: submitting ? 0.5 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting
              ? 'Registrando…'
              : rows.length === 1
              ? 'Registrar ítem'
              : `Registrar lote (${rows.length})`}
          </button>
        </div>
      </form>
    </div>
  );
}
