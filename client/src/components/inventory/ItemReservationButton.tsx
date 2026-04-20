import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2 } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

// ============================================================================
// Botón "R" de reservas para items del inventario legacy.
//
// Mismo patrón visual y de semántica que DropReservationsCell del módulo raid:
// - Cualquier usuario logueado puede reservar (waitlist).
// - La suma total de reservas puede superar el stock: el admin decide a quién
//   vender y cancela las sobrantes.
// - La cantidad individual de una reserva no puede superar el stock disponible.
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

  const triggerColor = reservedCount > 0 ? '#fbbf24' : 'rgba(255,255,255,0.55)';
  const triggerBg = reservedCount > 0 ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.03)';
  const triggerBorder = reservedCount > 0 ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)';

  return (
    <>
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(true); }}
        disabled={disabled}
        className="rounded-lg p-2 transition-all"
        style={{
          background: disabled ? 'rgba(255,255,255,0.02)' : triggerBg,
          border: `1px solid ${disabled ? 'rgba(255,255,255,0.04)' : triggerBorder}`,
          color: disabled ? 'rgba(255,255,255,0.2)' : triggerColor,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        title={
          disabled
            ? 'Ítem sin stock — sin reservas activas'
            : reservedCount > 0
              ? `${reservedCount} reserva(s) activa(s)`
              : 'Reservar ítem'
        }
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[12px] font-black leading-none">R</span>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl"
            style={{
              background: 'rgba(10,14,22,0.98)',
              border: '1px solid rgba(251,191,36,0.3)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between px-5 py-4 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center text-[13px] font-black leading-none"
                    style={{ color: '#fbbf24' }}
                  >
                    R
                  </span>
                  <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.92)' }}>
                    Reservar ítem
                  </h3>
                </div>
                <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {item.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 shrink-0"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              {/* Info bar */}
              <div
                className="rounded-xl px-3 py-2.5 mb-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>Personaje</span>
                  <span className="font-mono" style={{ color: '#fbbf24' }}>{characterName || '—'}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>Stock disponible</span>
                  <span className="font-mono" style={{ color: availableStock > 0 ? '#7bf1d6' : '#f87171' }}>
                    {availableStock} unidad(es)
                  </span>
                </div>
                {reservedCount > 0 && (
                  <div className="flex items-center justify-between text-[11px] mt-1">
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Ya reservado (waitlist)</span>
                    <span className="font-mono" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {reservedCount} reserva{reservedCount === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </div>

              {/* Lista de reservas */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[11px] uppercase tracking-wider font-semibold"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                  >
                    Reservas actuales
                  </span>
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    {reservedCount}
                  </span>
                </div>
                <div
                  className="max-h-48 overflow-y-auto rounded-lg"
                  style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  {rowReservations.length === 0 ? (
                    <div
                      className="px-3 py-5 text-center text-xs"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                      Sin reservas registradas.
                    </div>
                  ) : (
                    rowReservations.map((r) => {
                      const isOwner = Number(r.userId) === currentUserId;
                      const canDelete = isOwner || canAdmin;
                      return (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 px-3 py-2 border-b"
                          style={{
                            borderColor: 'rgba(255,255,255,0.04)',
                            background: isOwner ? 'rgba(251,191,36,0.05)' : 'transparent',
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-xs truncate font-medium"
                              style={{ color: isOwner ? '#fbbf24' : 'rgba(255,255,255,0.85)' }}
                            >
                              {r.characterName}
                              {isOwner && (
                                <span
                                  className="ml-1 text-[10px] font-mono"
                                  style={{ color: 'rgba(251,191,36,0.7)' }}
                                >
                                  (vos)
                                </span>
                              )}
                            </p>
                            <p
                              className="text-[10px]"
                              style={{ color: 'rgba(255,255,255,0.35)' }}
                            >
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
                              background: 'rgba(251,191,36,0.1)',
                              border: '1px solid rgba(251,191,36,0.25)',
                              color: '#fbbf24',
                            }}
                          >
                            ×{r.quantity}
                          </span>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => deleteMut.mutate({ id: Number(r.id) })}
                              disabled={deleteMut.isPending}
                              className="rounded p-1 shrink-0"
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

              {/* Form */}
              {soldOut ? (
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
              ) : !characterName ? (
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
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label
                        className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
                        style={{ color: 'rgba(255,255,255,0.4)' }}
                      >
                        Cantidad (máx {maxPerReservation})
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={maxPerReservation}
                        value={qtyInput}
                        onChange={(e) => setQtyInput(e.target.value)}
                        placeholder="1"
                        className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.9)',
                          caretColor: '#fbbf24',
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={createMut.isPending}
                      className="rounded-lg px-4 py-2 text-xs font-semibold transition-all"
                      style={{
                        background: 'rgba(251,191,36,0.15)',
                        border: '1px solid rgba(251,191,36,0.35)',
                        color: '#fbbf24',
                        cursor: createMut.isPending ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {createMut.isPending ? 'Reservando…' : 'Reservar'}
                    </button>
                  </div>
                  <p
                    className="mt-2 text-[10px] leading-relaxed"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    Máximo {maxPerReservation} por reserva. Puede haber más personas anotadas
                    en la waitlist que stock real — el admin decidirá a quién venderle.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
