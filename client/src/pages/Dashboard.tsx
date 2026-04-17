import React from 'react';
import { Boxes, CheckCircle2, CircleDollarSign, TrendingUp, Users } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { KpiCard } from '../components/dashboard/KpiCard';
import { CategoryChart } from '../components/dashboard/CategoryChart';
import { StatusChart } from '../components/dashboard/StatusChart';
import { EarningsChart } from '../components/dashboard/EarningsChart';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { ItemTable } from '../components/inventory/ItemTable';
import { useApp } from '../contexts/AppContext';
import { CATEGORIES, categoryMeta } from '../lib/category-meta';

export default function Dashboard() {
  const { items, auditLogs, characters, salesCycles, cycleNumber } = useApp();

  const totalEarnings = characters.reduce((sum, c) => sum + c.totalEarnings, 0);
  const currentCycleEarnings = characters.reduce((sum, c) => sum + c.currentCycleEarnings, 0);
  const soldItems = items.filter(i => i.status === 'VENDIDO').length;
  const activeItems = items.filter(i => i.status !== 'VENDIDO');
  const itemsWithSalesInCycle = items.filter(i => i.quantitySoldInCycle > 0);
  const cycleRevenue = itemsWithSalesInCycle.reduce((s, i) => s + (i.price ?? 0) * i.quantitySoldInCycle, 0);

  const metrics = {
    totalItems: items.length,
    confirmedItems: items.filter(i => i.status === 'CONFIRMADO').length,
    draftItems: items.filter(i => i.status === 'EN_REGISTRO').length,
    soldItems: soldItems,
    totalValue: items.reduce((s, i) => s + (i.price ?? 0) * (i.quantity - i.quantitySold), 0),
    totalEarnings: totalEarnings,
    byCategory: CATEGORIES.map(cat => {
      const meta = categoryMeta[cat] || { label: cat, color: '#94a3b8' };
      return {
        category: cat,
        label: meta.label,
        count: items.filter(i => i.category === cat).length,
        color: meta.color
      };
    }),
    byStatus: [
      { status: 'CONFIRMADO' as const, count: items.filter(i => i.status === 'CONFIRMADO').length },
      { status: 'EN_REGISTRO' as const, count: items.filter(i => i.status === 'EN_REGISTRO').length },
      { status: 'VENDIDO' as const, count: soldItems },
    ],
  };

  return (
    <AppShell>
      {/* Page title */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Panel de Control</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Vista general del inventario. Monitorea ítems, ciclos de ventas y distribución de ganancias por personaje en tiempo real.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <KpiCard
          title="Total de Ítems"
          value={String(metrics.totalItems)}
          subtitle="Inventario vivo del sistema"
          icon={Boxes}
          accentColor="#7bf1d6"
          trend="Activo"
        />
        <KpiCard
          title="Confirmados"
          value={String(metrics.confirmedItems)}
          subtitle="Listos para venta"
          icon={CheckCircle2}
          accentColor="#34d399"
        />
        <KpiCard
          title="Recaudado (Ciclo)"
          value={`$${(cycleRevenue ?? 0).toLocaleString()}`}
          subtitle={`Ciclo activo #${cycleNumber}`}
          icon={TrendingUp}
          accentColor="#a78bfa"
        />
        <KpiCard
          title="Ganancias Totales"
          value={`$${(totalEarnings ?? 0).toLocaleString()}`}
          subtitle={`${salesCycles.length} ciclo(s) cerrado(s)`}
          icon={CircleDollarSign}
          accentColor="#e879f9"
        />
      </div>

      {/* Ciclo actual banner */}
      <div className="card-glass rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-4"
        style={{ border: '1px solid rgba(123,241,214,0.15)', background: 'rgba(123,241,214,0.04)' }}>
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full animate-pulse" style={{ background: '#7bf1d6' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Ciclo Activo #{cycleNumber}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {itemsWithSalesInCycle.length} ítem(s) con ventas · ${(cycleRevenue ?? 0).toLocaleString()} recaudados
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 ml-auto">
          <div className="rounded-xl px-3 py-1.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-sm font-bold font-mono" style={{ color: '#7bf1d6' }}>{activeItems.length}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>ítems activos</p>
          </div>
          <div className="rounded-xl px-3 py-1.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-sm font-bold font-mono" style={{ color: '#a78bfa' }}>${(currentCycleEarnings ?? 0).toLocaleString()}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>ganancia ciclo</p>
          </div>
          <div className="rounded-xl px-3 py-1.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-sm font-bold font-mono" style={{ color: '#fbbf24' }}>{salesCycles.length}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>ciclos cerrados</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr] mb-6">
        <CategoryChart data={metrics.byCategory} />
        <StatusChart data={metrics.byStatus} />
      </div>

      {/* Earnings + Characters */}
      <div className="grid gap-5 xl:grid-cols-[1fr_380px] mb-6">
        <EarningsChart characters={characters} />
        <div className="card-glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>Personajes Activos</h3>
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Los personajes del sistema comparten el inventario. Las ganancias se distribuyen equitativamente entre los asociados a cada ítem.
          </p>
          <div className="flex items-center gap-3 rounded-xl p-3 mb-3" style={{ background: 'rgba(123,241,214,0.06)', border: '1px solid rgba(123,241,214,0.15)' }}>
            <Users className="h-5 w-5" style={{ color: '#7bf1d6' }} />
            <div>
              <p className="text-2xl font-bold font-mono" style={{ color: '#7bf1d6' }}>{characters.length}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>personajes registrados</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-lg font-bold font-mono" style={{ color: '#7bf1d6' }}>
                {characters.filter(c => c.role === 'SUPER_ADMIN').length}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Super Admin</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-lg font-bold font-mono" style={{ color: '#fbbf24' }}>
                {characters.filter(c => c.role === 'MAPPER').length}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Mapper</p>
            </div>
          </div>

          {/* Top earners ciclo actual */}
          {currentCycleEarnings > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Top ganancias ciclo actual
              </p>
              <div className="space-y-1.5">
                {[...characters]
                  .filter(c => c.currentCycleEarnings > 0)
                  .sort((a, b) => b.currentCycleEarnings - a.currentCycleEarnings)
                  .slice(0, 3)
                  .map(char => (
                    <div key={char.id} className="flex items-center justify-between rounded-lg px-2 py-1.5"
                      style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="flex items-center gap-2">
                        <div className={`flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br ${char.avatar} text-white`}
                          style={{ fontSize: '9px', fontWeight: 'bold' }}>
                          {char.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{char.name}</span>
                      </div>
                      <span className="text-xs font-mono font-semibold" style={{ color: '#7bf1d6' }}>
                        +${(char.currentCycleEarnings ?? 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inventory Items + Activity */}
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>Inventario de Ítems</h3>
          </div>
          <ItemTable items={items} />
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>Actividad Reciente</h3>
          <ActivityFeed logs={auditLogs.slice(0, 8)} />
        </div>
      </div>
    </AppShell>
  );
}
