import React, { useState, useRef } from 'react';
import { Boxes, CheckCircle2, CircleDollarSign, TrendingUp, Users, Coins, Receipt, Plus, X, Upload, Pencil, Trash2 } from 'lucide-react';
import { ImageHoverPreview } from '../components/ui/ImageHoverPreview';
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
  const { items, auditLogs, characters, salesCycles, cycleNumber, effectiveIsSuperAdmin } = useApp();
  const { user: authUser } = useAuth();
  const isSuperAdmin = effectiveIsSuperAdmin;

  const { data: registeredUsers } = trpc.adminUsers.listUsers.useQuery(undefined, { enabled: !!authUser && isSuperAdmin, retry: false });
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
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState('');
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [clanMovTab, setClanMovTab] = useState<'retenciones' | 'gastos'>('retenciones');
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const editEvidenceInputRef = useRef<HTMLInputElement>(null);
  const uploadEvidenceMutation = trpc.clanFund.uploadEvidence.useMutation();

  // Edit/delete state
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editEvidenceFile, setEditEvidenceFile] = useState<File | null>(null);
  const [editEvidencePreview, setEditEvidencePreview] = useState('');

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    danger?: boolean;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  const showConfirm = (opts: { title: string; message: string; onConfirm: () => void; confirmLabel?: string; danger?: boolean }) => {
    setConfirmModal({ open: true, ...opts });
  };

  const editExpenseMutation = trpc.clanFund.editExpense.useMutation({
    onSuccess: () => {
      utils.clanFund.getSummary.invalidate();
      utils.clanFund.listTransactions.invalidate();
      utils.auditLogs.list.invalidate();
      toast.success('Gasto actualizado');
      setEditingTxId(null);
    },
    onError: (err) => toast.error(err.message || 'Error al editar gasto'),
  });

  const deleteExpenseMutation = trpc.clanFund.deleteExpense.useMutation({
    onSuccess: () => {
      utils.clanFund.getSummary.invalidate();
      utils.clanFund.listTransactions.invalidate();
      utils.auditLogs.list.invalidate();
      toast.success('Gasto eliminado');
    },
    onError: (err) => toast.error(err.message || 'Error al eliminar gasto'),
  });

  const startEditing = (tx: any) => {
    setEditingTxId(tx.id);
    setEditAmount(String(tx.amount));
    setEditDesc(tx.description);
    setEditEvidenceFile(null);
    setEditEvidencePreview(tx.evidenceUrl || '');
  };

  const handleEditSubmit = async (txId: number) => {
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) { toast.error('Monto inválido'); return; }
    if (!editDesc.trim()) { toast.error('Descripción requerida'); return; }

    let evidenceUrl: string | undefined;
    if (editEvidenceFile) {
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(editEvidenceFile);
        });
        const base64 = await base64Promise;
        const result = await uploadEvidenceMutation.mutateAsync({
          fileName: editEvidenceFile.name,
          base64Data: base64,
        });
        evidenceUrl = result.url;
      } catch {
        toast.error('Error al subir imagen');
        return;
      }
    } else if (editEvidencePreview && !editEvidencePreview.startsWith('data:')) {
      evidenceUrl = editEvidencePreview;
    }

    editExpenseMutation.mutate({ txId, amount: amt, description: editDesc.trim(), evidenceUrl });
  };

  const handleEditEvidencePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setEditEvidenceFile(file);
          const reader = new FileReader();
          reader.onload = () => setEditEvidencePreview(reader.result as string);
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  };

  const processEvidenceFile = (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Solo se permiten imágenes'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Máximo 5 MB'); return; }
    setEvidenceFile(file);
    const reader = new FileReader();
    reader.onload = () => setEvidencePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleEvidenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processEvidenceFile(file);
  };

  const handleEvidencePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) processEvidenceFile(file);
        return;
      }
    }
  };

  const doExpenseSubmit = async () => {
    const amt = parseFloat(expenseAmount);
    let evidenceUrl: string | undefined;
    if (evidenceFile) {
      setUploadingEvidence(true);
      try {
        const base64 = evidencePreview.split(',')[1];
        const result = await uploadEvidenceMutation.mutateAsync({
          fileName: evidenceFile.name,
          base64Data: base64,
        });
        evidenceUrl = result.url;
      } catch {
        toast.error('Error al subir la imagen de evidencia');
        setUploadingEvidence(false);
        return;
      }
      setUploadingEvidence(false);
    }
    addExpenseMutation.mutate({
      amount: amt,
      description: expenseDesc.trim(),
      evidenceUrl,
    });
    setEvidenceFile(null);
    setEvidencePreview('');
  };

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) { toast.error('Monto inválido'); return; }
    if (!expenseDesc.trim()) { toast.error('Descripción requerida'); return; }
    showConfirm({
      title: 'Registrar gasto',
      message: `¿Registrar gasto de $${amt.toLocaleString()} — "${expenseDesc.trim()}"?`,
      confirmLabel: 'Registrar',
      onConfirm: doExpenseSubmit,
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
      {clanSummary && (clanSummary.totalIncome > 0 || clanSummary.totalExpense > 0 || (clanSummary as any).pendingIncome > 0) && (
        <div className="grid gap-4 sm:grid-cols-4 mb-6">
          <KpiCard title="Clan: Recaudado" value={`$${(clanSummary.totalIncome ?? 0).toLocaleString()}`}
            subtitle="Ciclos pagados" icon={Coins} accentColor="#fbbf24" />
          {(clanSummary as any).pendingIncome > 0 && (
            <KpiCard title="Clan: Pendiente" value={`$${((clanSummary as any).pendingIncome ?? 0).toLocaleString()}`}
              subtitle="Ciclos cerrados sin pagar" icon={Coins} accentColor="#f59e0b" />
          )}
          <KpiCard title="Clan: Gastado" value={`$${(clanSummary.totalExpense ?? 0).toLocaleString()}`}
            subtitle="Total de gastos registrados" icon={Receipt} accentColor="#f87171" />
          <KpiCard title="Clan: Saldo" value={`$${(clanSummary.balance ?? 0).toLocaleString()}`}
            subtitle="Disponible en el fondo" icon={CircleDollarSign} accentColor="#34d399" />
        </div>
      )}

      {/* Movimientos del Fondo del Clan — con tabs */}
      {clanTransactions && clanTransactions.length > 0 && (
        <div className="card-glass rounded-2xl p-5 mb-6" style={{ border: '1px solid rgba(251,191,36,0.15)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Coins className="h-5 w-5" style={{ color: '#fbbf24' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>Movimientos del Fondo del Clan</h3>
            </div>
            {isSuperAdmin && clanMovTab === 'gastos' && (
              <button onClick={() => setShowExpenseForm(!showExpenseForm)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                {showExpenseForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {showExpenseForm ? 'Cancelar' : 'Registrar Gasto'}
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {(['retenciones', 'gastos'] as const).map(tab => (
              <button key={tab} onClick={() => { setClanMovTab(tab); if (tab !== 'gastos') setShowExpenseForm(false); }}
                className="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background: clanMovTab === tab ? 'rgba(251,191,36,0.15)' : 'transparent',
                  color: clanMovTab === tab ? '#fbbf24' : 'rgba(255,255,255,0.4)',
                  border: clanMovTab === tab ? '1px solid rgba(251,191,36,0.25)' : '1px solid transparent',
                }}>
                {tab === 'retenciones' ? '▲ Retenciones' : '▼ Registro de Gastos'}
              </button>
            ))}
          </div>

          {/* Expense form (gastos tab only) */}
          {showExpenseForm && isSuperAdmin && clanMovTab === 'gastos' && (
            <form onSubmit={handleExpenseSubmit} onPaste={handleEvidencePaste} className="mb-4 p-3 rounded-xl space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)}
                  placeholder="Monto (adena)" min="1" className="rounded-lg border bg-transparent px-3 py-2 text-sm font-mono outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
                <input type="text" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)}
                  placeholder="Descripción (en qué se gastó)" className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
              </div>
              <div>
                <input ref={evidenceInputRef} type="file" accept="image/*" onChange={handleEvidenceFileChange}
                  className="hidden" />
                <button type="button" onClick={() => evidenceInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm w-full"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', background: 'transparent' }}>
                  <Upload className="h-4 w-4" />
                  {evidenceFile ? evidenceFile.name : 'Subir o pegar imagen (Ctrl+V)'}
                </button>
                {evidencePreview && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={evidencePreview} alt="preview" className="h-12 w-12 rounded-lg object-cover"
                      style={{ border: '1px solid rgba(251,191,36,0.3)' }} />
                    <button type="button" onClick={() => { setEvidenceFile(null); setEvidencePreview(''); if (evidenceInputRef.current) evidenceInputRef.current.value = ''; }}
                      className="text-xs" style={{ color: '#f87171' }}>Quitar</button>
                  </div>
                )}
              </div>
              <button type="submit" disabled={addExpenseMutation.isPending || uploadingEvidence}
                className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ background: '#fbbf24', color: '#000' }}>
                {uploadingEvidence ? 'Subiendo imagen...' : addExpenseMutation.isPending ? 'Guardando...' : 'Registrar Gasto'}
              </button>
            </form>
          )}

          {/* Transaction list filtered by tab */}
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {(() => {
              const filtered = [...(clanTransactions as any[])]
                .filter(tx => clanMovTab === 'retenciones' ? tx.type === 'income' : tx.type === 'expense')
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              if (filtered.length === 0) return (
                <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {clanMovTab === 'retenciones' ? 'No hay retenciones registradas' : 'No hay gastos registrados'}
                </p>
              );
              return filtered.slice(0, 30).map((tx: any) => (
                <div key={tx.id}>
                  {editingTxId === tx.id ? (
                    /* Inline edit form */
                    <div className="rounded-lg p-2 space-y-2" onPaste={handleEditEvidencePaste}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(251,191,36,0.2)' }}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                          placeholder="Monto" min="1" className="rounded border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                          style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
                        <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                          placeholder="Descripción" className="rounded border bg-transparent px-2 py-1 text-xs outline-none"
                          style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
                      </div>
                      <div className="flex items-center gap-2">
                        <input ref={editEvidenceInputRef} type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { setEditEvidenceFile(f); const r = new FileReader(); r.onload = () => setEditEvidencePreview(r.result as string); r.readAsDataURL(f); } }} />
                        <button type="button" onClick={() => editEvidenceInputRef.current?.click()}
                          className="flex items-center gap-1 rounded border px-2 py-1 text-[10px]"
                          style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                          <Upload className="h-3 w-3" />
                          {editEvidenceFile ? editEvidenceFile.name : 'Cambiar imagen (o Ctrl+V)'}
                        </button>
                        {editEvidencePreview && (
                          <img src={editEvidencePreview} alt="preview" className="h-8 w-8 rounded object-cover"
                            style={{ border: '1px solid rgba(251,191,36,0.3)' }} />
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => showConfirm({
                            title: 'Guardar cambios',
                            message: `¿Guardar los cambios en este gasto? Monto: $${parseFloat(editAmount || '0').toLocaleString()}`,
                            confirmLabel: 'Guardar',
                            onConfirm: () => handleEditSubmit(tx.id),
                          })}
                          disabled={editExpenseMutation.isPending}
                          className="rounded px-3 py-1 text-xs font-bold disabled:opacity-50"
                          style={{ background: '#fbbf24', color: '#000' }}>
                          {editExpenseMutation.isPending ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button onClick={() => setEditingTxId(null)}
                          className="rounded px-3 py-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal row */
                    <div className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs" style={{ color: tx.type === 'income' ? '#10b981' : '#f87171' }}>
                          {tx.type === 'income' ? '▲' : '▼'}
                        </span>
                        <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{tx.description}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {tx.type === 'income' && (
                          <span className="text-[10px] font-semibold rounded px-1.5 py-0.5"
                            style={{
                              background: tx.settled ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.15)',
                              color: tx.settled ? '#10b981' : '#f59e0b',
                            }}>
                            {tx.settled ? '✓ PAGADO' : 'PENDIENTE'}
                          </span>
                        )}
                        <span className="text-xs font-mono font-semibold" style={{ color: tx.type === 'income' ? '#10b981' : '#f87171' }}>
                          {tx.type === 'income' ? '+' : '-'}${(tx.amount ?? 0).toLocaleString()}
                        </span>
                        {tx.evidenceUrl && (
                          <ImageHoverPreview src={tx.evidenceUrl} size={480} caption="Evidencia de gasto">
                            <img src={tx.evidenceUrl} alt="evidencia" className="h-6 w-6 rounded object-cover cursor-pointer"
                              style={{ border: '1px solid rgba(167,139,250,0.3)' }} />
                          </ImageHoverPreview>
                        )}
                        {isSuperAdmin && tx.type === 'expense' && (
                          <div className="flex items-center gap-1 ml-1">
                            <button onClick={() => startEditing(tx)} title="Editar"
                              className="rounded p-0.5 hover:bg-white/10 transition-colors">
                              <Pencil className="h-3 w-3" style={{ color: '#a78bfa' }} />
                            </button>
                            <button onClick={() => showConfirm({
                                title: 'Eliminar gasto',
                                message: `¿Eliminar gasto de $${(tx.amount ?? 0).toLocaleString()} — "${tx.description}"? Esta acción no se puede deshacer.`,
                                confirmLabel: 'Eliminar',
                                danger: true,
                                onConfirm: () => deleteExpenseMutation.mutate({ txId: tx.id }),
                              })} title="Eliminar" className="rounded p-0.5 hover:bg-white/10 transition-colors">
                              <Trash2 className="h-3 w-3" style={{ color: '#f87171' }} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ));
            })()}
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
            <form onSubmit={handleExpenseSubmit} onPaste={handleEvidencePaste} className="mt-3 p-3 rounded-xl space-y-3 card-glass" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)}
                  placeholder="Monto (adena)" min="1" className="rounded-lg border bg-transparent px-3 py-2 text-sm font-mono outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
                <input type="text" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)}
                  placeholder="Descripción" className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }} />
              </div>
              <div>
                <input ref={evidenceInputRef} type="file" accept="image/*" onChange={handleEvidenceFileChange}
                  className="hidden" />
                <button type="button" onClick={() => evidenceInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm w-full"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', background: 'transparent' }}>
                  <Upload className="h-4 w-4" />
                  {evidenceFile ? evidenceFile.name : 'Subir o pegar imagen (Ctrl+V)'}
                </button>
                {evidencePreview && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={evidencePreview} alt="preview" className="h-12 w-12 rounded-lg object-cover"
                      style={{ border: '1px solid rgba(251,191,36,0.3)' }} />
                    <button type="button" onClick={() => { setEvidenceFile(null); setEvidencePreview(''); if (evidenceInputRef.current) evidenceInputRef.current.value = ''; }}
                      className="text-xs" style={{ color: '#f87171' }}>Quitar</button>
                  </div>
                )}
              </div>
              <button type="submit" disabled={addExpenseMutation.isPending || uploadingEvidence}
                className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ background: '#fbbf24', color: '#000' }}>
                {uploadingEvidence ? 'Subiendo imagen...' : addExpenseMutation.isPending ? 'Guardando...' : 'Registrar Gasto'}
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

      {/* #13 — Fila de 3 cards: Top Personajes por Ganancia · Personajes Activos · Actividad Reciente.
          Achicamos Top Personajes (antes ocupaba 1fr) para que la tabla de inventario quede
          a todo el ancho debajo y no se rompa. */}
      <div className="grid gap-5 xl:grid-cols-3 mb-6 items-start">
        <EarningsChart characters={characters} />
        <div className="card-glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>Personajes Activos</h3>
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Cuentas registradas en el sistema. Cada cuenta corresponde a un personaje del juego.
          </p>
          {(() => {
            const users = (registeredUsers as any[]) || [];
            const activeUsers = users.filter((u: any) => u.isActive !== false);
            const saCount = activeUsers.filter((u: any) => {
              const r = String(u.role || '').toLowerCase();
              return r === 'super_admin' || r === 'admin';
            }).length;
            const mapperCount = activeUsers.filter((u: any) => String(u.role || '').toLowerCase() === 'mapper').length;
            const userCount = activeUsers.filter((u: any) => {
              const r = String(u.role || '').toLowerCase();
              return r === 'user' || (!r && r !== 'super_admin' && r !== 'admin' && r !== 'mapper');
            }).length;
            return (
              <>
                <div className="flex items-center gap-3 rounded-xl p-3 mb-3" style={{ background: 'rgba(123,241,214,0.06)', border: '1px solid rgba(123,241,214,0.15)' }}>
                  <Users className="h-5 w-5" style={{ color: '#7bf1d6' }} />
                  <div>
                    <p className="text-2xl font-bold font-mono" style={{ color: '#7bf1d6' }}>{activeUsers.length}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>personajes registrados</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-lg font-bold font-mono" style={{ color: '#7bf1d6' }}>{saCount}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Administrador del Sistema</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-lg font-bold font-mono" style={{ color: '#fbbf24' }}>{mapperCount}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Mapper</p>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-lg font-bold font-mono" style={{ color: '#a78bfa' }}>{userCount}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Usuarios</p>
                  </div>
                </div>

              </>
            );
          })()}

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

        {/* Actividad Reciente — tercera card de la fila (#13). El feed persiste
            en el servidor y solo muestra los últimos 7 días (#15). */}
        <ActivityFeed logs={auditLogs} />
      </div>

      {/* Inventario de Ítems — a todo el ancho (#13) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>Inventario de Ítems</h3>
        </div>

        {/* #2 — Bloques informativos: cómo vender y cómo comprar ítems */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(123,241,214,0.06)', border: '1px solid rgba(123,241,214,0.15)' }}>
            <p className="text-sm font-bold mb-1" style={{ color: '#7bf1d6' }}>Venta de Ítems</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Publica tu ítem en <span className="font-semibold" style={{ color: '#7bf1d6' }}>#venta-de-items</span> (Discord o TS3) utilizando el formato disponible en ese canal. Un agente revisará la publicación y registrará el ítem en la página.
            </p>
          </div>
          <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
            <p className="text-sm font-bold mb-1" style={{ color: '#a78bfa' }}>Compra de Ítems</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Haz clic en <span className="font-semibold" style={{ color: '#a78bfa' }}>"R"</span> (Reservar) en la tabla. Un agente se pondrá en contacto contigo para gestionar la compra como intermediario.
            </p>
          </div>
        </div>

        <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(123,241,214,0.06)', border: '1px solid rgba(123,241,214,0.15)' }}>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Los ítems para ser vendidos de forma interna o externa, una vez registrados, deben ser enviados por correo/mailbox para ser confirmados. Luego de recibir el ítem, aparecerá visible. Enviar al personaje: <span className="font-bold text-base" style={{ color: '#7bf1d6' }}>vRAPTOR</span>
          </p>
        </div>
        <ItemTable items={items} />
      </div>
      {/* Confirmation Modal — same style as "Eliminar ítem" modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmModal(prev => ({ ...prev, open: false })); }}>
          <div className="w-full max-w-md rounded-2xl p-5"
            style={{
              background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
              border: `1px solid ${confirmModal.danger ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)'}`,
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {confirmModal.danger
                  ? <Trash2 className="h-5 w-5" style={{ color: '#ef4444' }} />
                  : <Receipt className="h-5 w-5" style={{ color: '#fbbf24' }} />}
                <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                  {confirmModal.title}
                </h3>
              </div>
              <button type="button" onClick={() => setConfirmModal(prev => ({ ...prev, open: false }))} className="btn-ghost p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {confirmModal.message}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(prev => ({ ...prev, open: false }))} className="btn-ghost flex-1 py-2.5">
                Cancelar
              </button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(prev => ({ ...prev, open: false })); }}
                className={`flex-1 py-2.5 flex items-center justify-center gap-2 rounded-lg text-sm font-bold ${confirmModal.danger ? 'btn-danger' : ''}`}
                style={confirmModal.danger ? {} : { background: '#fbbf24', color: '#000' }}>
                {confirmModal.danger && <Trash2 className="h-4 w-4" />}
                {confirmModal.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
