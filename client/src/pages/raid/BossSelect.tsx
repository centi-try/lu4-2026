import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Skull, ChevronDown, Search, Check } from 'lucide-react';
import { ImageHoverPreview } from '@/components/ui/ImageHoverPreview';

export interface BossOption {
  id: number;
  name: string;
  level?: number | null;
  officialImageUrl?: string | null;
}

interface BossSelectProps {
  bosses: BossOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Dropdown custom para elegir un raid boss.
 *
 * Reemplaza el <select> nativo (que en la mayoría de navegadores renderiza las
 * opciones en una capa del SO que no acepta estilos) por un menú totalmente
 * controlado: avatar del boss, nombre, nivel, buscador y estado seleccionado
 * resaltado — matcheando la estética del resto del form (card-glass + bordes
 * magenta).
 */
export function BossSelect({
  bosses,
  value,
  onChange,
  placeholder = '-- seleccioná un boss --',
  disabled = false,
}: BossSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Cierra al clickear afuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Autofocus al buscador al abrir
  useEffect(() => {
    if (open && searchRef.current) {
      const t = setTimeout(() => searchRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Cierra con ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const selected = useMemo(
    () => bosses.find((b) => Number(b.id) === Number(value)) || null,
    [bosses, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bosses;
    return bosses.filter((b) => b.name.toLowerCase().includes(q));
  }, [bosses, query]);

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger — se ve como el input pero con chevron */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((s) => !s)}
        className="w-full rounded-xl px-3 py-2 text-sm flex items-center gap-2 text-left transition-all"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'rgba(232,121,249,0.4)' : 'rgba(255,255,255,0.08)'}`,
          color: selected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          boxShadow: open ? '0 0 0 3px rgba(232,121,249,0.1)' : undefined,
        }}
      >
        {selected ? (
          <>
            {selected.officialImageUrl ? (
              <ImageHoverPreview src={selected.officialImageUrl} caption={selected.name} size={400}>
                <img
                  src={selected.officialImageUrl}
                  alt=""
                  className="h-6 w-6 rounded-md object-cover shrink-0"
                />
              </ImageHoverPreview>
            ) : (
              <div
                className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                style={{
                  background: 'rgba(232,121,249,0.1)',
                  border: '1px solid rgba(232,121,249,0.25)',
                }}
              >
                <Skull className="h-3.5 w-3.5" style={{ color: '#e879f9' }} />
              </div>
            )}
            <span className="truncate flex-1">{selected.name}</span>
            {selected.level != null && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                style={{
                  background: 'rgba(232,121,249,0.1)',
                  border: '1px solid rgba(232,121,249,0.25)',
                  color: '#e879f9',
                }}
              >
                Lv {selected.level}
              </span>
            )}
          </>
        ) : (
          <span className="flex-1 truncate">{placeholder}</span>
        )}
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform"
          style={{
            color: 'rgba(255,255,255,0.5)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Panel desplegable */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-2xl"
          style={{
            background: 'rgba(10,14,22,0.98)',
            border: '1px solid rgba(232,121,249,0.25)',
            backdropFilter: 'blur(20px)',
            zIndex: 50,
          }}
        >
          {/* Buscador */}
          {bosses.length > 5 && (
            <div
              className="flex items-center gap-2 px-3 py-2 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <Search className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar boss..."
                className="bg-transparent text-sm outline-none w-full"
                style={{ color: 'rgba(255,255,255,0.9)' }}
              />
            </div>
          )}

          {/* Lista */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div
                className="px-3 py-4 text-center text-xs"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                Sin resultados
              </div>
            ) : (
              filtered.map((boss) => {
                const isSelected = Number(boss.id) === Number(value);
                return (
                  <button
                    key={boss.id}
                    type="button"
                    onClick={() => {
                      onChange(Number(boss.id));
                      setOpen(false);
                      setQuery('');
                    }}
                    className="w-full px-3 py-2 flex items-center gap-2.5 text-left transition-colors hover:bg-white/5"
                    style={{
                      background: isSelected ? 'rgba(232,121,249,0.1)' : 'transparent',
                      borderLeft: isSelected ? '2px solid #e879f9' : '2px solid transparent',
                    }}
                  >
                    {boss.officialImageUrl ? (
                      <ImageHoverPreview src={boss.officialImageUrl} caption={boss.name} size={400}>
                        <img
                          src={boss.officialImageUrl}
                          alt=""
                          className="h-8 w-8 rounded-md object-cover shrink-0"
                        />
                      </ImageHoverPreview>
                    ) : (
                      <div
                        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: 'rgba(232,121,249,0.1)',
                          border: '1px solid rgba(232,121,249,0.25)',
                        }}
                      >
                        <Skull className="h-4 w-4" style={{ color: '#e879f9' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm truncate"
                        style={{
                          color: isSelected ? '#e879f9' : 'rgba(255,255,255,0.9)',
                          fontWeight: isSelected ? 600 : 500,
                        }}
                      >
                        {boss.name}
                      </p>
                    </div>
                    {boss.level != null && (
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          background: 'rgba(232,121,249,0.1)',
                          border: '1px solid rgba(232,121,249,0.25)',
                          color: '#e879f9',
                        }}
                      >
                        Lv {boss.level}
                      </span>
                    )}
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 shrink-0" style={{ color: '#e879f9' }} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
