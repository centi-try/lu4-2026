import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

// ============================================================================
// Botón "R" de reservas para items del inventario legacy.
//
// Mismo patrón visual y de semántica que la reserva en el módulo raid:
// - Cualquier usuario logueado puede reservar (waitlist).
// - La suma total de reservas puede superar el stock: el admin decide a quién
//   vender y cancela las sobrantes.
// - La cantidad individual no puede superar el stock disponible.
// - El personaje se toma del perfil (characterName del registro).
// - El dueño cancela la propia; MAPPER/SUPER_ADMIN cancelan cualquiera.
// - Modal renderizado con createPortal a document.body para evitar clipping
//   cuando la tabla tiene overflow-hidden / transform en algún ancestor.
// ============================================================================

export interface ItemReservationRecord {
  id: number;
  itemId: number;
  userId: number;
  userName: string;
  characterName: string;
  quantity: number;
  status?: 'active' | 'pre_sold';
  createdAt: string;
}

interface Props {
  item: {
    id: string;
    name: string;
    quantity: number;
    quantitySold: number;
    status?: string;
  };
  reservations: ItemReservationRecord[];
}

export function ItemReservationButton({ item, reservations }: Props) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [qtyInput, setQtyInput] = useState('');

  const totalQty = Number(item.quantity) || 0;
  const soldQty = Number(item.quantitySold) || 0;
  const availableStock = Math.max(0, totalQty - soldQty);
  const soldOut = availableStock <= 0 || String(item.status || '').toUpperCase() === 'VENDIDO';

  const rowReservations = useMemo(
    () => reservations.filter(r => Number(r.itemId) === Number(item.id)),
    [reservations, item.id]
  );

  const reservedCount = rowReservations.length;
  const reservedUnits = rowReservations.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const hasPreSold = rowReservations.some(r => r.status === 'pre_sold');
  const preSoldCount = rowReservations.filter(r => r.status === 'pre_sold').length;

  const currentUserId = Number((user as any)?.id || 0);
  const characterName = String((user as any)?.characterName || user?.name || '').trim();
  const roleLc = String((user as any)?.role || '').toLowerCase();
  const canAdmin = roleLc === 'super_admin' || roleLc === 'mapper';

  // Waitlist: la cantidad individual está capada por el stock absoluto.
  const maxPerReservation = availableStock;

  const createMut = trpc.items.reservations.create.useMutation({
    onSuccess: () => {
      toast.success('Reserva registrada');
      utils.items.reservations.list.invalidate();
      setQtyInput('');
    },
    onError: (err) => toast.error(err.message || 'No se pudo reservar'),
  });

  const deleteMut = trpc.items.reservations.delete.useMutation({
    onSuccess: () => {
      toast.success('Reserva eliminada');
      utils.items.reservations.list.invalidate();
    },
    onError: (err) => toast.error(err.message || 'No se pudo borrar la reserva'),
  });

  useEffect(() => {
    if (!open) return;
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [open]);

  const handleCreate = () => {
    const n = parseInt(qtyInput, 10);
    if (!isFinite(n) || n <= 0) {
      toast.error('Ingresá una cantidad mayor a 0');
      return;
    }
    if (n > maxPerReservation) {
      toast.error(
        `Este ítem solo tiene ${maxPerReservation} unidad(es) disponibles — no podés reservar más que eso.`
      );
      return;
    }
    createMut.mutate({ itemId: Number(item.id), quantity: n });
  };

  // Disabled si sold out Y no hay reservas que mirar/cancelar.
  const disabled = soldOut && reservedCount === 0;
  const hasReservations = reservedCount > 0;

  return (
    <>
      {/* Trigger con mismo estilo que el botón R del módulo raid
          (ReservationQuickButton en DropReservationsCell.tsx). */}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(true); }}
        disabled={disabled}
        className="btn-ghost p-2"
        title={
          disabled
            ? 'Ítem sin stock — sin reservas activas'
            : hasReservations
              ? `Ver reservas (${reservedCount}) / agregar la tuya`
              : 'Reservar / ver reservas'
        }
        style={{
          color: disabled ? 'rgba(255,255,255,0.2)' : hasPreSold ? '#34d399' : '#fbbf24',
          borderColor: disabled ? 'rgba(255,255,255,0.04)' : hasPreSold ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.25)',
          background: disabled ? 'rgba(255,255,255,0.02)' : hasPreSold ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.08)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[13px] font-black leading-none">
          {hasPreSold ? 'V' : 'R'}
        </span>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{
              background: 'rgba(10,14,22,0.98)',
              border: '1px solid rgba(251,191,36,0.28)',
            }}
          >
            {/* Header con avatar R circular */}
            <div
              className="flex items-start gap-3 px-5 py-4 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full shrink-0"
                style={{
                  background: 'rgba(251,191,36,0.15)',
                  border: '1px solid rgba(251,191,36,0.35)',
                  color: '#fbbf24',
                }}
              >
                <span className="text-base font-black leading-none">R</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold leading-tight" style={{ color: 'rgba(255,255,255,0.95)' }}>
                  Reservar
                </h3>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {item.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 shrink-0 transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              {/* Info card */}
              <div
                className="rounded-xl px-4 py-3 mb-4 space-y-1.5"
                style={{
                  background: 'rgba(251,191,36,0.05)',
                  border: '1px solid rgba(251,191,36,0.15)',
                }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>Personaje</span>
                  <span className="font-semibold" style={{ color: '#fbbf24' }}>
                    {characterName || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>Stock disponible</span>
                  <span className="font-semibold font-mono" style={{ color: availableStock > 0 ? '#fbbf24' : '#f87171' }}>
                    {availableStock} unidad(es)
                  </span>
                </div>
              </div>

              {/* Reservas actuales */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[10px] uppercase tracking-[0.1em] font-semibold"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                  >
                    Reservas actuales
                  </span>
                  <span
                    className="text-[11px] font-mono font-semibold"
                    style={{ color: hasReservations ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}
                  >
                    {reservedCount}
                  </span>
                </div>
                <div
                  className="rounded-lg overflow-hidden"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    maxHeight: 180,
                    overflowY: 'auto',
                  }}
                >
                  {rowReservations.length === 0 ? (
                    <div
                      className="px-3 py-5 text-center text-xs italic"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                      Nadie reservó todavía. Sé el primero.
                    </div>
                  ) : (
                    rowReservations.map((r) => {
                      const isOwner = Number(r.userId) === currentUserId;
                      const canDelete = isOwner || canAdmin;
                      const isPreSold = r.status === 'pre_sold';
                      return (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0"
                          style={{
                            borderColor: 'rgba(255,255,255,0.04)',
                            background: isPreSold ? 'rgba(52,211,153,0.06)' : isOwner ? 'rgba(251,191,36,0.05)' : 'transparent',
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-xs truncate font-medium"
                              style={{ color: isPreSold ? '#34d399' : isOwner ? '#fbbf24' : 'rgba(255,255,255,0.85)' }}
                            >
                              {r.characterName}
                              {isPreSold && (
                                <span
                                  className="ml-1 text-[10px] font-semibold"
                                  style={{ color: '#34d399' }}
                                >
                                  (Pre-vendido)
                                </span>
                              )}
                              {isOwner && !isPreSold && (
                                <span
                                  className="ml-1 text-[10px] font-mono"
                                  style={{ color: 'rgba(251,191,36,0.7)' }}
                                >
                                  (vos)
                                </span>
                              )}
                            </p>
                            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                              {r.userName}
                              {r.createdAt && (
                                <>
                                  {' · '}
                                  {new Date(r.createdAt).toLocaleString('es-AR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    day: '2-digit',
                                    month: '2-digit',
                                  })}
                                </>
                              )}
                            </p>
                          </div>
                          <span
                            className="text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              background: isPreSold ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)',
                              border: isPreSold ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(251,191,36,0.25)',
                              color: isPreSold ? '#34d399' : '#fbbf24',
                            }}
                          >
                            ×{r.quantity}
                          </span>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => deleteMut.mutate({ id: Number(r.id) })}
                              disabled={deleteMut.isPending}
                              className="rounded p-1 shrink-0 transition-colors"
                              style={{
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                color: '#f87171',
                                cursor: deleteMut.isPending ? 'not-allowed' : 'pointer',
                              }}
                              title={isOwner ? 'Cancelar mi reserva' : 'Eliminar reserva'}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Nueva reserva */}
              {!soldOut && characterName && (
                <div className="mb-1">
                  <label
                    className="block text-[10px] uppercase tracking-[0.1em] font-semibold mb-2"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                  >
                    Nueva reserva — Cantidad
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={maxPerReservation}
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg px-4 py-2.5 text-base font-mono outline-none transition-colors"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.95)',
                      caretColor: '#fbbf24',
                    }}
                  />
                  <p
                    className="mt-2 text-[10px]"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    Máximo {maxPerReservation} por reserva.
                  </p>
                </div>
              )}

              {soldOut && (
                <div
                  className="rounded-lg px-3 py-2.5 text-center text-xs"
                  style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.18)',
                    color: '#fca5a5',
                  }}
                >
                  Este ítem no tiene stock disponible — no se pueden crear nuevas reservas.
                </div>
              )}

              {!soldOut && !characterName && (
                <div
                  className="rounded-lg px-3 py-2.5 text-center text-xs"
                  style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.18)',
                    color: '#fca5a5',
                  }}
                >
                  Tu perfil no tiene un personaje configurado.
                </div>
              )}
            </div>

            {/* Footer con acciones */}
            <div
              className="flex items-center justify-end gap-2 px-5 py-3 border-t"
              style={{
                borderColor: 'rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.2)',
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                Cancelar
              </button>
              {!soldOut && characterName && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={createMut.isPending || !qtyInput}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all"
                  style={{
                    background: 'rgba(251,191,36,0.18)',
                    border: '1px solid rgba(251,191,36,0.4)',
                    color: '#fbbf24',
                    cursor: createMut.isPending || !qtyInput ? 'not-allowed' : 'pointer',
                    opacity: createMut.isPending || !qtyInput ? 0.6 : 1,
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {createMut.isPending ? 'Confirmando…' : 'Confirmar reserva'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
