import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, TrendingUp, Package, Users, ChevronDown, ChevronUp, Clock, CheckCircle, AlertTriangle, PlayCircle, StopCircle, Check, X, Coins, Lock as LockIcon, ShoppingCart, User as UserIcon, DollarSign } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useApp } from '../contexts/AppContext';
import { trpc } from '../lib/trpc';
import type { SalesCycle } from '../lib/types';
import { toast } from 'sonner';

function CycleCard({ cycle, defaultOpen = false, canPay = false }: { cycle: SalesCycle; defaultOpen?: boolean; canPay?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Filas de usuario desplegadas (desglose de ítems). Clave = "c|i:characterId"
  // para permitir expandir por separado el mismo usuario en cada grupo.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const utils = trpc.useUtils();
  const markPaid = trpc.salesCycles.markCharacterPaid.useMutation({
    onSuccess: () => {
      utils.salesCycles.list.invalidate();
      // Refrescar Actividad Reciente del dashboard + /history para que
      // el nuevo log aparezca inmediatamente sin recargar la página.
      utils.auditLogs.list.invalidate();
    },
  });
  const markAll = trpc.salesCycles.markAllPaid.useMutation({
    onSuccess: () => {
      utils.salesCycles.list.invalidate();
      utils.auditLogs.list.invalidate();
    },
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const characterEarnings = Array.isArray(cycle.characterEarnings) ? cycle.characterEarnings : [];
  const soldItems = Array.isArray(cycle.soldItems) ? cycle.soldItems : [];
  const unsoldItemIds = Array.isArray(cycle.unsoldItemIds) ? cycle.unsoldItemIds : [];

  // Clan fund data
  const clanFundAmount = Number((cycle as any).clanFundAmount) || 0;
  const clanFundPaidOut = Boolean((cycle as any).clanFundPaidOut);
  const clanTaxPercent = Number((cycle as any).clanTaxPercent) || 0;

  const markClanPaid = trpc.clanFund.markCyclePaid.useMutation({
    onSuccess: () => {
      utils.salesCycles.list.invalidate();
      utils.auditLogs.list.invalidate();
      utils.clanFund.getSummary.invalidate();
      utils.clanFund.listTransactions.invalidate();
    },
  });

  const toggleClanPaid = () => {
    if (!canPay) return;
    markClanPaid.mutate(
      { cycleId: String(cycle.id), paidOut: !clanFundPaidOut },
      {
        onSuccess: () =>
          toast.success(clanFundPaidOut ? 'Pago del clan desmarcado' : 'Pago del clan registrado'),
        onError: err => toast.error(err.message || 'No se pudo actualizar'),
      }
    );
  };

  // Separación SOLO visual (🤝 Cooperativo | 👤 Individual). No cambia montos:
  // cada personaje puede figurar en ambos grupos según el desglose de su ganancia.
  // Compat: ciclos viejos sin desglose caen todos en "cooperativo" (ver server).
  const coopEarnings = characterEarnings
    .filter(ce => (Number(ce.coopEarnings) || 0) > 0)
    .map(ce => ({ ...ce, amount: Number(ce.coopEarnings) || 0 }))
    .sort((a, b) => b.amount - a.amount);
  const indivEarnings = characterEarnings
    .filter(ce => (Number(ce.indivEarnings) || 0) > 0)
    .map(ce => ({ ...ce, amount: Number(ce.indivEarnings) || 0 }))
    .sort((a, b) => b.amount - a.amount);
  const coopItems = soldItems.filter(si => si.isCooperative);
  const indivItems = soldItems.filter(si => !si.isCooperative);

  // El "PAGADO por persona" (R1) aplica al pozo cooperativo, que es lo que el
  // admin reparte. Las ventas individuales las gestiona cada quien.
  const paidCount = coopEarnings.filter(ce => ce.paidOut).length;
  const allPaid = coopEarnings.length > 0 && paidCount === coopEarnings.length;

  const togglePaid = (ce: typeof characterEarnings[number]) => {
    if (!canPay) return;
    setBusyId(ce.characterId);
    markPaid.mutate(
      { cycleId: String(cycle.id), characterId: String(ce.characterId), paidOut: !ce.paidOut },
      {
        onSettled: () => setBusyId(null),
        onSuccess: () =>
          toast.success(
            ce.paidOut
              ? `Pago desmarcado a ${ce.characterName}`
              : `Pago registrado a ${ce.characterName}`
          ),
        onError: err => toast.error(err.message || 'No se pudo actualizar el pago'),
      }
    );
  };

  const markAllPaid = () => {
    markAll.mutate(
      { cycleId: String(cycle.id) },
      {
        onSuccess: () => {
          toast.success('Todos los personajes marcados como pagados');
          setConfirmAll(false);
        },
        onError: err => toast.error(err.message || 'No se pudo marcar a todos'),
      }
    );
  };

  // Fila de ganancia por personaje. `amount` es el monto del grupo (coop o
  // individual). `showPay` controla si aparece el botón Pagar (solo cooperativo,
  // que es el pozo que el admin reparte). idx es el ranking dentro del grupo.
  const renderEarningRow = (
    ce: typeof characterEarnings[number] & { amount: number },
    idx: number,
    showPay: boolean,
  ) => {
    const paid = Boolean(ce.paidOut);
    // Desglose: ítems del grupo (coop=showPay) que le sumaron adena a este
    // usuario. El monto por ítem es el reparto REAL guardado, por lo que la
    // suma cuadra EXACTA con ce.amount (total del usuario en el grupo).
    const groupItems = showPay ? coopItems : indivItems;
    const breakdown = groupItems
      .map(si => ({ si, amt: Number(si.earningsByCharacter?.[String(ce.characterId)]) || 0 }))
      .filter(x => x.amt > 0)
      .sort((a, b) => b.amt - a.amt);
    const rowKey = `${showPay ? 'c' : 'i'}:${ce.characterId}`;
    const isExpanded = expandedRows.has(rowKey);
    const canExpand = breakdown.length > 0;
    const toggleExpand = () => {
      if (!canExpand) return;
      setExpandedRows(prev => {
        const next = new Set(prev);
        if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
        return next;
      });
    };
    return (
      <div key={ce.characterId}>
        <div
          className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors"
          style={{
            background: paid && showPay ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${paid && showPay ? 'rgba(16,185,129,0.28)' : 'rgba(255,255,255,0.05)'}`,
            borderBottomLeftRadius: isExpanded ? 0 : undefined,
            borderBottomRightRadius: isExpanded ? 0 : undefined,
          }}
          title={paid && ce.paidAt ? `Pagado ${new Date(ce.paidAt).toLocaleString('es-CL')}${ce.paidBy ? ` por ${ce.paidBy}` : ''}` : undefined}
        >
          <button
            type="button"
            onClick={toggleExpand}
            disabled={!canExpand}
            className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:cursor-default"
            title={canExpand ? (isExpanded ? 'Ocultar ítems' : 'Ver ítems que sumaron esta adena') : undefined}
          >
            {canExpand ? (
              isExpanded
                ? <ChevronUp className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
                : <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="text-xs font-mono w-5 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>#{idx + 1}</span>
            <span className="text-sm font-medium truncate" style={{ color: paid && showPay ? '#10b981' : 'rgba(255,255,255,0.85)' }}>{ce.characterName}</span>
            {paid && showPay && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: '#10b981' }} />}
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-bold font-mono" style={{ color: paid && showPay ? '#10b981' : '#a78bfa' }}>
              +${(ce.amount ?? 0).toLocaleString()}
            </span>
            {canPay && showPay && (
              <button
                onClick={() => togglePaid(ce)}
                disabled={busyId === ce.characterId}
                className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 whitespace-nowrap"
                style={{
                  background: paid ? 'rgba(16,185,129,0.15)' : 'rgba(167,139,250,0.12)',
                  color: paid ? '#10b981' : '#a78bfa',
                  border: `1px solid ${paid ? 'rgba(16,185,129,0.35)' : 'rgba(167,139,250,0.3)'}`,
                }}
                title={paid ? 'Desmarcar pago' : 'Marcar como pagado'}
              >
                {paid ? '✓ Pagado' : 'Pagar'}
              </button>
            )}
          </div>
        </div>
        {isExpanded && (
          <div
            className="rounded-b-xl px-3 py-2 space-y-1"
            style={{ background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            {breakdown.map(({ si, amt }) => (
              <div key={si.itemId} className="flex items-center justify-between pl-6 pr-1">
                <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {si.itemName}
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}> · {si.quantitySold} ud.</span>
                </span>
                <span className="text-xs font-mono font-semibold shrink-0" style={{ color: '#a78bfa' }}>
                  +${amt.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSoldItem = (si: typeof soldItems[number]) => (
    <div key={si.itemId} className="flex items-center justify-between rounded-xl px-3 py-2"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{si.itemName}</p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {si.quantitySold} ud. × ${(si.price ?? 0).toLocaleString()}
          {si.associatedCharacterIds.length > 0 && ` · ${si.associatedCharacterIds.length} personajes`}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold font-mono" style={{ color: '#7bf1d6' }}>
          ${(si.totalRevenue ?? 0).toLocaleString()}
        </p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ${(si.earningsPerCharacter ?? 0).toLocaleString()} c/u
        </p>
      </div>
    </div>
  );

  // Encabezado de grupo (Cooperativo / Individual) con subtotal.
  const groupHeader = (label: string, emoji: string, color: string, count: number, subtotal: number) => (
    <div className="flex items-center justify-between mb-2 mt-1">
      <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color }}>
        <span>{emoji}</span> {label}
        <span className="rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>{count}</span>
      </span>
      <span className="text-xs font-bold font-mono" style={{ color }}>${subtotal.toLocaleString()}</span>
    </div>
  );

  const coopEarningsTotal = coopEarnings.reduce((s, ce) => s + ce.amount, 0);
  const indivEarningsTotal = indivEarnings.reduce((s, ce) => s + ce.amount, 0);
  const coopItemsRevenue = coopItems.reduce((s, si) => s + (Number(si.totalRevenue) || 0), 0);
  const indivItemsRevenue = indivItems.reduce((s, si) => s + (Number(si.totalRevenue) || 0), 0);

  return (
    <div className="card-glass rounded-2xl overflow-hidden">
      {/* Header del ciclo */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)' }}>
            <Calendar className="h-6 w-6" style={{ color: '#a78bfa' }} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>{cycle.label}</h3>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  background: cycle.type === 'SEMANAL' ? 'rgba(123,241,214,0.12)' : 'rgba(251,191,36,0.12)',
                  color: cycle.type === 'SEMANAL' ? '#7bf1d6' : '#fbbf24',
                  border: `1px solid ${cycle.type === 'SEMANAL' ? 'rgba(123,241,214,0.25)' : 'rgba(251,191,36,0.25)'}`,
                }}>
                {cycle.type === 'SEMANAL' ? '📅 Semanal' : '📆 Diario'}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Cerrado el {formatDate(cycle.closedAt)} por {cycle.closedBy}
            </p>
          </div>
        </div>

        {/* Stats rápidos */}
        <div className="flex items-center gap-6 mr-4">
          <div className="text-right hidden sm:block">
            <p className="text-lg font-bold font-mono" style={{ color: '#a78bfa' }}>
              ${(cycle.totalRevenue ?? 0).toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Total recaudado</p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-base font-bold font-mono" style={{ color: '#10b981' }}>
              ${(cycle.totalProfit ?? 0).toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Ganancia generada</p>
          </div>
            <div className="text-right hidden md:block">
            <p className="text-base font-bold font-mono" style={{ color: '#7bf1d6' }}>
              {soldItems.length}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Ítems vendidos</p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-base font-bold font-mono" style={{ color: '#fbbf24' }}>
              {characterEarnings.length}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Personajes</p>
          </div>
          {open ? <ChevronUp className="h-5 w-5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} /> : <ChevronDown className="h-5 w-5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />}
        </div>
      </button>

      {/* Detalle expandible */}
      {open && (
        <div className="border-t px-5 pb-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {/* Resumen en cards */}
          <div className="grid grid-cols-2 gap-3 mt-4 sm:grid-cols-4">
            <div className="rounded-xl p-3" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Total recaudado</p>
              <p className="text-xl font-bold font-mono" style={{ color: '#a78bfa' }}>${(cycle.totalRevenue ?? 0).toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Ganancia generada</p>
              <p className="text-xl font-bold font-mono" style={{ color: '#10b981' }}>${(cycle.totalProfit ?? 0).toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(123,241,214,0.08)', border: '1px solid rgba(123,241,214,0.15)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Ítems vendidos</p>
              <p className="text-xl font-bold font-mono" style={{ color: '#7bf1d6' }}>{soldItems.length}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Personajes con ganancia</p>
              <p className="text-xl font-bold font-mono" style={{ color: '#fbbf24' }}>{characterEarnings.length}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Ítems acumulados</p>
              <p className="text-xl font-bold font-mono" style={{ color: '#f87171' }}>{unsoldItemIds.length}</p>
            </div>
            {clanFundAmount > 0 && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Adena Clan ({clanTaxPercent}%)</p>
                <p className="text-xl font-bold font-mono" style={{ color: '#fbbf24' }}>${clanFundAmount.toLocaleString()}</p>
              </div>
            )}
          </div>

          <div className="grid gap-5 mt-5 lg:grid-cols-2">
            {/* Ganancias por personaje */}
            <div>
              <div className="flex items-center justify-between mb-3 gap-2">
                <h4 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  <Users className="h-4 w-4" style={{ color: '#fbbf24' }} />
                  Ganancias por personaje
                  {coopEarnings.length > 0 && (
                    <span
                      className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: allPaid ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.12)',
                        color: allPaid ? '#10b981' : '#fbbf24',
                        border: `1px solid ${allPaid ? 'rgba(16,185,129,0.3)' : 'rgba(251,191,36,0.25)'}`,
                      }}
                    >
                      Pagados {paidCount}/{coopEarnings.length}
                    </span>
                  )}
                </h4>
                {canPay && coopEarnings.length > 0 && !allPaid && (
                  <button
                    onClick={() => setConfirmAll(true)}
                    disabled={markAll.isPending}
                    className="rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60"
                    style={{
                      background: 'rgba(16,185,129,0.12)',
                      color: '#10b981',
                      border: '1px solid rgba(16,185,129,0.3)',
                    }}
                    title="Marcar a todos como pagados"
                  >
                    <Coins className="inline h-3 w-3 mr-1" />
                    Marcar todos
                  </button>
                )}
              </div>
              {characterEarnings.length === 0 ? (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Sin ganancias registradas en este ciclo</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {coopEarnings.length > 0 && (
                    <div>
                      {groupHeader('Cooperativo', '🤝', '#7bf1d6', coopEarnings.length, coopEarningsTotal)}
                      <div className="space-y-2">
                        {coopEarnings.map((ce, idx) => renderEarningRow(ce, idx, true))}
                      </div>
                    </div>
                  )}
                  {indivEarnings.length > 0 && (
                    <div>
                      {groupHeader('Individual', '👤', '#8bb7fa', indivEarnings.length, indivEarningsTotal)}
                      <div className="space-y-2">
                        {indivEarnings.map((ce, idx) => renderEarningRow(ce, idx, false))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Fondo del Clan — misma visualización que personajes */}
              {clanFundAmount > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    🏰 Fondo del Clan
                  </h4>
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors"
                    style={{
                      background: clanFundPaidOut ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${clanFundPaidOut ? 'rgba(16,185,129,0.28)' : 'rgba(255,255,255,0.05)'}`,
                    }}
                    title={clanFundPaidOut && (cycle as any).clanFundPaidAt
                      ? `Pagado ${new Date((cycle as any).clanFundPaidAt).toLocaleString('es-CL')}${(cycle as any).clanFundPaidBy ? ` por ${(cycle as any).clanFundPaidBy}` : ''}`
                      : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span style={{ color: '#fbbf24' }}>🏰</span>
                      <p className="text-sm font-medium truncate" style={{ color: clanFundPaidOut ? '#10b981' : 'rgba(255,255,255,0.85)' }}>
                        Clan ({clanTaxPercent}%)
                      </p>
                      {clanFundPaidOut && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: '#10b981' }} />}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold font-mono" style={{ color: clanFundPaidOut ? '#10b981' : '#a78bfa' }}>
                        +${clanFundAmount.toLocaleString()}
                      </span>
                      {canPay && (
                        <button
                          onClick={toggleClanPaid}
                          disabled={markClanPaid.isPending}
                          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 whitespace-nowrap"
                          style={{
                            background: clanFundPaidOut ? 'rgba(16,185,129,0.15)' : 'rgba(167,139,250,0.12)',
                            color: clanFundPaidOut ? '#10b981' : '#a78bfa',
                            border: `1px solid ${clanFundPaidOut ? 'rgba(16,185,129,0.35)' : 'rgba(167,139,250,0.3)'}`,
                          }}
                          title={clanFundPaidOut ? 'Desmarcar pago' : 'Marcar como pagado'}
                        >
                          {clanFundPaidOut ? '✓ Pagado' : 'Pagar'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ítems vendidos en el ciclo */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                <Package className="h-4 w-4" style={{ color: '#7bf1d6' }} />
                Ítems vendidos en este ciclo
              </h4>
              {soldItems.length === 0 ? (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Sin ventas en este ciclo</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {coopItems.length > 0 && (
                    <div>
                      {groupHeader('Cooperativo', '🤝', '#7bf1d6', coopItems.length, coopItemsRevenue)}
                      <div className="space-y-2">
                        {coopItems.map(renderSoldItem)}
                      </div>
                    </div>
                  )}
                  {indivItems.length > 0 && (
                    <div>
                      {groupHeader('Individual', '👤', '#8bb7fa', indivItems.length, indivItemsRevenue)}
                      <div className="space-y-2">
                        {indivItems.map(renderSoldItem)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Modal confirmar marcar todos pagados */}
          {confirmAll && createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            >
              <div
                className="w-full max-w-md rounded-2xl p-6"
                style={{ background: 'rgba(10,14,22,0.98)', border: '1px solid rgba(16,185,129,0.25)' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
                    >
                      <Coins className="h-5 w-5" style={{ color: '#10b981' }} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Marcar todos pagados</h3>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{cycle.label}</p>
                    </div>
                  </div>
                  <button onClick={() => setConfirmAll(false)} className="btn-ghost p-2">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Vas a marcar como <strong style={{ color: '#10b981' }}>pagados</strong> a los {characterEarnings.length - paidCount} personaje(s) restantes de este ciclo.
                </p>
                <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Esta acción queda registrada en el historial. Puedes desmarcar individualmente después si quieres.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmAll(false)}
                    className="rounded-lg px-4 py-2 text-sm font-medium"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={markAllPaid}
                    disabled={markAll.isPending}
                    className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    style={{ background: 'rgba(16,185,129,0.18)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)' }}
                  >
                    {markAll.isPending ? 'Marcando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Ítems no vendidos */}
          {unsoldItemIds.length > 0 && (
            <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#f87171' }}>
                <AlertTriangle className="h-3.5 w-3.5" />
                {unsoldItemIds.length} ítem(s) no vendidos — acumulados al siguiente ciclo
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SalesCyclesPage() {
  const { salesCycles, currentUser, closeCycle, currentCycleStartedAt, cycleNumber, items, characters } = useApp();
  const [closeType, setCloseType] = useState<'DIARIO' | 'SEMANAL'>('SEMANAL');
  const [showConfirm, setShowConfirm] = useState(false);

  const isAdmin = currentUser.role === 'SUPER_ADMIN';

  const activeItems = items.filter(i => i.status !== 'VENDIDO');
  const soldInCycle = items.filter(i => i.quantitySoldInCycle > 0);
  const totalCycleRevenue = soldInCycle.reduce((s, i) => s + (i.price ?? 0) * i.quantitySoldInCycle, 0);
  const unsoldRemainingCount = activeItems.filter(i => (i.quantity - i.quantitySold) > 0).length;

  // Preview del cierre — lista de personajes con ganancias del ciclo actual.
  const preview = useMemo(() => {
    const chars = characters
      .filter(c => (c.currentCycleEarnings || 0) > 0)
      .map(c => ({
        id: c.id,
        name: c.name,
        earnings: Number(c.currentCycleEarnings) || 0,
      }))
      .sort((a, b) => b.earnings - a.earnings);
    const totalPayout = chars.reduce((s, c) => s + c.earnings, 0);
    return { chars, totalPayout };
  }, [characters]);

  const handleCloseCycle = () => {
    closeCycle(closeType);
    toast.success(`Ciclo cerrado correctamente. Se inicia el ciclo #${cycleNumber + 1}.`);
    setShowConfirm(false);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Duración del ciclo (inicio → ahora) en formato compacto.
  const formatDuration = (iso: string | null) => {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 0) return '—';
    const mins = Math.floor(ms / 60000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // Bruto estimado (precio actual, = lo que se persiste como totalRevenue del
  // ciclo), neto real a repartir (suma de currentCycleEarnings) y su diferencia
  // (retención del clan + ajustes por precios editados). Neto + diferencia =
  // bruto por construcción, así el desglose siempre cuadra visualmente.
  const netoTotal = preview.totalPayout;
  const brutoEstimado = totalCycleRevenue;
  const diferencia = brutoEstimado - netoTotal;

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Ciclos de Ventas</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          El administrador puede cerrar el ciclo actual (diario o semanal) para registrar las ganancias de cada personaje.
          Los ítems no vendidos se acumulan automáticamente al siguiente ciclo.
        </p>
      </div>

      {/* Ciclo actual */}
      <div className="card-glass rounded-2xl p-5 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2.5 w-2.5 rounded-full animate-pulse" style={{ background: '#7bf1d6' }} />
              <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Ciclo Activo #{cycleNumber}
              </h3>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Iniciado: {formatDate(currentCycleStartedAt)}
            </p>
          </div>

          {/* Stats del ciclo actual */}
          <div className="flex flex-wrap gap-4">
            <div className="rounded-xl px-4 py-2 text-center" style={{ background: 'rgba(123,241,214,0.08)', border: '1px solid rgba(123,241,214,0.15)' }}>
              <p className="text-lg font-bold font-mono" style={{ color: '#7bf1d6' }}>{activeItems.length}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Ítems activos</p>
            </div>
            <div className="rounded-xl px-4 py-2 text-center" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
              <p className="text-lg font-bold font-mono" style={{ color: '#a78bfa' }}>{soldInCycle.length}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Con ventas</p>
            </div>
            <div className="rounded-xl px-4 py-2 text-center" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-lg font-bold font-mono" style={{ color: '#fbbf24' }}>${(totalCycleRevenue ?? 0).toLocaleString()}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Recaudado</p>
            </div>
          </div>
        </div>

        {/* Acción de cierre (solo admin) */}
        {isAdmin && (
          <div className="mt-5 border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Cerrar ciclo como:
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCloseType('DIARIO')}
                  className="rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: closeType === 'DIARIO' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${closeType === 'DIARIO' ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: closeType === 'DIARIO' ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                  }}>
                  📆 Diario
                </button>
                <button
                  onClick={() => setCloseType('SEMANAL')}
                  className="rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: closeType === 'SEMANAL' ? 'rgba(123,241,214,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${closeType === 'SEMANAL' ? 'rgba(123,241,214,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: closeType === 'SEMANAL' ? '#7bf1d6' : 'rgba(255,255,255,0.5)',
                  }}>
                  📅 Semanal
                </button>
              </div>
              <button
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ml-auto"
                style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>
                <StopCircle className="h-4 w-4" />
                Cerrar ciclo actual
              </button>
            </div>
          </div>
        )}

        {/* Modal de confirmación — preview del cierre con stats + personajes a pagar */}
        {showConfirm && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          >
            <div
              className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
              style={{
                background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
                border: '1px solid rgba(248,113,113,0.3)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <LockIcon className="h-5 w-5" style={{ color: '#f87171' }} />
                    <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                      Cerrar ciclo #{cycleNumber}
                    </h3>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        background: closeType === 'SEMANAL' ? 'rgba(123,241,214,0.12)' : 'rgba(251,191,36,0.12)',
                        color: closeType === 'SEMANAL' ? '#7bf1d6' : '#fbbf24',
                        border: `1px solid ${closeType === 'SEMANAL' ? 'rgba(123,241,214,0.25)' : 'rgba(251,191,36,0.25)'}`,
                      }}>
                      {closeType === 'SEMANAL' ? '📅 Semanal' : '📆 Diario'}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Esta acción persiste el resumen y no se puede deshacer. Los ítems sin vender se acumulan al próximo ciclo.
                  </p>
                </div>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="rounded-lg p-1.5 transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.6)',
                  }}
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                {/* Hero: neto total a repartir — el número que más importa */}
                <div className="rounded-xl p-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.05))', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>Neto a repartir a personajes</div>
                  <div className="text-3xl font-bold font-mono" style={{ color: '#10b981' }}>${netoTotal.toLocaleString()}</div>
                  <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    entre {preview.chars.length} personaje(s)
                  </div>
                </div>

                {/* Info del ciclo */}
                <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Ciclo</div>
                      <div className="font-semibold" style={{ color: 'rgba(255,255,255,0.95)' }}>Ciclo #{cycleNumber}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Duración</div>
                      <div className="font-semibold font-mono" style={{ color: '#7bf1d6' }}>{formatDuration(currentCycleStartedAt)}</div>
                    </div>
                  </div>
                  <div className="text-xs mt-2 font-mono" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Iniciado el {formatDate(currentCycleStartedAt)}
                  </div>
                </div>

                {/* Desglose Bruto → Retención → Neto (siempre cuadra) */}
                <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>Bruto recaudado (precio actual)</span>
                    <span className="text-xs font-mono font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>${brutoEstimado.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>− Retención del clan / ajustes</span>
                    <span className="text-xs font-mono font-semibold" style={{ color: '#fbbf24' }}>${diferencia.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-1.5" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>= Neto a personajes</span>
                    <span className="text-xs font-mono font-bold" style={{ color: '#10b981' }}>${netoTotal.toLocaleString()}</span>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2">
                  <StatLite
                    label="Recaudado"
                    value={`$${totalCycleRevenue.toLocaleString()}`}
                    color="#10b981"
                    icon={<Coins className="h-3.5 w-3.5" />}
                  />
                  <StatLite
                    label="Ítems con ventas"
                    value={soldInCycle.length}
                    color="#a78bfa"
                    icon={<ShoppingCart className="h-3.5 w-3.5" />}
                  />
                  <StatLite
                    label="Personajes a cobrar"
                    value={preview.chars.length}
                    color="#7bf1d6"
                    icon={<Users className="h-3.5 w-3.5" />}
                  />
                  <StatLite
                    label="Ítems sin vender"
                    value={unsoldRemainingCount}
                    color="#fbbf24"
                    icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  />
                </div>

                {/* Reparto por personaje */}
                {preview.chars.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Reparto por personaje ({preview.chars.length})
                    </p>
                    <div
                      className="rounded-xl p-2 space-y-1 overflow-y-auto"
                      style={{
                        background: 'rgba(16,185,129,0.05)',
                        border: '1px solid rgba(16,185,129,0.15)',
                        maxHeight: '180px',
                      }}
                    >
                      {preview.chars.map(c => {
                        const pct = netoTotal > 0 ? (c.earnings / netoTotal) * 100 : 0;
                        return (
                          <div key={c.id} className="flex items-center justify-between rounded-lg px-2 py-1.5"
                            style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <span className="text-xs font-medium flex items-center gap-1.5"
                              style={{ color: 'rgba(255,255,255,0.85)' }}>
                              <UserIcon className="h-3 w-3" style={{ color: '#7bf1d6' }} />
                              {c.name}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                {pct.toFixed(1)}%
                              </span>
                              <span className="text-xs font-mono font-bold" style={{ color: '#10b981' }}>
                                ${c.earnings.toLocaleString()}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Total del reparto */}
                    <div className="flex items-center justify-between mt-2 px-2">
                      <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>Total a repartir</span>
                      <span className="text-sm font-mono font-bold" style={{ color: '#10b981' }}>${netoTotal.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {preview.chars.length === 0 && (
                  <div
                    className="rounded-xl p-3 text-xs"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.55)',
                    }}
                  >
                    No hay personajes con ganancias en este ciclo. Igual puedes cerrarlo para empezar uno nuevo.
                  </div>
                )}

                {/* Aviso */}
                <div
                  className="rounded-xl p-3 text-xs"
                  style={{
                    background: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.2)',
                    color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  Al confirmar, el resumen se persiste como <strong>Ciclo #{cycleNumber}</strong> en el historial (inmutable).
                  {unsoldRemainingCount > 0 && (
                    <> Los <strong>{unsoldRemainingCount}</strong> ítem(s) sin vender se acumulan automáticamente al ciclo #{cycleNumber + 1}.</>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCloseCycle}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.35))',
                    border: '1px solid rgba(239,68,68,0.4)',
                    color: '#f87171',
                  }}
                >
                  <LockIcon className="h-4 w-4" />
                  Sí, cerrar ciclo
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {!isAdmin && (
          <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Solo el Administrador del Sistema puede cerrar ciclos de ventas.
            </p>
          </div>
        )}
      </div>

      {/* Historial de ciclos */}
      <div>
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <Clock className="h-4 w-4" />
          Historial de ciclos cerrados
          <span className="rounded-full px-2 py-0.5 text-xs font-mono ml-1"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
            {salesCycles.length}
          </span>
        </h3>

        {salesCycles.length === 0 ? (
          <div className="card-glass rounded-2xl p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl mx-auto mb-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Calendar className="h-8 w-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
            </div>
            <p className="text-base font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Sin ciclos cerrados</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Cuando el administrador cierre el primer ciclo, aparecerá aquí con el resumen completo de ganancias.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {[...salesCycles]
              .sort((a, b) => {
                // Más reciente arriba: priorizamos closedAt y caemos a createdAt/startedAt.
                const ta = new Date((a as any).closedAt || (a as any).createdAt || (a as any).startedAt || 0).getTime();
                const tb = new Date((b as any).closedAt || (b as any).createdAt || (b as any).startedAt || 0).getTime();
                if (tb !== ta) return tb - ta;
                // Fallback determinístico por número/id cuando las fechas empatan.
                const na = Number((a as any).cycleNumber ?? (a as any).number ?? (a as any).id ?? 0);
                const nb = Number((b as any).cycleNumber ?? (b as any).number ?? (b as any).id ?? 0);
                return nb - na;
              })
              .map((cycle, idx) => (
                <CycleCard key={cycle.id} cycle={cycle} defaultOpen={idx === 0} canPay={isAdmin} />
              ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatLite({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-2"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider mb-0.5"
        style={{ color }}
      >
        {icon}
        {label}
      </div>
      <div className="text-sm font-bold font-mono" style={{ color: 'rgba(255,255,255,0.9)' }}>
        {value}
      </div>
    </div>
  );
}
