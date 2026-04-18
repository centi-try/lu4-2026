import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, ShoppingBag } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { categoryMeta } from '../../lib/category-meta';
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
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!value.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      const r = searchItems(value);
      setResults(r);
      setOpen(r.length > 0);
      setLoading(false);
      setActiveIdx(-1);
    }, 200);
    return () => clearTimeout(timerRef.current);
  }, [value, searchItems]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); onSelect(results[activeIdx]); setOpen(false); }
    if (e.key === 'Escape') { setOpen(false); setActiveIdx(-1); }
  }, [open, results, activeIdx, onSelect]);

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
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={`w-full bg-transparent outline-none ${compact ? 'text-xs' : 'text-sm'}`}
          style={{ color: 'rgba(255,255,255,0.9)', caretColor: '#7bf1d6' }}
        />
        {loading && <Loader2 className={`animate-spin shrink-0 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} style={{ color: '#7bf1d6' }} />}
      </div>

      {open && results.length > 0 && (
        <div ref={listRef} className="autocomplete-dropdown">
          {results.map((item, idx) => {
            const meta = categoryMeta[item.category] || { color: '#7bf1d6', emoji: '📦', label: item.category };
            const isActive = idx === activeIdx;
            return (
              <button
                key={item.id}
                onMouseDown={() => { onSelect(item); setOpen(false); }}
                onMouseEnter={() => setActiveIdx(idx)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-all last:border-b-0"
                style={{
                  borderColor: 'rgba(255,255,255,0.05)',
                  background: isActive ? 'rgba(123,241,214,0.06)' : 'transparent',
                }}>
                <div className="relative h-[30px] w-[30px] shrink-0 overflow-hidden rounded-lg border"
                  style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  {item.image?.publicUrl ? (
                    <img src={item.image.publicUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5">
                      <ShoppingBag className="h-4 w-4 text-white/20" />
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
                  <p className="text-xs font-mono font-semibold" style={{ color: '#7bf1d6' }}>
                    {item.price ? `$${item.price.toLocaleString()}` : '—'}
                  </p>
                  <p className="text-xs" style={{ color: item.status === 'CONFIRMADO' ? '#34d399' : '#fbbf24' }}>
                    {item.status === 'CONFIRMADO' ? 'Confirmado' : 'En Registro'}
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
