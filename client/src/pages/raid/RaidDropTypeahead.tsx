import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, Package } from 'lucide-react';
import { categoryMeta } from '../../lib/category-meta';

/**
 * Representa un drop "sugerido" desde el histórico de drops raid.
 * Agrupamos por `name` (case-insensitive) y nos quedamos con la entrada más
 * reciente para exponer su `category`, `price` e `imageUrl`. Así, al escribir
 * el nombre de un drop que ya existió en algún evento anterior, el mapper
 * puede reutilizar la metadata (categoría/precio/imagen) sin tipearla de nuevo.
 */
export interface DropSuggestion {
  name: string;
  category: string;
  price: number;
  imageUrl: string | null;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: DropSuggestion) => void;
  /** Lista completa de drops históricos (salida de trpc.raid.drops.list). */
  drops: Array<{
    name?: string | null;
    category?: string | null;
    price?: number | null;
    imageUrl?: string | null;
    createdAt?: string | null;
  }>;
  placeholder?: string;
  disabled?: boolean;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: 'rgba(123,241,214,0.25)',
          color: '#7bf1d6',
          borderRadius: 3,
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * Typeahead de drops raid. Se alimenta de `drops` (histórico completo) y
 * deduplica por nombre, quedándose con la entrada más reciente. La fuente
 * se pasa como prop para no disparar una query nueva por cada fila del form:
 * el componente padre ya consume `trpc.raid.drops.list` una sola vez.
 */
export function RaidDropTypeahead({
  value,
  onChange,
  onSelect,
  drops,
  placeholder = 'Ej: Dynasty Leather',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Al seleccionar una sugerencia el padre setea `value` al nombre del drop
  // elegido — ese cambio volvía a disparar el efecto de filtrado y reabría el
  // dropdown. Esta señal le indica al próximo ciclo que no vuelva a abrir.
  const suppressNextOpenRef = useRef(false);

  // Índice de sugerencias deduplicadas por nombre (entrada más reciente).
  const suggestions = useMemo<DropSuggestion[]>(() => {
    const byName = new Map<string, DropSuggestion & { _ts: number }>();
    for (const d of drops || []) {
      const name = String(d.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const ts = d.createdAt ? Date.parse(String(d.createdAt)) : 0;
      const prev = byName.get(key);
      if (!prev || ts > prev._ts) {
        byName.set(key, {
          name,
          category: String(d.category || '').toUpperCase(),
          price: Number(d.price || 0),
          imageUrl: d.imageUrl || null,
          _ts: ts || 0,
        });
      }
    }
    return Array.from(byName.values()).map(({ _ts, ...s }) => s);
  }, [drops]);

  // Filtra por query con debounce suave para que la UX sea igual que el
  // typeahead del inventario antiguo.
  const [filtered, setFiltered] = useState<DropSuggestion[]>([]);
  useEffect(() => {
    clearTimeout(timerRef.current);
    const q = value.trim().toLowerCase();
    if (!q) {
      setFiltered([]);
      setOpen(false);
      suppressNextOpenRef.current = false;
      return;
    }
    if (suppressNextOpenRef.current) {
      suppressNextOpenRef.current = false;
      setFiltered([]);
      setOpen(false);
      setLoading(false);
      setActiveIdx(-1);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      const r = suggestions
        .filter((s) => s.name.toLowerCase().includes(q))
        .slice(0, 8);
      setFiltered(r);
      setOpen(r.length > 0);
      setLoading(false);
      setActiveIdx(-1);
    }, 150);
    return () => clearTimeout(timerRef.current);
  }, [value, suggestions]);

  const handleSelect = useCallback(
    (s: DropSuggestion) => {
      suppressNextOpenRef.current = true;
      setOpen(false);
      setFiltered([]);
      setActiveIdx(-1);
      onSelect(s);
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        handleSelect(filtered[activeIdx]);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setActiveIdx(-1);
      }
    },
    [open, filtered, activeIdx, handleSelect],
  );

  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  return (
    <div className="relative">
      <div
        className="flex h-9 items-center gap-2 rounded-lg px-2 transition-all"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Search
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => filtered.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-transparent text-xs outline-none"
          style={{ color: 'rgba(255,255,255,0.9)', caretColor: '#7bf1d6' }}
        />
        {loading && (
          <Loader2
            className="h-3.5 w-3.5 shrink-0 animate-spin"
            style={{ color: '#7bf1d6' }}
          />
        )}
      </div>

      {open && filtered.length > 0 && (
        <div ref={listRef} className="autocomplete-dropdown">
          {filtered.map((s, idx) => {
            const meta = categoryMeta[s.category as keyof typeof categoryMeta] || {
              color: '#7bf1d6',
              emoji: '📦',
              label: s.category || '—',
            };
            const isActive = idx === activeIdx;
            return (
              <button
                key={`${s.name}-${idx}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(s);
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-all last:border-b-0"
                style={{
                  borderColor: 'rgba(255,255,255,0.05)',
                  background: isActive ? 'rgba(123,241,214,0.06)' : 'transparent',
                }}
              >
                <div
                  className="relative h-[30px] w-[30px] shrink-0 overflow-hidden rounded-lg border"
                  style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                >
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt={s.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5">
                      <Package className="h-4 w-4 text-white/20" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: 'rgba(255,255,255,0.9)' }}
                  >
                    {highlight(s.name, value)}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                  >
                    {meta.emoji} {meta.label}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-xs font-mono font-semibold"
                    style={{ color: '#7bf1d6' }}
                  >
                    {s.price ? `$${s.price.toLocaleString()}` : '—'}
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
