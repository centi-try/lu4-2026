import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X, Check } from 'lucide-react';
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

  const [reservationToDelete, setReservationToDelete] = useState<{id: number; name: string; isOwner: boolean} | null>(null);

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
      toast.error('Ingresa una cantidad mayor a 0');
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
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[12px] font-black leading-none">R</span>
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
              <span
                className="inline-flex h-3.5 w-3.5 items-center justify-center text-[12px] font-black leading-none"
                style={{ color: '#fbbf24' }}
              >
                R
              </span>
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
                            (tú)
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
                          setReservationToDelete({ id: Number(r.id), name: r.characterName, isOwner });
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

      {/* Delete reservation confirmation modal */}
      {reservationToDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{
              background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
              border: '1px solid rgba(239,68,68,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="h-5 w-5" style={{ color: '#ef4444' }} />
              <h3 className="text-base font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                {reservationToDelete.isOwner ? '¿Cancelar tu reserva?' : `¿Borrar la reserva de ${reservationToDelete.name}?`}
              </h3>
            </div>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setReservationToDelete(null)}
                disabled={deleteMut.isPending}
                className="flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition-all hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  deleteMut.mutate({ id: reservationToDelete.id }, { onSuccess: () => setReservationToDelete(null) });
                }}
                disabled={deleteMut.isPending}
                className="flex-1 rounded-xl px-4 py-2 text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                {deleteMut.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
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
  // Semántica waitlist: la cantidad individual de la reserva está capada por
  // el stock absoluto (no por el "restante menos otras reservas"). Múltiples
  // usuarios pueden reservar aunque la suma supere el stock — el admin
  // preguntará uno por uno y cancelará las que no concreten.
  const maxPerReservation = availableStock;
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
      toast.error('Ingresa una cantidad mayor a 0');
      return;
    }
    if (n > maxPerReservation) {
      toast.error(
        `Este drop tiene ${maxPerReservation} unidad(es) — no puedes reservar más que eso`
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
          rowReservations.length > 0
            ? `Ver reservas (${rowReservations.length}) / agregar la tuya`
            : 'Reservar / ver reservas'
        }
        style={{
          color: '#fbbf24',
          borderColor: 'rgba(251,191,36,0.25)',
          background: 'rgba(251,191,36,0.08)',
        }}
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[13px] font-black leading-none">R</span>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{
              background: 'rgba(10,14,22,0.98)',
              border: '1px solid rgba(251,191,36,0.28)',
            }}
          >
            {/* Header con avatar R circular — idéntico al modal del inventario
                legacy (ver ItemReservationButton). */}
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
                  {drop.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={createMut.isPending}
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
                  <span className="font-semibold" style={{ color: characterName ? '#fbbf24' : '#f87171' }}>
                    {characterName || 'Sin personaje configurado'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>Stock disponible</span>
                  <span className="font-semibold font-mono" style={{ color: availableStock > 0 ? '#fbbf24' : '#f87171' }}>
                    {availableStock} unidad(es)
                  </span>
                </div>
              </div>

              {/* Reservas actuales — historial del drop */}
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
                    style={{ color: rowReservations.length > 0 ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}
                  >
                    {rowReservations.length}
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
                      const isMine = Number(r.userId) === currentUserId;
                      const canDelete = isMine || canAdmin;
                      return (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0"
                          style={{
                            borderColor: 'rgba(255,255,255,0.04)',
                            background: isMine ? 'rgba(251,191,36,0.05)' : 'transparent',
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-xs truncate font-medium"
                              style={{ color: isMine ? '#fbbf24' : 'rgba(255,255,255,0.85)' }}
                            >
                              {r.characterName || r.userName}
                              {isMine && (
                                <span
                                  className="ml-1 text-[10px] font-mono"
                                  style={{ color: 'rgba(251,191,36,0.7)' }}
                                >
                                  (tú)
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
                              className="rounded p-1 shrink-0 transition-colors"
                              style={{
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                color: '#f87171',
                                cursor: deleteMut.isPending ? 'not-allowed' : 'pointer',
                              }}
                              title={isMine ? 'Cancelar mi reserva' : 'Eliminar reserva'}
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
              {characterName && maxPerReservation > 0 && (
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
                    step={1}
                    autoFocus
                    placeholder="0"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    disabled={createMut.isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                    }}
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

              {maxPerReservation <= 0 && (
                <div
                  className="rounded-lg px-3 py-2.5 text-center text-xs"
                  style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.18)',
                    color: '#fca5a5',
                  }}
                >
                  Este drop no tiene stock disponible — no se pueden crear nuevas reservas.
                </div>
              )}

              {!characterName && (
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
                disabled={createMut.isPending}
                className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                Cancelar
              </button>
              {characterName && maxPerReservation > 0 && (
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
      <span className="inline-flex h-2.5 w-2.5 items-center justify-center text-[10px] font-black leading-none">R</span>
      {totalUnits} uds
    </span>
  );
}
