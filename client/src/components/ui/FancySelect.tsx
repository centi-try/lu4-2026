import React, { useEffect, useMemo, useRef, useState, useCallback, ReactNode } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// FancySelect — dropdown custom reutilizable que reemplaza <select> nativos.
//
// Basado en el diseño de BossSelect (`/raids/inventory` → selector de raid
// boss). El <select> nativo en la mayoría de navegadores dibuja sus <option>
// en una capa del SO que ignora los estilos de la app, por eso el look queda
// inconsistente con el resto del formulario. Este componente renderiza todo
// en DOM: botón trigger con icono/emoji + label y panel desplegable con
// buscador, resaltado del seleccionado y navegación por teclado.
//
// API intencional: props `value`/`onChange`/`placeholder`/`options` — mismo
// contrato conceptual que un <select>, para que el reemplazo sea mecánico
// y no cambie la lógica de las páginas.
// ---------------------------------------------------------------------------

export type FancyAccent = 'turquoise' | 'magenta' | 'amber' | 'neutral';

export interface FancyOption<V extends string | number = string> {
  value: V;
  label: string;
  // Cualquiera de estos tres se muestra como prefijo. Preferencia: imageUrl →
  // icon → emoji. Si no hay nada, se deja vacío.
  imageUrl?: string | null;
  icon?: ReactNode;
  emoji?: string;
  // Tag pequeño opcional a la derecha (ej: "Lv 85", "Raid Admin").
  badge?: string;
  disabled?: boolean;
  // Descripción secundaria (línea chica debajo del label).
  description?: string;
}

interface FancySelectProps<V extends string | number = string> {
  options: FancyOption<V>[];
  value: V | null | undefined;
  onChange: (value: V) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Color de acento — define borde focus/seleccionado. */
  accent?: FancyAccent;
  /** Tamaño del trigger. */
  size?: 'sm' | 'md' | 'lg';
  /** className extra sobre el trigger. */
  className?: string;
  /** Forzar buscador. Por default se muestra si hay > 8 opciones. */
  searchable?: boolean;
  /** Placeholder del buscador. */
  searchPlaceholder?: string;
  /** Texto cuando no hay resultados. */
  emptyText?: string;
  /** Permitir desmarcar (click en la opción seleccionada la deselecciona). Si true, el componente puede emitir un valor "vacío". */
  clearable?: boolean;
  /** Ancho del panel. 'trigger' = mismo que trigger (default), 'auto' = auto según contenido. */
  panelWidth?: 'trigger' | 'auto';
  /** Alinear panel a la derecha cuando panelWidth='auto'. */
  panelAlign?: 'left' | 'right';
  /** Tooltip del trigger. */
  title?: string;
  /** Para forms — se envía value en un <input hidden> (no se usa por ahora). */
  name?: string;
}

const ACCENTS: Record<FancyAccent, { color: string; border: string; bg: string; shadow: string }> = {
  turquoise: {
    color: '#22d3ee',
    border: 'rgba(34,211,238,0.4)',
    bg: 'rgba(34,211,238,0.1)',
    shadow: '0 0 0 3px rgba(34,211,238,0.1)',
  },
  magenta: {
    color: '#e879f9',
    border: 'rgba(232,121,249,0.4)',
    bg: 'rgba(232,121,249,0.1)',
    shadow: '0 0 0 3px rgba(232,121,249,0.1)',
  },
  amber: {
    color: '#fbbf24',
    border: 'rgba(251,191,36,0.4)',
    bg: 'rgba(251,191,36,0.12)',
    shadow: '0 0 0 3px rgba(251,191,36,0.1)',
  },
  neutral: {
    color: 'rgba(255,255,255,0.85)',
    border: 'rgba(255,255,255,0.2)',
    bg: 'rgba(255,255,255,0.05)',
    shadow: '0 0 0 3px rgba(255,255,255,0.05)',
  },
};

const SIZES = {
  sm: { height: 32, px: 10, py: 4, fontSize: 12, iconSize: 16 },
  md: { height: 36, px: 12, py: 6, fontSize: 13, iconSize: 18 },
  lg: { height: 44, px: 14, py: 8, fontSize: 14, iconSize: 20 },
} as const;

export function FancySelect<V extends string | number = string>({
  options,
  value,
  onChange,
  placeholder = '-- Seleccionar --',
  disabled = false,
  accent = 'neutral',
  size = 'md',
  className,
  searchable,
  searchPlaceholder = 'Buscar...',
  emptyText = 'Sin resultados',
  clearable = false,
  panelWidth = 'trigger',
  panelAlign = 'left',
  title,
}: FancySelectProps<V>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const accentStyle = ACCENTS[accent];
  const sz = SIZES[size];
  const effectiveSearch = searchable ?? options.length > 8;

  // Cerrar al click fuera.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setActiveIdx(-1);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Autofocus buscador al abrir (si está habilitado).
  useEffect(() => {
    if (open && effectiveSearch && searchRef.current) {
      const t = setTimeout(() => searchRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open, effectiveSearch]);

  // ESC cierra.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
        setActiveIdx(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.description || ''}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  // Reset active index cuando cambia la lista filtrada.
  useEffect(() => {
    setActiveIdx(filtered.length > 0 ? 0 : -1);
  }, [filtered.length]);

  const commit = useCallback(
    (opt: FancyOption<V>) => {
      if (opt.disabled) return;
      if (clearable && opt.value === value) {
        onChange('' as V);
      } else {
        onChange(opt.value);
      }
      setOpen(false);
      setQuery('');
      setActiveIdx(-1);
    },
    [clearable, onChange, value]
  );

  const handleTriggerKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((idx) => (idx + 1) % Math.max(filtered.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((idx) => (idx - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[activeIdx];
      if (opt) commit(opt);
    }
  };

  const renderPrefix = (opt: FancyOption<V> | null, iconSz: number) => {
    if (!opt) return null;
    if (opt.imageUrl) {
      return (
        <img
          src={opt.imageUrl}
          alt=""
          className="rounded-md object-cover shrink-0"
          style={{ height: iconSz, width: iconSz }}
        />
      );
    }
    if (opt.icon) {
      return (
        <span
          className="shrink-0 inline-flex items-center justify-center"
          style={{ width: iconSz, height: iconSz, color: accentStyle.color }}
        >
          {opt.icon}
        </span>
      );
    }
    if (opt.emoji) {
      return (
        <span
          className="shrink-0 inline-flex items-center justify-center"
          style={{ width: iconSz, height: iconSz, fontSize: Math.round(iconSz * 0.85), lineHeight: 1 }}
        >
          {opt.emoji}
        </span>
      );
    }
    return null;
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => !disabled && setOpen((s) => !s)}
        onKeyDown={handleTriggerKey}
        className={`w-full rounded-xl text-left transition-all flex items-center gap-2 ${className || ''}`}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? accentStyle.border : 'rgba(255,255,255,0.08)'}`,
          color: selected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          boxShadow: open ? accentStyle.shadow : undefined,
          height: sz.height,
          paddingLeft: sz.px,
          paddingRight: sz.px,
          fontSize: sz.fontSize,
          outline: 'none',
        }}
      >
        {renderPrefix(selected, Math.round(sz.iconSize))}
        <span className="truncate flex-1">
          {selected ? selected.label : placeholder}
        </span>
        {selected?.badge && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
            style={{
              background: accentStyle.bg,
              border: `1px solid ${accentStyle.border}`,
              color: accentStyle.color,
            }}
          >
            {selected.badge}
          </span>
        )}
        <ChevronDown
          className="shrink-0 transition-transform"
          style={{
            width: 16,
            height: 16,
            color: 'rgba(255,255,255,0.5)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute top-full mt-1 rounded-xl overflow-hidden shadow-2xl"
          style={{
            background: 'rgba(10,14,22,0.98)',
            border: `1px solid ${accentStyle.border}`,
            backdropFilter: 'blur(20px)',
            zIndex: 60,
            left: panelAlign === 'left' ? 0 : undefined,
            right: panelAlign === 'right' ? 0 : undefined,
            width: panelWidth === 'trigger' ? '100%' : 'max-content',
            minWidth: panelWidth === 'auto' ? '100%' : undefined,
            maxWidth: 'min(420px, 90vw)',
          }}
        >
          {effectiveSearch && (
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
                onKeyDown={handleTriggerKey}
                placeholder={searchPlaceholder}
                className="bg-transparent text-sm outline-none w-full"
                style={{ color: 'rgba(255,255,255,0.9)' }}
              />
            </div>
          )}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <div
                className="px-3 py-4 text-center text-xs"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {emptyText}
              </div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isActive = idx === activeIdx;
                const prefix = renderPrefix(opt, 20);
                return (
                  <button
                    key={`${opt.value}`}
                    type="button"
                    disabled={opt.disabled}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={(e) => {
                      e.preventDefault();
                      commit(opt);
                    }}
                    className="w-full flex items-center gap-2.5 text-left transition-colors"
                    style={{
                      padding: '8px 12px',
                      background: isSelected
                        ? accentStyle.bg
                        : isActive
                        ? 'rgba(255,255,255,0.05)'
                        : 'transparent',
                      borderLeft: isSelected
                        ? `2px solid ${accentStyle.color}`
                        : '2px solid transparent',
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      opacity: opt.disabled ? 0.4 : 1,
                    }}
                  >
                    {prefix}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm truncate"
                        style={{
                          color: isSelected ? accentStyle.color : 'rgba(255,255,255,0.9)',
                          fontWeight: isSelected ? 600 : 500,
                        }}
                      >
                        {opt.label}
                      </p>
                      {opt.description && (
                        <p
                          className="text-[10px] truncate"
                          style={{ color: 'rgba(255,255,255,0.45)' }}
                        >
                          {opt.description}
                        </p>
                      )}
                    </div>
                    {opt.badge && (
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          background: accentStyle.bg,
                          border: `1px solid ${accentStyle.border}`,
                          color: accentStyle.color,
                        }}
                      >
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && (
                      <Check
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: accentStyle.color }}
                      />
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
