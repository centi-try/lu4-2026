import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Plus, Trash2, X, Check } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';

// ============================================================================
// Celda "Reservas" de la tabla de drops.
//
// - Muestra un contador "N · K uds" (N = reservas, K = suma de unidades).
// - Click abre un popover con la lista de reservas y un pequeño formulario para
//   crear una nueva.
// - Cualquier usuario con acceso raid (raid_user, raid_mapper, raid_admin,
//   super admin) puede reservar. La suma de reservas no puede superar el stock
//   disponible (remaining = quantity - quantitySold).
// - El dueño de una reserva puede borrarla. El admin/super admin puede borrar
//   la de cualquiera.
// - El personaje se toma del perfil del usuario (no editable en el modal).
//
// NOTA: las reservas son señales de intención — no descuentan stock real.
// Solo sirven como lista de espera visible al admin cuando ejecuta la venta.
// ============================================================================

interface Reservation {
  id: number;
  dropItemId: number;
  userId: number;
  userName: string;
  characterName: string;
  quantity: number;
  createdAt: string;
}

interface Props {
  drop: any;
  reservations: Reservation[];
  raidAccess?: RaidAccessInfo;
}

export function DropReservationsCell({ drop, reservations, raidAccess }: Props) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [qtyInput, setQtyInput] = useState('');

  const totalQty = Number(drop.quantity) || 0;
  const soldQty = Number(drop.quantitySold) || 0;
  const availableStock = Math.max(0, totalQty - soldQty);

  // Reservas de este drop (filtradas del set global que la tabla ya fetchea).
  const rowReservations = useMemo(
    () => reservations.filter(r => Number(r.dropItemId) === Number(drop.id)),
    [reservations, drop.id]
  );

  const reservedCount = rowReservations.length;
  const reservedUnits = rowReservations.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const remainingForReservations = Math.max(0, availableStock - reservedUnits);

  const soldOut = availableStock <= 0;
  const currentUserId = Number((user as any)?.id || 0);
  const characterName = String((user as any)?.characterName || user?.name || '').trim();

  // ── mutations ─────────────────────────────────────────────────────────────
  const createMut = trpc.raid.reservations.create.useMutation({
    onSuccess: () => {
      toast.success('Reserva registrada');
      utils.raid.reservations.list.invalidate();
      setQtyInput('');
    },
    onError: (err) => toast.error(err.message || 'No se pudo reservar'),
  });

  const deleteMut = trpc.raid.reservations.delete.useMutation({
    onSuccess: () => {
      toast.success('Reserva eliminada');
      utils.raid.reservations.list.invalidate();
    },
    onError: (err) => toast.error(err.message || 'No se pudo borrar la reserva'),
  });

  // ── cerrar al clickear afuera / ESC ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  const handleCreate = () => {
    const n = parseInt(qtyInput, 10);
    if (!isFinite(n) || n <= 0) {
      toast.error('Ingresá una cantidad mayor a 0');
      return;
    }
    if (n > remainingForReservations) {
      toast.error(
        `Solo quedan ${remainingForReservations} unidad(es) disponibles para reservar`
      );
      return;
    }
    createMut.mutate({ dropItemId: Number(drop.id), quantity: n });
  };

  const canReserve = !!raidAccess?.canAccess && !soldOut && remainingForReservations > 0;
  const canAdmin = !!raidAccess?.canAdmin;

  // ── trigger visual ────────────────────────────────────────────────────────
  const hasReservations = reservedCount > 0;
  const triggerColor = hasReservations ? '#fbbf24' : 'rgba(255,255,255,0.45)';
  const triggerBg = hasReservations ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)';
  const triggerBorder = hasReservations ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)';

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(s => !s)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-all"
        style={{
          background: triggerBg,
          border: `1px solid ${triggerBorder}`,
          color: triggerColor,
          cursor: 'pointer',
        }}
        title={
          hasReservations
            ? `${reservedCount} reserva(s) · ${reservedUnits} unidad(es) pedida(s)`
            : 'Ver / crear reserva'
        }
      >
        <Bookmark className="h-3.5 w-3.5" />
        {hasReservations ? (
          <span className="font-mono">
            {reservedCount} · {reservedUnits} uds
          </span>
        ) : (
          <span>—</span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl shadow-2xl z-40"
          style={{
            width: 320,
            background: 'rgba(10,14,22,0.98)',
            border: '1px solid rgba(251,191,36,0.25)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2">
              <Bookmark className="h-3.5 w-3.5" style={{ color: '#fbbf24' }} />
              <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                Reservas
              </span>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                · {reservedUnits}/{availableStock} uds
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-0.5"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Lista de reservas */}
          <div className="max-h-56 overflow-y-auto">
            {rowReservations.length === 0 ? (
              <div
                className="px-3 py-4 text-center text-xs"
                style={{ color: 'rgba(255,255,255,0.35)' }}
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
                        style={{
                          color: isOwner ? '#fbbf24' : 'rgba(255,255,255,0.85)',
                        }}
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
                        onClick={() => {
                          if (deleteMut.isPending) return;
                          const msg = isOwner
                            ? '¿Cancelar tu reserva?'
                            : `¿Borrar la reserva de ${r.characterName}?`;
                          if (!confirm(msg)) return;
                          deleteMut.mutate({ id: Number(r.id) });
                        }}
                        disabled={deleteMut.isPending}
                        className="rounded p-1 shrink-0"
                        title={isOwner ? 'Cancelar mi reserva' : 'Borrar reserva'}
                        style={{
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          color: '#f87171',
                          cursor: deleteMut.isPending ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Crear reserva */}
          {canReserve ? (
            <div
              className="px-3 py-3 border-t"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Nueva reserva
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  máx {remainingForReservations}
                </span>
              </div>
              <div className="mb-2">
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Personaje
                </p>
                <p
                  className="text-xs font-medium"
                  style={{ color: characterName ? '#fbbf24' : '#f87171' }}
                >
                  {characterName || 'Sin personaje configurado'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={remainingForReservations}
                  step={1}
                  placeholder="Cantidad"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  disabled={createMut.isPending || !characterName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={createMut.isPending || !characterName || !qtyInput}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
                  style={{
                    background: 'rgba(251,191,36,0.15)',
                    border: '1px solid rgba(251,191,36,0.35)',
                    color: '#fbbf24',
                    cursor:
                      createMut.isPending || !characterName || !qtyInput
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      createMut.isPending || !characterName || !qtyInput ? 0.5 : 1,
                  }}
                >
                  <Check className="h-3 w-3" />
                  Reservar
                </button>
              </div>
            </div>
          ) : soldOut ? (
            <div
              className="px-3 py-3 border-t text-[11px] text-center"
              style={{
                borderColor: 'rgba(255,255,255,0.06)',
                color: 'rgba(248,113,113,0.7)',
              }}
            >
              Drop agotado
            </div>
          ) : remainingForReservations <= 0 ? (
            <div
              className="px-3 py-3 border-t text-[11px] text-center"
              style={{
                borderColor: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.45)',
              }}
            >
              Ya está todo reservado
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Botón compacto que sirve de "acceso directo" desde la columna de Acciones
// de la tabla. Abre un mini-dialog centrado para que raid_user (que no tiene
// otras acciones) tenga un CTA claro.
export function ReservationQuickButton({
  drop,
  reservations,
  raidAccess,
}: Props) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [qtyInput, setQtyInput] = useState('');

  const totalQty = Number(drop.quantity) || 0;
  const soldQty = Number(drop.quantitySold) || 0;
  const availableStock = Math.max(0, totalQty - soldQty);
  const rowReservations = reservations.filter(
    r => Number(r.dropItemId) === Number(drop.id)
  );
  const reservedUnits = rowReservations.reduce(
    (s, r) => s + (Number(r.quantity) || 0),
    0
  );
  const remainingForReservations = Math.max(0, availableStock - reservedUnits);
  const soldOut = availableStock <= 0;
  const characterName = String(
    (user as any)?.characterName || user?.name || ''
  ).trim();
  const canAdmin = !!raidAccess?.canAdmin;
  const currentUserId = Number((user as any)?.id || 0);

  const createMut = trpc.raid.reservations.create.useMutation({
    onSuccess: () => {
      toast.success('Reserva registrada');
      utils.raid.reservations.list.invalidate();
      setQtyInput('');
    },
    onError: (err) => toast.error(err.message || 'No se pudo reservar'),
  });
  const deleteMut = trpc.raid.reservations.delete.useMutation({
    onSuccess: () => {
      toast.success('Reserva cancelada');
      utils.raid.reservations.list.invalidate();
    },
    onError: (err) => toast.error(err.message || 'No se pudo cancelar'),
  });

  if (!raidAccess?.canAccess || soldOut) return null;

  const handleCreate = () => {
    const n = parseInt(qtyInput, 10);
    if (!isFinite(n) || n <= 0) {
      toast.error('Ingresá una cantidad mayor a 0');
      return;
    }
    if (n > remainingForReservations) {
      toast.error(
        `Solo quedan ${remainingForReservations} unidad(es) disponibles para reservar`
      );
      return;
    }
    createMut.mutate({ dropItemId: Number(drop.id), quantity: n });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost p-2"
        title={
          remainingForReservations <= 0
            ? 'Ver reservas (todo el stock ya está reservado)'
            : 'Reservar / ver reservas'
        }
        style={{
          color: '#fbbf24',
          borderColor: 'rgba(251,191,36,0.25)',
          background: 'rgba(251,191,36,0.08)',
        }}
      >
        <Bookmark className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !createMut.isPending) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: 'rgba(10,14,22,0.98)',
              border: '1px solid rgba(251,191,36,0.3)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: 'rgba(251,191,36,0.15)',
                    border: '1px solid rgba(251,191,36,0.35)',
                  }}
                >
                  <Bookmark className="h-5 w-5" style={{ color: '#fbbf24' }} />
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    Reservar
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {drop.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={createMut.isPending}
                className="rounded-lg p-2"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="mb-4 rounded-xl p-3"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center justify-between mb-2 text-xs">
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Personaje</span>
                <span
                  className="font-medium"
                  style={{ color: characterName ? '#fbbf24' : '#f87171' }}
                >
                  {characterName || 'Sin personaje configurado'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Disponible</span>
                <span className="font-mono" style={{ color: '#fbbf24' }}>
                  {remainingForReservations} unidad(es)
                </span>
              </div>
            </div>

            {/* Historial de reservas del drop — siempre visible (hueco cuando
                 está vacío para dar contexto al usuario). Admin puede borrar
                 cualquiera; dueño solo la propia. Marcamos la del usuario
                 actual con un chip "(vos)" dorado. */}
            <div className="mb-4">
              <div
                className="flex items-center justify-between mb-2 text-xs uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                <span>Reservas actuales</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {rowReservations.length} · {reservedUnits} uds
                </span>
              </div>
              <div
                className="rounded-xl max-h-48 overflow-y-auto"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {rowReservations.length === 0 ? (
                  <p
                    className="text-xs italic p-3 text-center"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    Nadie reservó todavía. Sé el primero.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {rowReservations.map((r) => {
                      const isMine = Number(r.userId) === currentUserId;
                      const canDelete = isMine || canAdmin;
                      return (
                        <li
                          key={r.id}
                          className="flex items-center gap-2 px-3 py-2"
                          style={{
                            background: isMine ? 'rgba(251,191,36,0.06)' : 'transparent',
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-xs font-medium truncate"
                              style={{ color: 'rgba(255,255,255,0.85)' }}
                            >
                              {r.characterName || r.userName}
                              {isMine && (
                                <span
                                  className="ml-1.5 text-[10px] font-normal"
                                  style={{ color: '#fbbf24' }}
                                >
                                  (vos)
                                </span>
                              )}
                            </p>
                            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                              {r.userName} · {new Date(r.createdAt).toLocaleString('es-AR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <span
                            className="text-xs font-mono rounded-md px-2 py-0.5"
                            style={{
                              background: 'rgba(251,191,36,0.12)',
                              color: '#fbbf24',
                              border: '1px solid rgba(251,191,36,0.25)',
                            }}
                          >
                            ×{r.quantity}
                          </span>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => deleteMut.mutate({ id: Number(r.id) })}
                              disabled={deleteMut.isPending}
                              title={isMine ? 'Cancelar mi reserva' : 'Borrar reserva (admin)'}
                              className="rounded-md p-1"
                              style={{
                                color: '#f87171',
                                background: 'rgba(248,113,113,0.08)',
                                border: '1px solid rgba(248,113,113,0.25)',
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label
                className="block mb-2 text-xs uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                Nueva reserva — cantidad
              </label>
              <input
                type="number"
                min={1}
                max={remainingForReservations}
                step={1}
                autoFocus
                placeholder="0"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                disabled={createMut.isPending || !characterName || remainingForReservations <= 0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.9)',
                }}
              />
              {remainingForReservations <= 0 && (
                <p className="mt-2 text-xs" style={{ color: '#f87171' }}>
                  El stock ya está completamente reservado. Esperá a que alguien
                  cancele o a que el admin venda.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={createMut.isPending}
                className="btn-ghost text-xs px-3 py-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={createMut.isPending || !characterName || !qtyInput}
                className="text-xs font-semibold rounded-lg px-4 py-2 flex items-center gap-1.5"
                style={{
                  background: 'rgba(251,191,36,0.15)',
                  border: '1px solid rgba(251,191,36,0.4)',
                  color: '#fbbf24',
                  cursor:
                    createMut.isPending || !characterName || !qtyInput
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    createMut.isPending || !characterName || !qtyInput ? 0.5 : 1,
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Confirmar reserva
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Pill compacta que se muestra al lado del nombre del ítem cuando el drop
// tiene reservas vivas. Indicador no-interactivo; las acciones viven en el
// botón Reservar de la columna de Acciones.
// ───────────────────────────────────────────────────────────────────────────
export function ReservationsPill({
  drop,
  reservations,
}: {
  drop: any;
  reservations: Reservation[];
}) {
  const rowReservations = reservations.filter(
    r => Number(r.dropItemId) === Number(drop.id)
  );
  if (rowReservations.length === 0) return null;
  const totalUnits = rowReservations.reduce(
    (s, r) => s + (Number(r.quantity) || 0),
    0
  );
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none align-middle"
      title={`${rowReservations.length} reserva(s) · ${totalUnits} unidad(es)`}
      style={{
        background: 'rgba(251,191,36,0.12)',
        border: '1px solid rgba(251,191,36,0.35)',
        color: '#fbbf24',
      }}
    >
      <Bookmark className="h-2.5 w-2.5" />
      {totalUnits} uds
    </span>
  );
}
