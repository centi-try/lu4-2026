import { useState } from 'react';
import { Skull, PlayCircle, StopCircle, Calendar, ChevronDown, ChevronUp, Flag, Package, TrendingUp } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';

interface Props {
  raidAccess?: RaidAccessInfo;
}

export default function RaidCycles({ raidAccess }: Props) {
  const utils = trpc.useUtils();
  const currentQ = trpc.raid.cycles.current.useQuery();
  const listQ = trpc.raid.cycles.list.useQuery();
  const openCycle = trpc.raid.cycles.open.useMutation({
    onSuccess: () => {
      toast.success('Ciclo de raid abierto');
      utils.raid.cycles.current.invalidate();
      utils.raid.cycles.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const closeCycle = trpc.raid.cycles.close.useMutation({
    onSuccess: () => {
      toast.success('Ciclo de raid cerrado');
      utils.raid.cycles.current.invalidate();
      utils.raid.cycles.list.invalidate();
      utils.raid.dashboard.invalidate();
      utils.raid.events.list.invalidate();
      utils.raid.clans.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const canAdmin = !!raidAccess?.canAdmin;
  const current = currentQ.data;
  const allCycles = listQ.data || [];
  const closedCycles = allCycles.filter((c: any) => c.status === 'CLOSED');

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Skull className="h-5 w-5" style={{ color: '#e879f9' }} />
          <h2 className="text-2xl font-bold text-gradient">Ciclos de Raids</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Gestión manual de ciclos de raid. Abrí un ciclo antes de registrar eventos, cerralo al
          final del día/semana para consolidar resultados y mostrar el resumen.
        </p>
      </div>

      {/* Ciclo actual */}
      <div className="card-glass rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" style={{ color: current ? '#10b981' : '#fbbf24' }} />
            <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Ciclo actual
            </h3>
          </div>
          {current && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: 'rgba(16,185,129,0.12)',
                color: '#10b981',
                border: '1px solid rgba(16,185,129,0.25)',
              }}
            >
              {current.type} · ABIERTO
            </span>
          )}
        </div>

        {current ? (
          <div className="space-y-4">
            <div
              className="grid gap-3 sm:grid-cols-4 rounded-xl p-4"
              style={{
                background:
                  'linear-gradient(135deg, rgba(123,241,214,0.08), rgba(232,121,249,0.08))',
                border: '1px solid rgba(123,241,214,0.2)',
              }}
            >
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Nombre
                </p>
                <p className="text-base font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {current.label}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Iniciado
                </p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {new Date(current.startedAt).toLocaleString('es-CL')}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Estado
                </p>
                <p className="text-sm font-semibold" style={{ color: '#10b981' }}>
                  ABIERTO
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  ID
                </p>
                <p className="text-sm font-mono" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  #{current.id}
                </p>
              </div>
            </div>

            {canAdmin && (
              <button
                onClick={() => {
                  if (
                    confirm(
                      `¿Cerrar el ciclo "${current.label}"? Se consolidará el resumen y se reseteará el contador de ganancias.`
                    )
                  ) {
                    closeCycle.mutate({ cycleId: Number(current.id) });
                  }
                }}
                disabled={closeCycle.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(232,121,249,0.25), rgba(239,68,68,0.25))',
                  border: '1px solid rgba(232,121,249,0.3)',
                  color: '#e879f9',
                }}
              >
                <StopCircle className="h-4 w-4" />
                {closeCycle.isPending ? 'Cerrando…' : 'Cerrar Ciclo de Raids'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="rounded-xl p-4 flex items-start gap-3"
              style={{
                background: 'rgba(251,191,36,0.05)',
                border: '1px solid rgba(251,191,36,0.2)',
              }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>
                  No hay ciclo abierto
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Sin ciclo abierto no podés registrar eventos. Abrí uno para comenzar.
                </p>
              </div>
            </div>

            {canAdmin && (
              <button
                onClick={() => openCycle.mutate({ type: 'DIARIO' })}
                disabled={openCycle.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(123,241,214,0.25), rgba(16,185,129,0.25))',
                  border: '1px solid rgba(123,241,214,0.3)',
                  color: '#7bf1d6',
                }}
              >
                <PlayCircle className="h-4 w-4" />
                {openCycle.isPending ? 'Abriendo…' : 'Abrir Ciclo Diario'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Historial de ciclos cerrados */}
      <div className="card-glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Historial de ciclos cerrados
          </h3>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {closedCycles.length} ciclos
          </span>
        </div>

        {closedCycles.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Aún no hay ciclos cerrados en el historial.
          </p>
        ) : (
          <div className="space-y-3">
            {closedCycles.map((c: any) => (
              <ClosedCycleCard key={c.id} cycle={c} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ClosedCycleCard({ cycle }: { cycle: any }) {
  const [open, setOpen] = useState(false);
  const summary = cycle.summary || {};
  const bossesByName: Record<string, number> = summary.bossesByName || {};
  const clansSummary: any[] = summary.clans || [];
  const topBosses = Object.entries(bossesByName)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5);

  const formatDate = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString('es-CL', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(167,139,250,0.15)',
              border: '1px solid rgba(167,139,250,0.3)',
            }}
          >
            <Calendar className="h-5 w-5" style={{ color: '#a78bfa' }} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                {cycle.label}
              </p>
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  background:
                    cycle.type === 'SEMANAL'
                      ? 'rgba(123,241,214,0.12)'
                      : 'rgba(251,191,36,0.12)',
                  color: cycle.type === 'SEMANAL' ? '#7bf1d6' : '#fbbf24',
                  border:
                    cycle.type === 'SEMANAL'
                      ? '1px solid rgba(123,241,214,0.25)'
                      : '1px solid rgba(251,191,36,0.25)',
                }}
              >
                {cycle.type}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Cerrado el {formatDate(cycle.closedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 mr-4">
          <div className="text-right hidden sm:block">
            <p className="text-base font-bold font-mono" style={{ color: '#e879f9' }}>
              {summary.totalBossesKilled ?? 0}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              bosses
            </p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-base font-bold font-mono" style={{ color: '#10b981' }}>
              ${(summary.totalRevenue ?? 0).toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              vendido
            </p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-base font-bold font-mono" style={{ color: '#7bf1d6' }}>
              {summary.totalEvents ?? 0}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              eventos
            </p>
          </div>
          {open ? (
            <ChevronUp className="h-5 w-5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
          ) : (
            <ChevronDown className="h-5 w-5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t p-4 space-y-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Bosses matados" value={summary.totalBossesKilled ?? 0} color="#e879f9" icon={<Skull className="h-4 w-4" />} />
            <StatCard label="Eventos" value={summary.totalEvents ?? 0} color="#7bf1d6" icon={<Calendar className="h-4 w-4" />} />
            <StatCard label="Drops totales" value={summary.totalDrops ?? 0} color="#a78bfa" icon={<Package className="h-4 w-4" />} />
            <StatCard label="Ingresos" value={`$${(summary.totalRevenue ?? 0).toLocaleString()}`} color="#10b981" icon={<TrendingUp className="h-4 w-4" />} />
          </div>

          {/* Top bosses */}
          {topBosses.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Top bosses eliminados
              </p>
              <div className="space-y-1.5">
                {topBosses.map(([name, count]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-lg p-2"
                    style={{ background: 'rgba(232,121,249,0.05)', border: '1px solid rgba(232,121,249,0.15)' }}
                  >
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
                      {name}
                    </span>
                    <span className="text-sm font-mono font-semibold" style={{ color: '#e879f9' }}>
                      ×{count as number}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clanes participantes */}
          {clansSummary.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Clanes participantes ({clansSummary.length})
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {clansSummary.map((cl: any) => (
                  <div
                    key={cl.clanId}
                    className="rounded-lg p-3"
                    style={{
                      background: 'rgba(123,241,214,0.05)',
                      border: '1px solid rgba(123,241,214,0.15)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                        <Flag className="h-3 w-3 inline mr-1" style={{ color: '#7bf1d6' }} />
                        {cl.name}
                      </span>
                      <span className="text-xs font-mono" style={{ color: '#10b981' }}>
                        ${(cl.revenueShare ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {cl.eventsParticipated} eventos
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: `${color}12`, border: `1px solid ${color}25` }}
    >
      <div className="flex items-center gap-1.5 mb-1" style={{ color }}>
        {icon}
        <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {label}
        </p>
      </div>
      <p className="text-xl font-bold font-mono" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
