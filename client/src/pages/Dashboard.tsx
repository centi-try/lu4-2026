import React, { useState } from 'react';
import { Boxes, CheckCircle2, CircleDollarSign, TrendingUp, Users, Coins, Receipt, Plus, X } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { KpiCard } from '../components/dashboard/KpiCard';
import { CategoryChart } from '../components/dashboard/CategoryChart';
import { StatusChart } from '../components/dashboard/StatusChart';
import { EarningsChart } from '../components/dashboard/EarningsChart';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { ItemTable } from '../components/inventory/ItemTable';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { trpc } from '../lib/trpc';
import { CATEGORIES, categoryMeta } from '../lib/category-meta';
import { toast } from 'sonner';

export default function Dashboard() {
  const { items, auditLogs, characters, salesCycles, cycleNumber } = useApp();
  const { user: authUser } = useAuth();
  const isSuperAdmin = authUser?.role === 'super_admin';

  const { data: clanSummary } = trpc.clanFund.getSummary.useQuery(undefined, { enabled: !!authUser });
  const { data: clanTransactions } = trpc.clanFund.listTransactions.useQuery(undefined, { enabled: !!authUser });
  const utils = trpc.useUtils();
  const addExpenseMutation = trpc.clanFund.addExpense.useMutation({
    onSuccess: () => {
      utils.clanFund.getSummary.invalidate();
      utils.clanFund.listTransactions.invalidate();
      utils.auditLogs.list.invalidate();
      toast.success('Gasto registrado correctamente');
      setShowExpenseForm(false);
      setExpenseAmount('');
      setExpenseDesc('');
      setExpenseEvidence('');
    },
    onError: (err) => toast.error(err.message || 'Error al registrar gasto'),
  });

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseEvidence, setExpenseEvidence] = useState('');

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) { toast.error('Monto inválido'); return; }
    if (!expenseDesc.trim()) { toast.error('Descripción requerida'); return; }
    addExpenseMutation.mutate({
      amount: amt,
      description: expenseDesc.trim(),
      evidenceUrl: expenseEvidence.trim() || undefined,
    });
  };

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

      {/* Fondo del Clan KPIs */}
      {clanSummary && (clanSummary.totalIncome > 0 || clanSummary.totalExpense > 0) && (
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <KpiCard title="Clan: Recaudado" value={`$${(clanSummary.totalIncome ?? 0).toLocaleString()}`}
            subtitle="Total acumulado por retenciones" icon={Coins} accentColor="#fbbf24" />
          <KpiCard title="Clan: Gastado" value={`$${(clanSummary.totalExpense ?? 0).toLocaleString()}`}
            subtitle="Total de gastos registrados" icon={Receipt} accentColor="#f87171" />
          <KpiCard title="Clan: Saldo" value={`$${(clanSummary.balance ?? 0).toLocaleString()}`}
            subtitle="Disponible en el fondo" icon={CircleDollarSign} accentColor="#34d399" />
        </div>
      )}

      {/* Gastos del Clan */}
      {clanTransactions && clanTransactions.length > 0 && (
        <div className="card-glass rounded-2xl p-5 mb-6" style={{ border: '1px solid rgba(251,191,36,0.15)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Coins className="h-5 w-5" style={{ color: '#fbbf24' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>Movimientos del Fondo del Clan</h3>
            </div>
            {isSuperAdmin && (
              <button onClick={() => setShowExpenseForm(!showExpenseForm)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                {showExpenseForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {showExpenseForm ? 'Cancelar' : 'Registrar Gasto'}
              </button>
            )}
          </div>
          {showExpenseForm && isSuperAdmin && (
            <form onSubmit={handleExpenseSubmit} className="mb-4 p-3 rounded-xl space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)}
                  placeholder="Monto (adena)" min="1" className="rounded-lg border bg-transparent px-3 py-2 text-sm font-mono outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
                <input type="text" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)}
                  placeholder="Descripción (en qué se gastó)" className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
              </div>
              <input type="text" value={expenseEvidence} onChange={e => setExpenseEvidence(e.target.value)}
                placeholder="URL evidencia (opcional)" className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
              <button type="submit" disabled={addExpenseMutation.isPending}
                className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ background: '#fbbf24', color: '#000' }}>
                {addExpenseMutation.isPending ? 'Guardando...' : 'Registrar Gasto'}
              </button>
            </form>
          )}
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {[...(clanTransactions as any[])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20).map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs" style={{ color: tx.type === 'income' ? '#10b981' : '#f87171' }}>
                    {tx.type === 'income' ? '▲' : '▼'}
                  </span>
                  <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{tx.description}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono font-semibold" style={{ color: tx.type === 'income' ? '#10b981' : '#f87171' }}>
                    {tx.type === 'income' ? '+' : '-'}${(tx.amount ?? 0).toLocaleString()}
                  </span>
                  {tx.evidenceUrl && (
                    <a href={tx.evidenceUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] underline" style={{ color: '#a78bfa' }}>evidencia</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registrar gasto si no hay transacciones */}
      {isSuperAdmin && (!clanTransactions || clanTransactions.length === 0) && (
        <div className="mb-6">
          <button onClick={() => setShowExpenseForm(!showExpenseForm)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
            {showExpenseForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {showExpenseForm ? 'Cancelar' : 'Registrar Gasto del Clan'}
          </button>
          {showExpenseForm && (
            <form onSubmit={handleExpenseSubmit} className="mt-3 p-3 rounded-xl space-y-3 card-glass" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)}
                  placeholder="Monto (adena)" min="1" className="rounded-lg border bg-transparent px-3 py-2 text-sm font-mono outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
                <input type="text" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)}
                  placeholder="Descripción" className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
              </div>
              <input type="text" value={expenseEvidence} onChange={e => setExpenseEvidence(e.target.value)}
                placeholder="URL evidencia (opcional)" className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
              <button type="submit" disabled={addExpenseMutation.isPending}
                className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ background: '#fbbf24', color: '#000' }}>
                {addExpenseMutation.isPending ? 'Guardando...' : 'Registrar Gasto'}
              </button>
            </form>
          )}
        </div>
      )}

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
