import { useState } from 'react';
import { Skull, Calendar, ChevronDown, ChevronUp, Flag, Package, TrendingUp } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';

interface Props {
  raidAccess?: RaidAccessInfo;
}

export default function RaidCycles({ raidAccess: _raidAccess }: Props) {
  const listQ = trpc.raid.cycles.list.useQuery();

  const allCycles = listQ.data || [];
  const closedCycles = allCycles.filter((c: any) => c.status === 'CLOSED');

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Skull className="h-5 w-5" style={{ color: '#e879f9' }} />
          <h2 className="text-2xl font-bold text-gradient">Historial de Ciclos</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Historial de ciclos cerrados con el resumen consolidado (bosses eliminados, clanes
          participantes y ganancias). El ciclo activo y la gestión abrir/cerrar ahora vive en
          <span style={{ color: '#7bf1d6' }}> Raid Inventario</span>.
        </p>
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

  // El backend al cerrar el ciclo guarda:
  //  - cycle.summary        -> { events, drops, bosses, clans, totalRevenue, totalPotentialValue }
  //  - cycle.totalBosses    -> redundante con summary.bosses (top-level por compat)
  //  - cycle.totalEvents    -> redundante con summary.events
  //  - cycle.totalRevenue   -> redundante con summary.totalRevenue
  //  - cycle.bossesKilled[] -> [{ bossId, bossName, officialImageUrl, kills }]
  //  - cycle.clansParticipated[] -> [{ clanId, clanName, eventsParticipated, revenueShare }]
  //
  // Preferimos summary.* y caemos a los top-level si el ciclo se cerró con una
  // versión vieja que no escribía summary todavía.
  const totalBosses =
    Number(summary.bosses ?? summary.totalBossesKilled ?? cycle.totalBosses ?? 0) || 0;
  const totalEvents =
    Number(summary.events ?? summary.totalEvents ?? cycle.totalEvents ?? 0) || 0;
  const totalDrops = Number(summary.drops ?? summary.totalDrops ?? 0) || 0;
  const totalRevenue = Number(summary.totalRevenue ?? cycle.totalRevenue ?? 0) || 0;
  const totalPotential =
    Number(summary.totalPotentialValue ?? summary.potentialValue ?? 0) || 0;

  const bossesKilled: Array<{ bossName: string; kills: number; officialImageUrl?: string | null }> =
    Array.isArray(cycle.bossesKilled) ? cycle.bossesKilled : [];
  const topBosses = [...bossesKilled]
    .sort((a, b) => (Number(b.kills) || 0) - (Number(a.kills) || 0))
    .slice(0, 5);

  const clansSummary: Array<{
    clanId: number;
    clanName?: string;
    name?: string;
    eventsParticipated: number;
    revenueShare: number;
  }> = Array.isArray(cycle.clansParticipated) ? cycle.clansParticipated : [];

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
              {totalBosses}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              bosses
            </p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-base font-bold font-mono" style={{ color: '#10b981' }}>
              ${totalRevenue.toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              vendido
            </p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-base font-bold font-mono" style={{ color: '#7bf1d6' }}>
              {totalEvents}
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
          {/* Stats grid — 5 KPIs si hay potencial, 4 si no. */}
          <div className={`grid grid-cols-2 gap-3 ${totalPotential > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
            <StatCard label="Bosses matados" value={totalBosses} color="#e879f9" icon={<Skull className="h-4 w-4" />} />
            <StatCard label="Eventos" value={totalEvents} color="#7bf1d6" icon={<Calendar className="h-4 w-4" />} />
            <StatCard label="Drops totales" value={totalDrops} color="#a78bfa" icon={<Package className="h-4 w-4" />} />
            <StatCard label="Vendido" value={`$${totalRevenue.toLocaleString()}`} color="#10b981" icon={<TrendingUp className="h-4 w-4" />} />
            {totalPotential > 0 && (
              <StatCard
                label="Potencial"
                value={`$${totalPotential.toLocaleString()}`}
                color="#fbbf24"
                icon={<TrendingUp className="h-4 w-4" />}
              />
            )}
          </div>

          {/* Top bosses — ahora desde cycle.bossesKilled con imagen del boss. */}
          {topBosses.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Top bosses eliminados
              </p>
              <div className="space-y-1.5">
                {topBosses.map((b) => (
                  <div
                    key={b.bossName}
                    className="flex items-center justify-between rounded-lg p-2"
                    style={{ background: 'rgba(232,121,249,0.05)', border: '1px solid rgba(232,121,249,0.15)' }}
                  >
                    <div className="flex items-center gap-2">
                      {b.officialImageUrl ? (
                        <img
                          src={b.officialImageUrl}
                          alt={b.bossName}
                          className="h-6 w-6 rounded object-cover"
                          style={{ border: '1px solid rgba(232,121,249,0.25)' }}
                        />
                      ) : (
                        <Skull className="h-4 w-4" style={{ color: '#e879f9' }} />
                      )}
                      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
                        {b.bossName}
                      </span>
                    </div>
                    <span className="text-sm font-mono font-semibold" style={{ color: '#e879f9' }}>
                      ×{b.kills}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clanes participantes — ahora desde cycle.clansParticipated. */}
          {clansSummary.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Clanes participantes ({clansSummary.length})
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {clansSummary.map((cl) => (
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
                        {cl.clanName || cl.name || `Clan #${cl.clanId}`}
                      </span>
                      <span className="text-xs font-mono" style={{ color: '#10b981' }}>
                        ${(Number(cl.revenueShare) || 0).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {cl.eventsParticipated} evento{cl.eventsParticipated === 1 ? '' : 's'}
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
