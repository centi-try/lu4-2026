import React from 'react';
import { Flag, Trophy, Swords, TrendingUp, Package, Coins } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';

interface Props {
  raidAccess?: RaidAccessInfo;
}

export default function RaidClans({ raidAccess: _raidAccess }: Props) {
  const statsQ = trpc.raid.clans.stats.useQuery();
  const stats = statsQ.data || [];

  // El backend ya devuelve ordenado por (totalRaidEarnings + currentCycleEarnings)
  // descendente. Respetamos ese orden — no re-ordenamos en el cliente para
  // no perder el desempate del backend.
  const sorted = stats;

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Flag className="h-5 w-5" style={{ color: '#7bf1d6' }} />
          <h2 className="text-2xl font-bold text-gradient">Clanes</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Ranking de clanes por participación en raids, ingresos del ciclo actual y ganancias
          acumuladas históricas.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="card-glass rounded-2xl p-8 text-center">
          <Flag className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(123,241,214,0.3)' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            No hay clanes cargados aún. El Administrador del Sistema o Raid Admin debe crearlos en{' '}
            <span style={{ color: '#e879f9' }}>Config. Raids</span>.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((c: any, idx: number) => {
            const rankColor =
              idx === 0
                ? '#fbbf24'
                : idx === 1
                ? '#e5e7eb'
                : idx === 2
                ? '#f97316'
                : 'rgba(255,255,255,0.4)';
            return (
              <div
                key={c.id}
                className="card-glass rounded-2xl p-5"
                style={{ border: idx < 3 ? `1px solid ${rankColor}30` : undefined }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-12 w-12 shrink-0 rounded-xl flex items-center justify-center"
                      style={{
                        background: 'rgba(123,241,214,0.1)',
                        border: '1px solid rgba(123,241,214,0.25)',
                      }}
                    >
                      <Flag className="h-6 w-6" style={{ color: '#7bf1d6' }} />
                    </div>
                    <div>
                      <p
                        className="text-base font-bold"
                        style={{ color: 'rgba(255,255,255,0.95)' }}
                      >
                        {c.name}
                      </p>
                      {c.tag && (
                        <p className="text-xs" style={{ color: '#7bf1d6' }}>
                          [{c.tag}]
                        </p>
                      )}
                    </div>
                  </div>
                  {idx < 3 && (
                    <div
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        background: `${rankColor}15`,
                        color: rankColor,
                        border: `1px solid ${rankColor}40`,
                      }}
                    >
                      <Trophy className="h-3 w-3" />#{idx + 1}
                    </div>
                  )}
                </div>

                {c.description && (
                  <p
                    className="text-xs mb-3 line-clamp-2"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    {c.description}
                  </p>
                )}

                {/* Resumen "vendido / potencial" en el header.
                    - Vendido (amarillo)   = totalRaidEarnings + currentCycleEarnings
                      (toda la adena que el clan llevó cobrada hasta ahora).
                    - Potencial (gris)      = potentialValue (lo que cobraría
                      si todos los drops asociados al clan se vendieran al
                      precio sticker actual). */}
                <p className="text-xs font-mono mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <span style={{ color: '#fbbf24' }}>
                    ${((Number(c.totalRaidEarnings) || 0) + (Number(c.currentCycleEarnings) || 0)).toLocaleString()}
                  </span>
                  <span> cobrados / ${(Number(c.potentialValue) || 0).toLocaleString()} potencial</span>
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <Metric
                    label="Raids"
                    value={c.eventsParticipated ?? 0}
                    color="#e879f9"
                    icon={<Swords className="h-3.5 w-3.5" />}
                  />
                  <Metric
                    label="Drops"
                    value={c.dropItemsAssociated ?? 0}
                    color="#a78bfa"
                    icon={<Package className="h-3.5 w-3.5" />}
                  />
                  <Metric
                    label="Ciclo actual"
                    value={`$${(Number(c.currentCycleEarnings) || 0).toLocaleString()}`}
                    color="#10b981"
                    icon={<TrendingUp className="h-3.5 w-3.5" />}
                  />
                  <Metric
                    label="Total histórico"
                    value={`$${(Number(c.totalRaidEarnings) || 0).toLocaleString()}`}
                    color="#fbbf24"
                    icon={<Coins className="h-3.5 w-3.5" />}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function Metric({
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
      className="rounded-lg p-2"
      style={{ background: `${color}10`, border: `1px solid ${color}20` }}
    >
      <div className="flex items-center gap-1 mb-0.5" style={{ color }}>
        {icon}
        <span className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {label}
        </span>
      </div>
      <p className="text-sm font-bold font-mono" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
