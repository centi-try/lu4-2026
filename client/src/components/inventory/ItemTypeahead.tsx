import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, ShoppingBag, Package } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { categoryMeta } from '../../lib/category-meta';
import { trpc } from '../../lib/trpc';
import type { Item } from '../../lib/types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: Item) => void;
  placeholder?: string;
  /**
   * Compact mode shrinks the input height and padding so the typeahead fits
   * inline inside a grid row (same look & feel as the drop rows in the raid
   * event form).
   */
  compact?: boolean;
}

function highlight(text: string, query: string): React.ReactNode {
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

export function ItemTypeahead({ value, onChange, onSelect, placeholder = 'Nombre del ítem con autocompletado inteligente...', compact = false }: Props) {
  const { searchItems } = useApp();
  const { data: catalogData = [] } = trpc.warehouse.catalog.list.useQuery(undefined, { staleTime: 60_000 });
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // El dropdown SOLO debe abrirse cuando el usuario escribe. Cualquier otro
  // cambio de `value` (abrir el modal con un nombre precargado, elegir una
  // sugerencia que rellena el nombre, o un re-render por refrescos de datos en
  // segundo plano) NO debe abrir la lista. Marcamos con este ref cuándo el
  // cambio proviene del teclado del usuario.
  const userTypedRef = useRef(false);
  // Mantenemos catálogo y searchItems en refs para poder leerlos dentro del
  // debounce sin que el efecto dependa de ellos. Antes el efecto se
  // re-ejecutaba cuando TanStack Query refrescaba el catálogo/ítems en segundo
  // plano, reabriendo el dropdown solo aunque el usuario ya hubiera elegido.
  const catalogRef = useRef(catalogData);
  catalogRef.current = catalogData;
  const searchItemsRef = useRef(searchItems);
  searchItemsRef.current = searchItems;

  useEffect(() => {
    clearTimeout(timerRef.current);
    // Solo reaccionamos a lo que el usuario tipea. Cambios programáticos de
    // `value` (montaje con nombre precargado, o selección de sugerencia) se
    // ignoran: no abren la lista.
    if (!userTypedRef.current) return;
    if (!value.trim()) { setResults([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      const q = value.toLowerCase();
      // Search from catalog first (priority)
      const catalogResults = (catalogRef.current || []).filter((m: any) => String(m.name || '').toLowerCase().includes(q)).slice(0, 8).map((m: any) => ({ ...m, _source: 'catalog' as const }));
      // También buscamos entre los ítems ya registrados para recuperar su
      // precio. Reglas:
      //  - Solo ítems CONFIRMADOS (los vendidos y los que aún están En Registro
      //    no se ofrecen como opción).
      //  - Sin duplicados: si el mismo nombre+categoría+precio aparece en varias
      //    filas de la tabla, se muestra una sola vez. Precios distintos del
      //    mismo ítem sí salen como opciones separadas para poder elegir.
      const seen = new Set<string>();
      const itemResults = searchItemsRef.current(value)
        .filter((i: any) => i.status === 'CONFIRMADO')
        .filter((i: any) => {
          const key = `${String(i.normalizedName || i.name || '').toLowerCase()}||${i.category}||${Number(i.price) || 0}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 5)
        .map((i: any) => ({ ...i, _source: 'item' as const }));
      // Merge: primero los ítems registrados (traen precio), luego el catálogo.
      const merged = [...itemResults, ...catalogResults].slice(0, 10);
      setResults(merged);
      setOpen(merged.length > 0);
      setLoading(false);
      setActiveIdx(-1);
    }, 200);
    return () => clearTimeout(timerRef.current);
    // OJO: solo `value` va en deps. `catalogData`/`searchItems` se leen vía ref
    // para que un refresco en segundo plano no reabra el dropdown solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleSelect = useCallback((item: any) => {
    // La selección rellena el nombre (cambia `value`); ese cambio NO debe
    // reabrir la lista.
    userTypedRef.current = false;
    clearTimeout(timerRef.current);
    setOpen(false);
    setResults([]);
    setLoading(false);
    setActiveIdx(-1);
    // If from catalog, convert to Item-like shape for onSelect
    if (item._source === 'catalog') {
      const fakeItem: any = {
        id: item.id || `cat-${Date.now()}`,
        name: item.name,
        category: item.category || '',
        price: 0,
        quantity: 1,
        image: item.imageUrl ? { publicUrl: item.imageUrl } : null,
        imageUrl: item.imageUrl || '',
        status: 'EN_REGISTRO',
        normalizedName: String(item.name || '').toLowerCase(),
      };
      onSelect(fakeItem);
    } else {
      onSelect(item);
    }
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(results[activeIdx]); }
    if (e.key === 'Escape') { setOpen(false); setActiveIdx(-1); }
  }, [open, results, activeIdx, handleSelect]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg transition-all ${compact ? 'h-9 px-2' : 'h-11 px-4 gap-3 rounded-xl'}`}
        style={{
          background: compact ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.04)',
          border: compact ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <Search className={`shrink-0 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} style={{ color: 'rgba(255,255,255,0.35)' }} />
        <input
          ref={inputRef}
          value={value}
          onChange={e => { userTypedRef.current = true; onChange(e.target.value); }}
          onKeyDown={handleKeyDown}
          onFocus={() => userTypedRef.current && results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={`w-full bg-transparent outline-none ${compact ? 'text-xs' : 'text-sm'}`}
          style={{ color: 'rgba(255,255,255,0.9)', caretColor: '#7bf1d6' }}
        />
        {loading && <Loader2 className={`animate-spin shrink-0 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} style={{ color: '#7bf1d6' }} />}
      </div>

      {open && results.length > 0 && (
        <div ref={listRef} className="autocomplete-dropdown">
          {results.map((item: any, idx: number) => {
            const isCatalog = item._source === 'catalog';
            const meta = categoryMeta[item.category] || { color: '#7bf1d6', emoji: '📦', label: item.category || 'Sin categoría' };
            const isActive = idx === activeIdx;
            const imgUrl = isCatalog ? item.imageUrl : item.image?.publicUrl;
            return (
              <button
                key={`${item._source}-${item.id}-${idx}`}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                onMouseEnter={() => setActiveIdx(idx)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-all last:border-b-0"
                style={{
                  borderColor: 'rgba(255,255,255,0.05)',
                  background: isActive ? 'rgba(123,241,214,0.06)' : 'transparent',
                }}>
                <div className="relative h-[30px] w-[30px] shrink-0 overflow-hidden rounded-lg border"
                  style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  {imgUrl ? (
                    <img src={imgUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5">
                      {isCatalog ? <Package className="h-4 w-4 text-white/20" /> : <ShoppingBag className="h-4 w-4 text-white/20" />}
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
                <div className="text-right shrink-0">
                  {isCatalog ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>catálogo</span>
                  ) : (
                    <>
                      <p className="text-xs font-mono font-semibold" style={{ color: '#7bf1d6' }}>
                        {item.price ? `$${item.price.toLocaleString()}` : '—'}
                      </p>
                      <p className="text-xs" style={{ color: item.status === 'CONFIRMADO' ? '#34d399' : '#fbbf24' }}>
                        {item.status === 'CONFIRMADO' ? 'Confirmado' : 'En Registro'}
                      </p>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
