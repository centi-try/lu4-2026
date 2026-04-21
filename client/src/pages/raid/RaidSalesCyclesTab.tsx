import { useState } from 'react';
import { toast } from 'sonner';
import {
  Coins,
  Package,
  Swords,
  Flag,
  TrendingUp,
  Users,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  CircleDollarSign,
  Lock,
} from 'lucide-react';
import { trpc } from '../../lib/trpc';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';
import { ImageHoverPreview } from '../../components/ui/ImageHoverPreview';

/**
 * Tab "Ciclos de Venta" dentro de /raids/cycles.
 *
 * El ciclo de ventas es IMPLÍCITO — no se abre, siempre está corriendo.
 * Arranca desde el `closedAt` del último cierre (o desde el primer audit
 * log si nunca se cerró ninguno). El usuario solo aprieta "Cerrar ciclo"
 * cuando quiere congelar el resumen; el siguiente periodo empieza
 * automáticamente desde ese mismo instante.
 *
 * No modifica drops, eventos ni stats de clanes — solo LEE `raidAuditLogs`
 * y `raidDropItems` del rango para armar un resumen persistido al cerrar.
 *
 * Estructura:
 *  - Card "Ciclo actual" (siempre visible):
 *      → Snapshot live (adena, reparto por clan, items pendientes)
 *      → Botón "Cerrar ciclo de ventas" con modal de confirmación (admins)
 *  - Sub-sección "Historial" → acordeón con los cerrados (summary inmutable)
 */
interface Props {
  raidAccess?: RaidAccessInfo;
}

export default function RaidSalesCyclesTab({ raidAccess }: Props) {
  const canAdmin = !!raidAccess?.canAdmin;
  const utils = trpc.useUtils();

  const listQ = trpc.raid.salesCycles.list.useQuery();
  const currentQ = trpc.raid.salesCycles.current.useQuery();
  const previewQ = trpc.raid.salesCycles.livePreview.useQuery(undefined, {
    // Refresco moderado del preview — si se vende algo desde otro lugar,
    // las invalidaciones explícitas ya lo refrescan. Este intervalo es
    // sólo el safety net.
    refetchInterval: 30_000,
  });

  const all = listQ.data || [];
  const current = currentQ.data || null;
  const closed = all.filter((c: any) => c.status === 'CLOSED');
  const preview = previewQ.data;

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const closeCycle = trpc.raid.salesCycles.close.useMutation({
    onSuccess: () => {
      toast.success('Ciclo de ventas cerrado · resumen persistido');
      setConfirmCloseOpen(false);
      utils.raid.salesCycles.list.invalidate();
      utils.raid.salesCycles.current.invalidate();
      utils.raid.salesCycles.livePreview.invalidate();
      utils.raid.auditLogs.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      {/* ---------- Ciclo actual (siempre presente, implícito) ---------- */}
      {current && (
        <CurrentSalesCycleCard
          cycle={current}
          preview={preview}
          canAdmin={canAdmin}
          onCloseClick={() => setConfirmCloseOpen(true)}
        />
      )}

      {/* ---------- Historial ---------- */}
      <div className="card-glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Historial de ciclos de venta
          </h3>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {closed.length} ciclo{closed.length === 1 ? '' : 's'}
          </span>
        </div>

        {closed.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Aún no hay ciclos de venta cerrados en el historial.
          </p>
        ) : (
          <div className="space-y-3">
            {closed.map((c: any) => (
              <ClosedSalesCycleCard key={c.id} cycle={c} />
            ))}
          </div>
        )}
      </div>

      {/* ---------- Modal de confirmación de cierre ---------- */}
      {confirmCloseOpen && current && preview && (
        <CloseConfirmModal
          cycle={current}
          preview={preview}
          isPending={closeCycle.isPending}
          onCancel={() => {
            if (!closeCycle.isPending) setConfirmCloseOpen(false);
          }}
          onConfirm={() => closeCycle.mutate()}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Ciclo actual (con preview live)
// ----------------------------------------------------------------------------

function CurrentSalesCycleCard({
  cycle,
  preview,
  canAdmin,
  onCloseClick,
}: {
  cycle: any;
  preview: any;
  canAdmin: boolean;
  onCloseClick: () => void;
}) {
  const snapshot = preview?.snapshot;
  const totals = snapshot?.totals || {};
  const clans: any[] = snapshot?.clansParticipated || [];
  const unsold: any[] = snapshot?.unsoldItems || [];

  const durationLabel = (() => {
    if (!cycle.startedAt) return '—';
    const startedAt = new Date(cycle.startedAt).getTime();
    const diffMs = Date.now() - startedAt;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Abierto hoy';
    if (days === 1) return 'Hace 1 día';
    return `Hace ${days} días`;
  })();

  return (
    <div
      className="card-glass rounded-2xl p-5 space-y-4"
      style={{ border: '1px solid rgba(16,185,129,0.25)' }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{
                background: 'rgba(16,185,129,0.15)',
                color: '#10b981',
                border: '1px solid rgba(16,185,129,0.3)',
              }}
            >
              En curso
            </span>
            <h3 className="text-base font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
              {cycle.label}
            </h3>
          </div>
          <p className="text-xs mt-1 font-mono" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Acumulando desde{' '}
            {new Date(cycle.startedAt).toLocaleDateString('es-CL', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · {durationLabel}
          </p>
        </div>
        {canAdmin && (
          <button
            type="button"
            onClick={onCloseClick}
            className="btn-primary flex items-center gap-2"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.3))',
              border: '1px solid rgba(239,68,68,0.35)',
              color: '#f87171',
            }}
          >
            <Lock className="h-4 w-4" />
            Cerrar ciclo de ventas
          </button>
        )}
      </div>

      {/* KPIs en vivo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi
          label="Vendido"
          value={`$${(Number(totals.totalRevenue) || 0).toLocaleString()}`}
          color="#10b981"
          icon={<Coins className="h-4 w-4" />}
        />
        <Kpi
          label="Pot. remanente"
          value={`$${(Number(totals.potentialRemaining) || 0).toLocaleString()}`}
          color="#fbbf24"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <Kpi
          label="Ventas"
          value={Number(totals.totalSalesCount) || 0}
          color="#a78bfa"
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <Kpi
          label="Unidades vendidas"
          value={Number(totals.totalUnitsSold) || 0}
          color="#7bf1d6"
          icon={<Package className="h-4 w-4" />}
        />
        <Kpi
          label="Items sin vender"
          value={Number(totals.totalItemsUnsold) || 0}
          color="#e879f9"
          icon={<AlertCircle className="h-4 w-4" />}
        />
      </div>

      {/* Reparto por clan */}
      {clans.length > 0 && (
        <div>
          <p
            className="text-xs uppercase tracking-wider mb-2"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Reparto por clan ({clans.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {clans.map((c) => (
              <div
                key={c.clanId}
                className="rounded-lg p-3"
                style={{
                  background: 'rgba(123,241,214,0.05)',
                  border: '1px solid rgba(123,241,214,0.15)',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm font-semibold flex items-center gap-1.5"
                    style={{ color: 'rgba(255,255,255,0.9)' }}
                  >
                    <Flag className="h-3.5 w-3.5" style={{ color: '#7bf1d6' }} />
                    {c.clanName}
                  </span>
                  <span className="text-xs font-mono font-bold" style={{ color: '#10b981' }}>
                    ${(Number(c.revenueShare) || 0).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {c.salesCount} venta{c.salesCount === 1 ? '' : 's'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items sin vender (preview, top 8) */}
      {unsold.length > 0 && (
        <div>
          <p
            className="text-xs uppercase tracking-wider mb-2"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Items sin vender del ciclo ({unsold.length})
          </p>
          <div className="space-y-1.5">
            {unsold.slice(0, 8).map((it: any) => (
              <div
                key={it.dropItemId}
                className="flex items-center justify-between rounded-lg p-2"
                style={{
                  background: 'rgba(232,121,249,0.05)',
                  border: '1px solid rgba(232,121,249,0.12)',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {it.bossImageUrl ? (
                    <ImageHoverPreview src={it.bossImageUrl} caption={it.itemName} size={400}>
                      <img
                        src={it.bossImageUrl}
                        alt=""
                        className="h-6 w-6 rounded object-cover shrink-0"
                      />
                    </ImageHoverPreview>
                  ) : (
                    <Swords className="h-4 w-4 shrink-0" style={{ color: '#e879f9' }} />
                  )}
                  <span
                    className="text-sm truncate"
                    style={{ color: 'rgba(255,255,255,0.9)' }}
                  >
                    {it.itemName}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-xs font-mono"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    {it.remainingQty}/{it.quantity} u
                  </span>
                  <span className="text-xs font-mono" style={{ color: '#fbbf24' }}>
                    ${(Number(it.potentialRevenue) || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
            {unsold.length > 8 && (
              <p className="text-xs text-center pt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                +{unsold.length - 8} item{unsold.length - 8 === 1 ? '' : 's'} más (se incluirán en el resumen al cerrar)
              </p>
            )}
          </div>
        </div>
      )}

      {clans.length === 0 && unsold.length === 0 && (
        <p
          className="text-xs text-center py-4"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          Sin ventas registradas todavía en este ciclo. A medida que se vendan drops, el
          snapshot se actualiza automáticamente.
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Ciclo cerrado (acordeón)
// ----------------------------------------------------------------------------

function ClosedSalesCycleCard({ cycle }: { cycle: any }) {
  const [open, setOpen] = useState(false);
  const summary = cycle.summary || {};
  const totals = summary.totals || {};
  const clans: any[] = summary.clansParticipated || [];
  const unsold: any[] = summary.unsoldItems || [];
  const raidCyclesClosed: any[] = summary.raidCyclesClosed || [];
  const topBosses: any[] = summary.topBosses || [];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-all"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Lock className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.45)' }} />
          <div className="min-w-0 text-left">
            <p
              className="text-sm font-semibold truncate"
              style={{ color: 'rgba(255,255,255,0.9)' }}
            >
              {cycle.label}
            </p>
            <p className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {cycle.startedAt ? new Date(cycle.startedAt).toLocaleDateString('es-CL') : '—'}
              {' → '}
              {cycle.closedAt ? new Date(cycle.closedAt).toLocaleDateString('es-CL') : '—'}
              {cycle.closedBy && (
                <>
                  {' · '}
                  <span style={{ color: '#a78bfa' }}>por {cycle.closedBy}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 mr-2 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-base font-bold font-mono" style={{ color: '#10b981' }}>
              ${(Number(totals.totalRevenue) || 0).toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              vendido
            </p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-base font-bold font-mono" style={{ color: '#e879f9' }}>
              {Number(totals.totalItemsUnsold) || 0}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              sin vender
            </p>
          </div>
          {open ? (
            <ChevronUp className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.4)' }} />
          ) : (
            <ChevronDown className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.4)' }} />
          )}
        </div>
      </button>

      {open && (
        <div
          className="border-t p-4 space-y-4"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi
              label="Vendido"
              value={`$${(Number(totals.totalRevenue) || 0).toLocaleString()}`}
              color="#10b981"
              icon={<Coins className="h-4 w-4" />}
            />
            <Kpi
              label="Pot. remanente"
              value={`$${(Number(totals.potentialRemaining) || 0).toLocaleString()}`}
              color="#fbbf24"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <Kpi
              label="Ventas"
              value={Number(totals.totalSalesCount) || 0}
              color="#a78bfa"
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <Kpi
              label="Unidades vendidas"
              value={Number(totals.totalUnitsSold) || 0}
              color="#7bf1d6"
              icon={<Package className="h-4 w-4" />}
            />
            <Kpi
              label="Items sin vender"
              value={Number(totals.totalItemsUnsold) || 0}
              color="#e879f9"
              icon={<AlertCircle className="h-4 w-4" />}
            />
          </div>

          {/* Clanes */}
          {clans.length > 0 && (
            <div>
              <p
                className="text-xs uppercase tracking-wider mb-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Reparto por clan ({clans.length})
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {clans.map((c: any) => (
                  <div
                    key={c.clanId}
                    className="rounded-lg p-3"
                    style={{
                      background: 'rgba(123,241,214,0.05)',
                      border: '1px solid rgba(123,241,214,0.15)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm font-semibold flex items-center gap-1.5"
                        style={{ color: 'rgba(255,255,255,0.9)' }}
                      >
                        <Flag className="h-3.5 w-3.5" style={{ color: '#7bf1d6' }} />
                        {c.clanName || `Clan #${c.clanId}`}
                      </span>
                      <span
                        className="text-xs font-mono font-bold"
                        style={{ color: '#10b981' }}
                      >
                        ${(Number(c.revenueShare) || 0).toLocaleString()}
                      </span>
                    </div>
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                    >
                      {c.salesCount} venta{c.salesCount === 1 ? '' : 's'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top bosses vendidos */}
          {topBosses.length > 0 && (
            <div>
              <p
                className="text-xs uppercase tracking-wider mb-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Bosses con drops vendidos
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topBosses.slice(0, 10).map((b: any) => (
                  <span
                    key={b.bossName}
                    className="text-xs font-mono px-2 py-1 rounded"
                    style={{
                      background: 'rgba(232,121,249,0.08)',
                      border: '1px solid rgba(232,121,249,0.2)',
                      color: 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {b.bossName} ×{b.units}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Items sin vender */}
          {unsold.length > 0 && (
            <div>
              <p
                className="text-xs uppercase tracking-wider mb-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Items que quedaron sin vender ({unsold.length})
              </p>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {unsold.map((it: any) => (
                  <div
                    key={it.dropItemId}
                    className="flex items-center justify-between rounded-lg p-2"
                    style={{
                      background: 'rgba(232,121,249,0.05)',
                      border: '1px solid rgba(232,121,249,0.12)',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {it.bossImageUrl ? (
                        <ImageHoverPreview src={it.bossImageUrl} caption={it.itemName} size={400}>
                          <img
                            src={it.bossImageUrl}
                            alt=""
                            className="h-6 w-6 rounded object-cover shrink-0"
                          />
                        </ImageHoverPreview>
                      ) : (
                        <Swords
                          className="h-4 w-4 shrink-0"
                          style={{ color: '#e879f9' }}
                        />
                      )}
                      <div className="min-w-0">
                        <p
                          className="text-sm truncate"
                          style={{ color: 'rgba(255,255,255,0.9)' }}
                        >
                          {it.itemName}
                        </p>
                        {it.bossName && (
                          <p
                            className="text-xs"
                            style={{ color: 'rgba(255,255,255,0.4)' }}
                          >
                            {it.bossName}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className="text-xs font-mono"
                        style={{ color: 'rgba(255,255,255,0.5)' }}
                      >
                        {it.remainingQty}/{it.quantity} u
                      </span>
                      <span
                        className="text-xs font-mono"
                        style={{ color: '#fbbf24' }}
                      >
                        ${(Number(it.potentialRevenue) || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raid cycles cerrados dentro del rango (info contextual) */}
          {raidCyclesClosed.length > 0 && (
            <div>
              <p
                className="text-xs uppercase tracking-wider mb-2"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Raid cycles cerrados en este periodo ({raidCyclesClosed.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {raidCyclesClosed.map((rc: any) => (
                  <span
                    key={rc.cycleId}
                    className="text-xs font-mono px-2 py-1 rounded"
                    style={{
                      background: 'rgba(167,139,250,0.08)',
                      border: '1px solid rgba(167,139,250,0.2)',
                      color: 'rgba(255,255,255,0.8)',
                    }}
                  >
                    {rc.label} · ${(Number(rc.totalRevenue) || 0).toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Modal de confirmación
// ----------------------------------------------------------------------------

function CloseConfirmModal({
  cycle,
  preview,
  isPending,
  onCancel,
  onConfirm,
}: {
  cycle: any;
  preview: any;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const totals = preview?.snapshot?.totals || {};
  const clans: any[] = preview?.snapshot?.clansParticipated || [];
  const unsoldCount = Number(totals.totalItemsUnsold) || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{
          background:
            'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
          border: '1px solid rgba(239,68,68,0.3)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" style={{ color: '#f87171' }} />
              <h3
                className="text-lg font-bold"
                style={{ color: 'rgba(255,255,255,0.95)' }}
              >
                Cerrar ciclo de ventas
              </h3>
            </div>
            <p
              className="text-xs mt-1"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Esta acción persiste el resumen y no se puede deshacer. Los drops sin vender quedan
              disponibles en stock para el próximo ciclo.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
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
          <div
            className="rounded-xl p-3"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Ciclo
            </div>
            <div className="font-semibold" style={{ color: 'rgba(255,255,255,0.95)' }}>
              {cycle.label}
            </div>
            <div className="text-xs mt-1 font-mono" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Abierto el{' '}
              {new Date(cycle.startedAt).toLocaleString('es-CL')}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatLite
              label="Vendido"
              value={`$${(Number(totals.totalRevenue) || 0).toLocaleString()}`}
              color="#10b981"
              icon={<Coins className="h-3.5 w-3.5" />}
            />
            <StatLite
              label="Ventas"
              value={Number(totals.totalSalesCount) || 0}
              color="#a78bfa"
              icon={<ShoppingCart className="h-3.5 w-3.5" />}
            />
            <StatLite
              label="Clanes con reparto"
              value={clans.length}
              color="#7bf1d6"
              icon={<Users className="h-3.5 w-3.5" />}
            />
            <StatLite
              label="Items sin vender"
              value={unsoldCount}
              color="#fbbf24"
              icon={<AlertCircle className="h-3.5 w-3.5" />}
            />
          </div>

          <div
            className="rounded-xl p-3 text-xs"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            Al confirmar, el resumen se persiste como ciclo cerrado (inmutable). Los drops sin
            vender <strong>siguen disponibles</strong> y aparecerán en el próximo ciclo de ventas.
            No se modifican stats de clanes ni raid cycles diarios.
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="btn-ghost"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn-primary flex items-center gap-2"
            style={{
              background:
                'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.35))',
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#f87171',
            }}
          >
            <Lock className="h-4 w-4" />
            {isPending ? 'Cerrando…' : 'Sí, cerrar ciclo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function Kpi({
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
      className="rounded-xl p-3"
      style={{
        background: `linear-gradient(135deg, ${color}14, ${color}08)`,
        border: `1px solid ${color}33`,
      }}
    >
      <div
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1"
        style={{ color }}
      >
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold font-mono" style={{ color: 'rgba(255,255,255,0.95)' }}>
        {value}
      </div>
    </div>
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

// Prevent unused import warnings for CircleDollarSign (kept for future use)
void CircleDollarSign;
