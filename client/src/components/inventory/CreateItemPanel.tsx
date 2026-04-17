import React, { useState } from 'react';
import { ImagePlus, Lock, ShieldCheck, Plus, AlertCircle, Users, X, Search } from 'lucide-react';
import { ItemTypeahead } from './ItemTypeahead';
import { useApp } from '../../contexts/AppContext';
import { categoryMeta, CATEGORIES } from '../../lib/category-meta';
import type { Item, ItemCategory } from '../../lib/types';
import { toast } from 'sonner';

const DEFAULT_IMAGES: Record<ItemCategory, string> = {
  ARMADURA:   'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?auto=format&fit=crop&w=80&q=80',
  ARMA:       'https://images.unsplash.com/photo-1589656966895-2f33e7653819?auto=format&fit=crop&w=80&q=80',
  KEY:        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=80&q=80',
  RECIPE:     'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=80&q=80',
  MATERIALES: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=80&q=80',
  QUEST:      'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=80&q=80',
  ADENA:      'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=80&q=80',
};

export function CreateItemPanel() {
  const { addItem, currentUser, characters } = useApp();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('ARMA');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [charSearch, setCharSearch] = useState('');
  const [showCharPicker, setShowCharPicker] = useState(false);

  const filteredChars = characters.filter(c =>
    c.name.toLowerCase().includes(charSearch.toLowerCase()) ||
    c.class.toLowerCase().includes(charSearch.toLowerCase())
  );

  const toggleChar = (charId: string) => {
    setSelectedCharIds(prev =>
      prev.includes(charId) ? prev.filter(id => id !== charId) : [...prev, charId]
    );
  };

  const removeChar = (charId: string) => {
    setSelectedCharIds(prev => prev.filter(id => id !== charId));
  };

  const handleSelect = (item: Item) => {
    setName(item.name);
    setCategory(item.category);
    if (item.price) setPrice(String(item.price));
    if (item.image?.publicUrl) {
      setImageUrl(item.image.publicUrl);
      setImagePreview(item.image.publicUrl);
    }
    setSelectedCharIds(item.associatedCharacterIds);
  };

  const handleCategoryChange = (cat: ItemCategory) => {
    setCategory(cat);
    if (!imageUrl) {
      setImagePreview(DEFAULT_IMAGES[cat]);
    }
  };

  const handleImageUrl = (url: string) => {
    setImageUrl(url);
    setImagePreview(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('El nombre del ítem es obligatorio'); return; }
    const qty = parseInt(quantity) || 1;
    if (qty < 1) { toast.error('La cantidad debe ser al menos 1'); return; }
    const finalImage = imageUrl || DEFAULT_IMAGES[category];
    addItem({
      name: name.trim(),
      category,
      price: price ? Number(price) : null,
      status: 'EN_REGISTRO',
      image: {
        id: `img-${Date.now()}`,
        publicUrl: finalImage,
        altText: categoryMeta[category].label,
      },
      associatedCharacterIds: selectedCharIds,
      quantity: qty,
      quantitySoldInCycle: 0,
    });
    toast.success(`Ítem "${name}" registrado con ${qty} unidad(es) y ${selectedCharIds.length} personaje(s) asociado(s)`);
    setName(''); setCategory('ARMA'); setPrice(''); setQuantity('1');
    setImageUrl(''); setImagePreview(''); setSelectedCharIds(''.split(',').filter(Boolean));
  };

  const canCreate = currentUser && currentUser.role === 'MAPPER' || currentUser && currentUser.role === 'SUPER_ADMIN';

  return (
    <div className="card-glass rounded-2xl p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Registro de Ítems</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Crea nuevos ítems con imagen, cantidad y personajes asociados. El autocompletado evita duplicados.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
          style={{ borderColor: 'rgba(123,241,214,0.25)', background: 'rgba(123,241,214,0.08)', color: '#7bf1d6' }}>
          <ShieldCheck className="h-3.5 w-3.5" />
          Reglas por rol activas
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: fields */}
          <div className="space-y-4">
            {/* Nombre */}
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Nombre del ítem <span style={{ color: '#f87171' }}>*</span>
              </label>
              <ItemTypeahead value={name} onChange={setName} onSelect={handleSelect} />
              <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Escribe para buscar ítems existentes o ingresa un nombre nuevo
              </p>
            </div>

            {/* Categoría + Precio + Cantidad */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Categoría <span style={{ color: '#f87171' }}>*</span>
                </label>
                <select
                  value={category}
                  onChange={e => handleCategoryChange(e.target.value as ItemCategory)}
                  className="select-dark h-11">
                  {CATEGORIES.map(cat => {
                    const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                    return <option key={cat} value={cat}>{meta.emoji} {meta.label}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Precio (Adena)
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="Ej: 1200"
                  className="input-dark h-11"
                  min="0"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Cantidad <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="1"
                  className="input-dark h-11"
                  min="1"
                />
              </div>
            </div>

            {/* URL de imagen */}
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                URL de imagen (opcional)
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={e => handleImageUrl(e.target.value)}
                placeholder="https://..."
                className="input-dark h-11"
              />
            </div>

            {/* Selector de personajes */}
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <Users className="inline h-3.5 w-3.5 mr-1" />
                Personajes asociados <span style={{ color: 'rgba(255,255,255,0.3)' }}>(quienes ayudaron a conseguir el ítem)</span>
              </label>

              {/* Chips de personajes seleccionados */}
              {selectedCharIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedCharIds.map(cid => {
                    const char = characters.find(c => c.id === cid);
                    if (!char) return null;
                    return (
                      <div key={cid} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                        style={{ background: 'rgba(123,241,214,0.12)', border: '1px solid rgba(123,241,214,0.25)', color: '#7bf1d6' }}>
                        <div className={`flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br ${char.avatar} text-white`}
                          style={{ fontSize: '8px', fontWeight: 'bold' }}>
                          {char.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span>{char.name}</span>
                        <button type="button" onClick={() => removeChar(cid)} className="ml-0.5 hover:opacity-70">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Botón para abrir picker */}
              <button
                type="button"
                onClick={() => setShowCharPicker(!showCharPicker)}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs w-full text-left transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderColor: showCharPicker ? 'rgba(123,241,214,0.4)' : 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.6)',
                }}>
                <Users className="h-3.5 w-3.5" />
                {selectedCharIds.length === 0
                  ? 'Seleccionar personajes...'
                  : `${selectedCharIds.length} personaje(s) seleccionado(s)`}
              </button>

              {/* Dropdown picker */}
              {showCharPicker && (
                <div className="mt-1 rounded-xl border overflow-hidden"
                  style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(255,255,255,0.1)', maxHeight: 220, overflowY: 'auto' }}>
                  {/* Búsqueda */}
                  <div className="flex items-center gap-2 border-b px-3 py-2 sticky top-0"
                    style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
                    <input
                      value={charSearch}
                      onChange={e => setCharSearch(e.target.value)}
                      placeholder="Buscar personaje..."
                      className="bg-transparent text-xs outline-none w-full"
                      style={{ color: 'rgba(255,255,255,0.8)' }}
                    />
                  </div>
                  {filteredChars.map(char => {
                    const isSelected = selectedCharIds.includes(char.id);
                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => toggleChar(char.id)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-all hover:bg-white/5"
                        style={{ background: isSelected ? 'rgba(123,241,214,0.06)' : undefined }}>
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${char.avatar} text-xs font-bold text-white`}>
                          {char.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{char.name}</p>
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{char.class} · Nv.{char.level}</p>
                        </div>
                        <div className="shrink-0 h-4 w-4 rounded border flex items-center justify-center"
                          style={{
                            borderColor: isSelected ? '#7bf1d6' : 'rgba(255,255,255,0.2)',
                            background: isSelected ? 'rgba(123,241,214,0.2)' : 'transparent',
                          }}>
                          {isSelected && <span style={{ color: '#7bf1d6', fontSize: 10 }}>✓</span>}
                        </div>
                      </button>
                    );
                  })}
                  {filteredChars.length === 0 && (
                    <p className="px-3 py-4 text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      No se encontraron personajes
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: image preview */}
          <div className="rounded-2xl border border-dashed p-4 flex flex-col items-center justify-center min-h-[200px]"
            style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.01)' }}>
            {imagePreview ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative h-24 w-24 overflow-hidden rounded-2xl border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                </div>
                <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Vista previa de la imagen del ítem
                </p>
                <button type="button" onClick={() => { setImageUrl(''); setImagePreview(''); }}
                  className="text-xs" style={{ color: '#f87171' }}>
                  Quitar imagen
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ background: 'rgba(232,121,249,0.12)', border: '1px solid rgba(232,121,249,0.2)' }}>
                  <ImagePlus className="h-6 w-6" style={{ color: '#e879f9' }} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>Imagen del ítem</p>
                  <p className="mt-1 text-xs max-w-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Ingresa una URL o se asignará automáticamente la imagen de la categoría seleccionada.
                  </p>
                </div>
              </div>
            )}

            {/* Resumen de personajes seleccionados */}
            {selectedCharIds.length > 0 && (
              <div className="mt-4 w-full rounded-xl p-3" style={{ background: 'rgba(123,241,214,0.06)', border: '1px solid rgba(123,241,214,0.15)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: '#7bf1d6' }}>
                  <Users className="inline h-3 w-3 mr-1" />
                  {selectedCharIds.length} personaje(s) asociado(s)
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Cada uno recibirá 1/{selectedCharIds.length} de la ganancia al vender este ítem.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.06)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(251,191,36,0.8)' }}>
            <Lock className="h-3.5 w-3.5" />
            Relación 1:1 imagen → ítem. Una vez confirmado, la imagen queda bloqueada para Mapper.
          </div>
          {!canCreate && (
            <div className="flex items-center gap-1 text-xs" style={{ color: '#f87171' }}>
              <AlertCircle className="h-3.5 w-3.5" /> Sin permisos
            </div>
          )}
          <button type="submit" disabled={!canCreate} className="btn-primary">
            <Plus className="h-4 w-4" />
            Guardar ítem
          </button>
        </div>
      </form>
    </div>
  );
}
