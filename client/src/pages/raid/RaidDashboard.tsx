import React, { useState } from 'react';
import { LayoutDashboard, Skull, Flag, Swords, TrendingUp, Package, Coins, Image as ImageIcon, Shield } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';
import EventsGroupedByCycle from './EventsGroupedByCycle';
import RaidActivityFeed from './RaidActivityFeed';
import RaidDropsTable from './RaidDropsTable';
import RaidClansAndCps from './RaidClansAndCps';
import { ImageHoverPreview } from '../../components/ui/ImageHoverPreview';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface Props {
  raidAccess?: RaidAccessInfo;
}

export default function RaidDashboard({ raidAccess }: Props) {
  const metricsQ = trpc.raid.dashboard.useQuery();
  const eventsQ = trpc.raid.events.list.useQuery({});
  const cyclesListQ = trpc.raid.cycles.list.useQuery();
  const m = metricsQ.data;
  const allEvents = eventsQ.data || [];
  const allCycles = cyclesListQ.data || [];

  // Tab activa del dashboard:
  //  - 'summary' → KPIs + chart + grid (Eventos | Actividad) [default]
  //  - 'drops'   → tabla consolidada de drops disponibles
  //
  // Separamos en tabs para que el listado de eventos, el feed de actividad
  // y la tabla de drops puedan crecer cada uno sin empujar a los otros
  // hacia abajo (pedido explícito del usuario).
  const [tab, setTab] = useState<'summary' | 'drops' | 'clans'>('summary');

  if (metricsQ.isLoading || !m) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div
            className="animate-spin rounded-full h-10 w-10 border-b-2"
            style={{ borderColor: '#e879f9' }}
          ></div>
        </div>
      </AppShell>
    );
  }

  const topBosses = (m.topBosses || []).slice(0, 5).map((b: any) => ({
    name: b.bossName,
    kills: b.kills,
  }));
  const topClans = m.topClans || [];
  const timeline = m.timeline || [];
  const comp = m.comparison;

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <LayoutDashboard className="h-5 w-5" style={{ color: '#e879f9' }} />
          <h2 className="text-2xl font-bold text-gradient">Raid Dashboard</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          KPIs consolidados del módulo Raid. Datos del ciclo actual, comparativa con ciclo
          anterior y tendencias.
        </p>
      </div>

      {/* Tabs: Resumen | Drops disponibles — mismo patrón que /raids/inventory */}
      <div
        className="flex items-center gap-1 mb-5 rounded-xl p-1"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <button
          type="button"
          onClick={() => setTab('summary')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background:
              tab === 'summary'
                ? 'linear-gradient(135deg, rgba(232,121,249,0.25), rgba(167,139,250,0.25))'
                : 'transparent',
            color: tab === 'summary' ? '#e879f9' : 'rgba(255,255,255,0.55)',
            border:
              tab === 'summary' ? '1px solid rgba(232,121,249,0.25)' : '1px solid transparent',
          }}
        >
          <LayoutDashboard className="h-4 w-4" />
          Resumen
        </button>
        <button
          type="button"
          onClick={() => setTab('drops')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background:
              tab === 'drops'
                ? 'linear-gradient(135deg, rgba(167,139,250,0.25), rgba(123,241,214,0.25))'
                : 'transparent',
            color: tab === 'drops' ? '#a78bfa' : 'rgba(255,255,255,0.55)',
            border:
              tab === 'drops' ? '1px solid rgba(167,139,250,0.25)' : '1px solid transparent',
          }}
        >
          <Package className="h-4 w-4" />
          Drops disponibles
        </button>
        <button
          type="button"
          onClick={() => setTab('clans')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background:
              tab === 'clans'
                ? 'linear-gradient(135deg, rgba(123,241,214,0.25), rgba(232,121,249,0.25))'
                : 'transparent',
            color: tab === 'clans' ? '#7bf1d6' : 'rgba(255,255,255,0.55)',
            border:
              tab === 'clans' ? '1px solid rgba(123,241,214,0.25)' : '1px solid transparent',
          }}
        >
          <Shield className="h-4 w-4" />
          Clanes & CPs
        </button>
      </div>

      {tab === 'clans' && (
        <RaidClansAndCps raidAccess={raidAccess} />
      )}

      {tab === 'drops' && (
        <div>
          <RaidDropsTable raidAccess={raidAccess} />
        </div>
      )}

      {tab === 'summary' && (
      <>
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <KpiCard
          label="Bosses eliminados (ciclo)"
          value={m.totalEventsCurrentCycle ?? 0}
          compareValue={comp ? comp.previousBosses : undefined}
          compareLabel={comp ? comp.previousLabel : undefined}
          color="#e879f9"
          icon={<Skull className="h-5 w-5" />}
        />
        <KpiCard
          label="Drops registrados (ciclo)"
          value={m.totalDropsCurrentCycle ?? 0}
          color="#7bf1d6"
          icon={<Package className="h-5 w-5" />}
        />
        <KpiCard
          label="Ingresos del ciclo"
          value={`$${(m.totalRevenue ?? 0).toLocaleString()}`}
          compareValue={
            comp ? `$${(comp.previousRevenue ?? 0).toLocaleString()}` : undefined
          }
          compareLabel={comp ? comp.previousLabel : undefined}
          color="#10b981"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          label="Valor potencial"
          value={`$${(m.totalPotentialValue ?? 0).toLocaleString()}`}
          color="#fbbf24"
          icon={<Coins className="h-5 w-5" />}
        />
      </div>

      {/* Bosses y clanes catalogados */}
      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <MiniStat
          label="Bosses catalogados"
          value={m.totalBossesCatalogued ?? 0}
          color="#a78bfa"
          icon={<Skull className="h-4 w-4" />}
        />
        <MiniStat
          label="Clanes activos"
          value={m.totalClans ?? 0}
          color="#7bf1d6"
          icon={<Flag className="h-4 w-4" />}
        />
        <MiniStat
          label="Ciclos cerrados"
          value={m.closedCyclesCount ?? 0}
          color="#e879f9"
          icon={<Swords className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        {/* Top bosses */}
        <div className="card-glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Skull className="h-5 w-5" style={{ color: '#e879f9' }} />
            <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Top 5 Raid Bosses eliminados
            </h3>
          </div>
          {topBosses.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Sin datos aún.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topBosses}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10,14,22,0.95)',
                    border: '1px solid rgba(232,121,249,0.3)',
                    borderRadius: '0.75rem',
                  }}
                  labelStyle={{ color: '#e879f9' }}
                />
                <Bar dataKey="kills" fill="#e879f9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top clanes */}
        <div className="card-glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Flag className="h-5 w-5" style={{ color: '#7bf1d6' }} />
            <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Top 5 Clanes más activos
            </h3>
          </div>
          {topClans.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Sin datos aún.
            </p>
          ) : (
            <div className="space-y-2">
              {topClans.map((c: any, idx: number) => (
                <div
                  key={c.clanId}
                  className="flex items-center gap-3 rounded-xl p-2.5"
                  style={{
                    background: 'rgba(123,241,214,0.05)',
                    border: '1px solid rgba(123,241,214,0.15)',
                  }}
                >
                  <div
                    className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{
                      background:
                        idx === 0
                          ? 'rgba(251,191,36,0.2)'
                          : idx === 1
                          ? 'rgba(229,231,235,0.1)'
                          : idx === 2
                          ? 'rgba(249,115,22,0.15)'
                          : 'rgba(123,241,214,0.1)',
                      color:
                        idx === 0
                          ? '#fbbf24'
                          : idx === 1
                          ? '#e5e7eb'
                          : idx === 2
                          ? '#f97316'
                          : '#7bf1d6',
                    }}
                  >
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                      {c.clanName}
                    </p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {c.events ?? 0} eventos · $
                      {(c.currentCycleEarnings ?? 0).toLocaleString()} del ciclo
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="card-glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Swords className="h-5 w-5" style={{ color: '#a78bfa' }} />
          <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Timeline — últimos {timeline.length} eventos del ciclo
          </h3>
        </div>
        {timeline.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
            No hay eventos registrados todavía en el ciclo actual.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
            {timeline.map((e: any) => (
              <div
                key={e.eventId}
                className="flex items-center gap-3 rounded-xl p-2.5"
                style={{
                  background: 'rgba(167,139,250,0.05)',
                  border: '1px solid rgba(167,139,250,0.15)',
                }}
              >
                <ImageHoverPreview src={e.bossImageUrl} caption={e.bossName} size={400}>
                  {e.bossImageUrl ? (
                    <img
                      src={e.bossImageUrl}
                      alt={e.bossName}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      style={{ border: '1px solid rgba(167,139,250,0.3)' }}
                    />
                  ) : (
                    <div
                      className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center"
                      style={{
                        background: 'rgba(167,139,250,0.1)',
                        border: '1px solid rgba(167,139,250,0.25)',
                      }}
                    >
                      <Skull className="h-5 w-5" style={{ color: '#a78bfa' }} />
                    </div>
                  )}
                </ImageHoverPreview>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'rgba(255,255,255,0.9)' }}
                  >
                    {e.bossName}
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {new Date(e.createdAt).toLocaleString()} · {e.dropsCount} drops
                  </p>
                </div>
                {e.evidenceImageUrl && (
                  <ImageHoverPreview src={e.evidenceImageUrl} caption="Evidencia" size={320}>
                    <img
                      src={e.evidenceImageUrl}
                      alt="evidencia"
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </ImageHoverPreview>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid 2 columnas (Opción B): "Eventos registrados" y "Actividad
          reciente" quedan lado a lado en pantallas anchas (lg+). En mobile
          siguen siendo una columna (apilados). La tabla de drops va debajo,
          ocupando ancho completo, porque sus 8 columnas necesitan el espacio. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Eventos registrados */}
        <div className="card-glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Swords className="h-5 w-5" style={{ color: '#e879f9' }} />
              <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Eventos registrados
              </h3>
            </div>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {allEvents.length} total
            </span>
          </div>

          {allEvents.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Aún no hay eventos registrados.
            </p>
          ) : (
            <EventsGroupedByCycle
              events={allEvents}
              cycles={allCycles}
              renderEvent={(e: any) => <DashboardEventCard key={e.id} event={e} />}
            />
          )}
        </div>

        {/* Actividad reciente del módulo Raid — igual al "Actividad Reciente"
            del dashboard viejo, pero alimentado por los audit logs del módulo. */}
        <div>
          <RaidActivityFeed />
        </div>
      </div>

      </>
      )}
    </AppShell>
  );
}

function DashboardEventCard({ event }: { event: any }) {
  const [open, setOpen] = useState(false);
  const createdAt = event.createdAt
    ? new Date(event.createdAt).toLocaleString('es-CL')
    : '';
  const drops = event.dropItems || [];

  return (
    <div
      className="rounded-xl"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <ImageHoverPreview src={event.bossImageUrl} caption={event.bossName} size={400}>
          <div
            className="h-12 w-12 shrink-0 rounded-lg flex items-center justify-center overflow-hidden"
            style={{
              background: 'rgba(232,121,249,0.1)',
              border: '1px solid rgba(232,121,249,0.25)',
            }}
          >
            {event.bossImageUrl ? (
              <img src={event.bossImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Skull className="h-6 w-6" style={{ color: '#e879f9' }} />
            )}
          </div>
        </ImageHoverPreview>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            {event.bossName}
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {createdAt} · {event.clans?.length || 0} clan(es) · {drops.length} drop(s)
          </p>
        </div>
        {event.evidenceImageUrl && (
          <a
            href={event.evidenceImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            className="rounded-lg px-2 py-1 text-xs flex items-center gap-1"
            style={{
              background: 'rgba(123,241,214,0.08)',
              color: '#7bf1d6',
              border: '1px solid rgba(123,241,214,0.25)',
            }}
          >
            <ImageIcon className="h-3 w-3" /> evidencia
          </a>
        )}
      </button>

      {open && (
        <div
          className="border-t p-3 space-y-2"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="flex flex-wrap gap-1.5">
            {(event.clans || []).map((c: any) => (
              <span
                key={c.id}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  background: 'rgba(123,241,214,0.08)',
                  color: '#7bf1d6',
                  border: '1px solid rgba(123,241,214,0.25)',
                }}
              >
                <Flag className="h-3 w-3 inline mr-1" />
                {c.name}
              </span>
            ))}
          </div>

          {event.notes && (
            <p className="text-xs italic" style={{ color: 'rgba(255,255,255,0.5)' }}>
              "{event.notes}"
            </p>
          )}

          {event.evidenceImageUrl && (
            <ImageHoverPreview src={event.evidenceImageUrl} caption="Evidencia" size={400} block>
              <img
                src={event.evidenceImageUrl}
                alt="evidencia"
                className="rounded-lg max-h-48"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </ImageHoverPreview>
          )}

          <div className="space-y-1.5">
            {drops.map((d: any) => {
              const available =
                (Number(d.quantity) || 0) - (Number(d.quantitySold) || 0);
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-2 rounded-lg p-2"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <ImageHoverPreview src={d.imageUrl} caption={d.name} size={260}>
                    <div
                      className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center overflow-hidden"
                      style={{ background: 'rgba(255,255,255,0.05)' }}
                    >
                      {d.imageUrl ? (
                        <img src={d.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                      )}
                    </div>
                  </ImageHoverPreview>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                      {d.name}
                    </p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {d.category} · ${Number(d.price).toLocaleString()} · {available}/
                      {d.quantity} disp.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  compareValue,
  compareLabel,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  compareValue?: string | number;
  compareLabel?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card-glass rounded-2xl p-4" style={{ border: `1px solid ${color}25` }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {label}
        </p>
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15`, color }}
        >
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold font-mono" style={{ color }}>
        {value}
      </p>
      {compareValue !== undefined && (
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {compareLabel || 'anterior'}: {compareValue}
        </p>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="card-glass rounded-2xl p-3 flex items-center gap-3"
      style={{ border: `1px solid ${color}20` }}
    >
      <div
        className="h-9 w-9 rounded-lg flex items-center justify-center"
        style={{ background: `${color}15`, color }}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {label}
        </p>
        <p className="text-lg font-bold font-mono" style={{ color }}>
          {value}
        </p>
      </div>
    </div>
  );
}
