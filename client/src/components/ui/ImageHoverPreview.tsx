import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Envuelve cualquier contenido (típicamente un thumbnail <img> o un contenedor
 * con background-image) y muestra una versión ampliada flotando al lado del
 * cursor cuando el usuario hace hover. Se usa para permitir ver imágenes de
 * bosses / drops / items sin tener que abrir un modal.
 *
 * Implementación:
 * - Renderiza el preview con `createPortal` en `document.body` para escapar
 *   cualquier `overflow: hidden`, `backdrop-filter` o `position: fixed` padre
 *   que podría clipearlo (mismo problema que tuvimos con el modal de 2FA).
 * - Usa un delay configurable antes de mostrar (evita que aparezca al solo
 *   pasar por encima buscando otra cosa).
 * - Auto-flip: si el preview no entra a la derecha del cursor, lo muestra a
 *   la izquierda. Lo mismo arriba/abajo.
 * - Si la URL devuelve 404 o la imagen falla, no muestra nada (el onError del
 *   <img> del preview dispara el cierre silencioso).
 *
 * No agrega nada al layout del hijo — simplemente le cuelga handlers de mouse.
 */
interface ImageHoverPreviewProps {
  /** URL de la imagen grande a mostrar en el preview. Si es null/undefined el hover es no-op. */
  src?: string | null;
  /** Contenido normal (thumbnail). */
  children: React.ReactNode;
  /** Tamaño del lado mayor del preview (px). */
  size?: number;
  /** Texto opcional que se muestra debajo del preview. */
  caption?: string | null;
  /** Milisegundos antes de mostrar el preview. */
  openDelayMs?: number;
  /** Clase opcional para el span wrapper. Por defecto es display: inline-flex. */
  className?: string;
  /** Si `true`, el wrapper es display: block (ocupa todo el ancho del padre). */
  block?: boolean;
}

export function ImageHoverPreview({
  src,
  children,
  size = 256,
  caption,
  openDelayMs = 180,
  className,
  block = false,
}: ImageHoverPreviewProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const openTimer = useRef<number | null>(null);

  const hasSrc = !!(src && src.trim() && !imageFailed);

  // Limpiar timer al desmontar
  useEffect(() => () => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
  }, []);

  // Si cambia la URL, resetear el flag de error
  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  function handleEnter(e: React.MouseEvent) {
    if (!hasSrc) return;
    setPos({ x: e.clientX, y: e.clientY });
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setVisible(true), openDelayMs);
  }

  function handleMove(e: React.MouseEvent) {
    if (!hasSrc) return;
    setPos({ x: e.clientX, y: e.clientY });
  }

  function handleLeave() {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    setVisible(false);
  }

  // Calcular posición final del preview: offset al lado del cursor, con flip
  // si no entra en la ventana.
  function computeStyle(): React.CSSProperties | null {
    if (!pos) return null;
    const gap = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = size;
    // Altura estimada (imagen cuadrada + posible caption ~24px).
    const h = size + (caption ? 28 : 0);

    let left = pos.x + gap;
    if (left + w > vw - 8) {
      // No entra a la derecha → mostrar a la izquierda del cursor.
      left = pos.x - gap - w;
    }
    if (left < 8) left = 8;

    let top = pos.y + gap;
    if (top + h > vh - 8) {
      top = pos.y - gap - h;
    }
    if (top < 8) top = 8;

    return {
      position: 'fixed',
      left,
      top,
      width: w,
      pointerEvents: 'none',
      zIndex: 9999,
    };
  }

  const wrapperStyle: React.CSSProperties = {
    display: block ? 'block' : 'inline-flex',
  };

  return (
    <>
      <span
        className={className}
        style={wrapperStyle}
        onMouseEnter={handleEnter}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {children}
      </span>

      {visible && hasSrc && pos &&
        createPortal(
          <div style={computeStyle()!}>
            <div
              className="rounded-xl overflow-hidden shadow-2xl"
              style={{
                background: 'rgba(10,14,22,0.95)',
                border: '1px solid rgba(232,121,249,0.35)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                animation: 'imgHoverFadeIn 140ms ease-out',
              }}
            >
              <img
                src={src!}
                alt=""
                onError={() => {
                  setImageFailed(true);
                  setVisible(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  height: size,
                  objectFit: 'contain',
                  background: 'rgba(0,0,0,0.3)',
                }}
              />
              {caption && (
                <div
                  className="px-3 py-1.5 text-xs text-center"
                  style={{
                    color: 'rgba(255,255,255,0.85)',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {caption}
                </div>
              )}
            </div>
            <style>{`
              @keyframes imgHoverFadeIn {
                from { opacity: 0; transform: scale(0.96); }
                to   { opacity: 1; transform: scale(1); }
              }
            `}</style>
          </div>,
          document.body
        )}
    </>
  );
}
