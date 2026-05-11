import { useState, useMemo } from 'react';
import { Package, Plus, CheckCircle, Trash2, Minus, Search, X, Hammer, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { useApp } from '../contexts/AppContext';
import { toast } from 'sonner';

const CATEGORIES = ['ARMADURA', 'ARMA', 'JOYA', 'KEY', 'RECIPE', 'MATERIALES', 'QUEST', 'ADENA'] as const;
const catLabels: Record<string, string> = {
  ARMADURA: '🛡️ Armadura', ARMA: '⚔️ Arma', JOYA: '💍 Joya', KEY: '🔑 Key',
  RECIPE: '📜 Recipe', MATERIALES: '💎 Materiales', QUEST: '🗺️ Quest', ADENA: '💰 Adena',
};

export default function WarehouseClan() {
  const { currentUser } = useApp();
  const roleLc = String(currentUser?.role || '').toLowerCase();
  const isSA = roleLc === 'super_admin';
  const isAdminOrAbove = isSA || roleLc === 'admin';
  const canRegister = isSA || roleLc === 'admin' || roleLc === 'mapper';

  // Data queries
  const { data: warehouseItems = [], refetch: refetchItems } = trpc.warehouse.list.useQuery();
  const { data: incoming = [], refetch: refetchIncoming } = trpc.warehouse.listIncoming.useQuery();
  const { data: recipes = [], refetch: refetchRecipes } = trpc.warehouse.recipes.list.useQuery();
  const { data: projects = [], refetch: refetchProjects } = trpc.warehouse.projects.list.useQuery();

  // Mutations
  const registerMut = trpc.warehouse.register.useMutation({ onSuccess: () => { refetchIncoming(); toast.success('Material registrado'); } });
  const confirmMut = trpc.warehouse.confirm.useMutation({ onSuccess: () => { refetchItems(); refetchIncoming(); toast.success('Confirmado y agrupado'); } });
  const deleteIncomingMut = trpc.warehouse.deleteIncoming.useMutation({ onSuccess: () => { refetchIncoming(); toast.success('Registro eliminado'); } });
  const withdrawMut = trpc.warehouse.withdraw.useMutation({ onSuccess: () => { refetchItems(); toast.success('Stock descontado'); } });
  const deleteItemMut = trpc.warehouse.deleteItem.useMutation({ onSuccess: () => { refetchItems(); toast.success('Ítem eliminado'); } });
  const createRecipeMut = trpc.warehouse.recipes.create.useMutation({ onSuccess: () => { refetchRecipes(); toast.success('Receta creada'); } });
  const deleteRecipeMut = trpc.warehouse.recipes.delete.useMutation({ onSuccess: () => { refetchRecipes(); toast.success('Receta eliminada'); } });
  const createProjectMut = trpc.warehouse.projects.create.useMutation({ onSuccess: () => { refetchProjects(); toast.success('Proyecto creado'); } });
  const completeProjectMut = trpc.warehouse.projects.complete.useMutation({ onSuccess: () => { refetchProjects(); toast.success('Proyecto completado'); } });
  const deleteProjectMut = trpc.warehouse.projects.delete.useMutation({ onSuccess: () => { refetchProjects(); toast.success('Proyecto eliminado'); } });

  // Local state
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [tab, setTab] = useState<'warehouse' | 'crafting'>('warehouse');

  // Register form
  const [regOpen, setRegOpen] = useState(false);
  const [regName, setRegName] = useState('');
  const [regCat, setRegCat] = useState('MATERIALES');
  const [regQty, setRegQty] = useState('1');
  const [regImg, setRegImg] = useState('');

  // Withdraw modal
  const [withdrawItem, setWithdrawItem] = useState<any>(null);
  const [withdrawQty, setWithdrawQty] = useState('1');
  const [withdrawReason, setWithdrawReason] = useState('');

  // Recipe form
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeImg, setRecipeImg] = useState('');
  const [recipeWiki, setRecipeWiki] = useState('');
  const [recipeMaterials, setRecipeMaterials] = useState<Array<{ name: string; quantity: string; imageUrl: string }>>([{ name: '', quantity: '1', imageUrl: '' }]);

  // Project form
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectRecipeId, setProjectRecipeId] = useState('');
  const [projectNotes, setProjectNotes] = useState('');

  // Expand project details
  const [expandedProject, setExpandedProject] = useState<number | null>(null);

  // Filter warehouse items
  const filtered = useMemo(() => {
    return (warehouseItems as any[]).filter((i: any) => {
      const q = search.toLowerCase();
      const matchName = !q || String(i.name || '').toLowerCase().includes(q);
      const matchCat = catFilter === 'ALL' || i.category === catFilter;
      return matchName && matchCat;
    });
  }, [warehouseItems, search, catFilter]);

  // Warehouse stock lookup for craft projects
  const stockLookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of warehouseItems as any[]) {
      const key = String(item.nameLower || item.name || '').toLowerCase();
      m.set(key, (m.get(key) || 0) + (Number(item.quantity) || 0));
    }
    return m;
  }, [warehouseItems]);

  // Totals
  const totalItems = filtered.length;
  const totalUnits = filtered.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
  const inStockCount = filtered.filter((i: any) => (Number(i.quantity) || 0) > 0).length;
  const outOfStockCount = filtered.filter((i: any) => (Number(i.quantity) || 0) === 0).length;

  const handleRegister = () => {
    if (!regName.trim()) { toast.error('Nombre requerido'); return; }
    registerMut.mutate({
      name: regName.trim(),
      category: regCat,
      quantity: Number(regQty) || 1,
      imageUrl: regImg || undefined,
    });
    setRegOpen(false);
    setRegName(''); setRegQty('1'); setRegImg('');
  };

  const handleWithdraw = () => {
    if (!withdrawItem) return;
    if (!withdrawReason.trim()) { toast.error('Debe indicar un motivo'); return; }
    withdrawMut.mutate({
      id: Number(withdrawItem.id),
      quantity: Number(withdrawQty) || 1,
      reason: withdrawReason.trim(),
    });
    setWithdrawItem(null); setWithdrawQty('1'); setWithdrawReason('');
  };

  const handleCreateRecipe = () => {
    if (!recipeName.trim()) { toast.error('Nombre de receta requerido'); return; }
    const mats = recipeMaterials.filter(m => m.name.trim()).map(m => ({
      name: m.name.trim(),
      quantity: Number(m.quantity) || 1,
      imageUrl: m.imageUrl || undefined,
    }));
    if (mats.length === 0) { toast.error('Agrega al menos 1 material'); return; }
    createRecipeMut.mutate({
      name: recipeName.trim(),
      imageUrl: recipeImg || undefined,
      wikiUrl: recipeWiki || undefined,
      materials: mats,
    });
    setRecipeOpen(false);
    setRecipeName(''); setRecipeImg(''); setRecipeWiki('');
    setRecipeMaterials([{ name: '', quantity: '1', imageUrl: '' }]);
  };

  const handleCreateProject = () => {
    if (!projectRecipeId) { toast.error('Selecciona una receta'); return; }
    createProjectMut.mutate({
      recipeId: Number(projectRecipeId),
      notes: projectNotes || undefined,
    });
    setProjectOpen(false);
    setProjectRecipeId(''); setProjectNotes('');
  };

  const addMaterialRow = () => {
    setRecipeMaterials(prev => [...prev, { name: '', quantity: '1', imageUrl: '' }]);
  };

  const removeMaterialRow = (idx: number) => {
    setRecipeMaterials(prev => prev.filter((_, i) => i !== idx));
  };

  const updateMaterialRow = (idx: number, field: string, value: string) => {
    setRecipeMaterials(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Warehouse Clan</h1>
      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Bodega del clan — materiales para crafteo. Los ítems se acumulan automáticamente al confirmar.
      </p>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('warehouse')}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: tab === 'warehouse' ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
            color: tab === 'warehouse' ? '#34d399' : 'rgba(255,255,255,0.5)',
            border: `1px solid ${tab === 'warehouse' ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          <Package className="inline h-4 w-4 mr-1.5" /> Bodega ({totalItems})
        </button>
        <button
          onClick={() => setTab('crafting')}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: tab === 'crafting' ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.04)',
            color: tab === 'crafting' ? '#a855f7' : 'rgba(255,255,255,0.5)',
            border: `1px solid ${tab === 'crafting' ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          <Hammer className="inline h-4 w-4 mr-1.5" /> Crafteo ({(projects as any[]).filter((p: any) => p.status === 'active').length})
        </button>
      </div>

      {/* ═══ TAB: WAREHOUSE ═══ */}
      {tab === 'warehouse' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Ítems: </span><span className="font-bold" style={{ color: '#34d399' }}>{totalItems}</span></div>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Unidades: </span><span className="font-bold" style={{ color: '#60a5fa' }}>{totalUnits.toLocaleString()}</span></div>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Con stock: </span><span className="font-bold" style={{ color: '#34d399' }}>{inStockCount}</span></div>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Sin stock: </span><span className="font-bold" style={{ color: '#ef4444' }}>{outOfStockCount}</span></div>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Pendientes: </span><span className="font-bold" style={{ color: '#fbbf24' }}>{(incoming as any[]).length}</span></div>
              {canRegister && (
                <button
                  onClick={() => setRegOpen(true)}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}
                >
                  <Plus className="inline h-3.5 w-3.5 mr-1" /> Registrar Material
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <input
                type="text" placeholder="Buscar material..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg pl-10 pr-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}
              />
            </div>
            <select
              value={catFilter} onChange={e => setCatFilter(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}
            >
              <option value="ALL">Todas las categorías</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{catLabels[c] || c}</option>)}
            </select>
          </div>

          {/* Incoming (pending confirmation) */}
          {(incoming as any[]).length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: '#fbbf24' }}>⏳ Pendientes de confirmación ({(incoming as any[]).length})</p>
              <div className="space-y-1.5">
                {(incoming as any[]).map((inc: any) => (
                  <div key={inc.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-3 text-sm">
                      {inc.imageUrl && <img src={inc.imageUrl} alt="" className="h-6 w-6 rounded object-cover" />}
                      <span style={{ color: 'rgba(255,255,255,0.8)' }}>{inc.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{catLabels[inc.category] || inc.category}</span>
                      <span className="font-mono font-bold" style={{ color: '#60a5fa' }}>×{inc.quantity}</span>
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>por {inc.registeredBy}</span>
                    </div>
                    {isSA && (
                      <div className="flex gap-1.5">
                        <button onClick={() => confirmMut.mutate({ id: Number(inc.id) })} className="p-1.5 rounded-lg" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }} title="Confirmar">
                          <CheckCircle className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteIncomingMut.mutate({ id: Number(inc.id) })} className="p-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }} title="Rechazar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warehouse Items Table */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Img</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Categoría</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Cantidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No hay materiales en la bodega.
                  </td></tr>
                )}
                {filtered.map((item: any) => {
                  const qty = Number(item.quantity) || 0;
                  const inStock = qty > 0;
                  return (
                    <tr key={item.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                      <td className="px-4 py-3">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover border" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                        ) : (
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <Package className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{item.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{catLabels[item.category] || item.category}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-sm" style={{ color: inStock ? '#34d399' : '#ef4444' }}>
                          {qty.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{
                            background: inStock ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${inStock ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
                            color: inStock ? '#34d399' : '#ef4444',
                          }}
                        >
                          {inStock ? '✅ Con stock' : '❌ Sin stock'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {isAdminOrAbove && inStock && (
                            <button onClick={() => { setWithdrawItem(item); setWithdrawQty('1'); setWithdrawReason(''); }} className="p-1.5 rounded-lg text-xs" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }} title="Descontar">
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isSA && (
                            <button onClick={() => { if (confirm(`¿Eliminar ${item.name} de la bodega?`)) deleteItemMut.mutate({ id: Number(item.id) }); }} className="p-1.5 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }} title="Eliminar">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ TAB: CRAFTING ═══ */}
      {tab === 'crafting' && (
        <div className="space-y-4">
          {/* Action buttons */}
          <div className="flex gap-2">
            {isSA && (
              <>
                <button onClick={() => setRecipeOpen(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>
                  <Plus className="inline h-3.5 w-3.5 mr-1" /> Nueva Receta
                </button>
                <button onClick={() => setProjectOpen(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                  <Hammer className="inline h-3.5 w-3.5 mr-1" /> Nuevo Proyecto
                </button>
              </>
            )}
          </div>

          {/* Active Projects */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>Proyectos Activos</h2>
            {(projects as any[]).filter((p: any) => p.status === 'active').length === 0 && (
              <p className="text-xs py-6 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay proyectos activos. {isSA ? 'Crea uno desde "Nuevo Proyecto".' : ''}</p>
            )}
            {(projects as any[]).filter((p: any) => p.status === 'active').map((project: any) => {
              const recipe = (recipes as any[]).find((r: any) => Number(r.id) === Number(project.recipeId));
              const materials = recipe?.materials || [];
              const totalMats = materials.length;
              const completedMats = materials.filter((m: any) => {
                const have = stockLookup.get(String(m.nameLower || m.name || '').toLowerCase()) || 0;
                return have >= (Number(m.quantity) || 0);
              }).length;
              const progress = totalMats > 0 ? Math.round((completedMats / totalMats) * 100) : 0;
              const isExpanded = expandedProject === Number(project.id);

              return (
                <div key={project.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.03)' }}>
                  {/* Project header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer"
                    onClick={() => setExpandedProject(isExpanded ? null : Number(project.id))}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🎯</span>
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>{project.recipeName}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Creado por {project.createdBy} · {new Date(project.createdAt).toLocaleDateString('es-CL')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Progress */}
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: progress === 100 ? '#34d399' : progress >= 50 ? '#fbbf24' : '#ef4444' }} />
                        </div>
                        <span className="text-xs font-mono font-bold" style={{ color: progress === 100 ? '#34d399' : 'rgba(255,255,255,0.6)' }}>{progress}%</span>
                      </div>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{completedMats}/{totalMats}</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
                    </div>
                  </div>

                  {/* Expanded: material list */}
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      {recipe?.wikiUrl && (
                        <a href={recipe.wikiUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] mb-3 px-2 py-1 rounded-lg" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}>
                          <ExternalLink className="h-3 w-3" /> Ver en Wiki
                        </a>
                      )}
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <th className="py-2 text-left font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Material</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Necesario</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Tenemos</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Falta</th>
                            <th className="py-2 text-center font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {materials.map((mat: any, idx: number) => {
                            const need = Number(mat.quantity) || 0;
                            const have = stockLookup.get(String(mat.nameLower || mat.name || '').toLowerCase()) || 0;
                            const missing = Math.max(0, need - have);
                            const status = have >= need ? 'complete' : have > 0 ? 'partial' : 'none';
                            return (
                              <tr key={idx} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                                <td className="py-2">
                                  <span style={{ color: status === 'complete' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.8)', textDecoration: status === 'complete' ? 'line-through' : 'none' }}>
                                    {mat.name}
                                  </span>
                                </td>
                                <td className="py-2 text-right font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>{need.toLocaleString()}</td>
                                <td className="py-2 text-right font-mono" style={{ color: have > 0 ? '#34d399' : 'rgba(255,255,255,0.3)' }}>{have.toLocaleString()}</td>
                                <td className="py-2 text-right font-mono font-bold" style={{ color: missing > 0 ? '#ef4444' : '#34d399' }}>{missing > 0 ? missing.toLocaleString() : '—'}</td>
                                <td className="py-2 text-center">
                                  <span style={{ fontSize: '14px' }}>
                                    {status === 'complete' ? '✅' : status === 'partial' ? '⚠️' : '❌'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {/* Project actions */}
                      {isSA && (
                        <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {progress === 100 && (
                            <button onClick={() => completeProjectMut.mutate({ id: Number(project.id) })} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                              <CheckCircle className="inline h-3.5 w-3.5 mr-1" /> Marcar Completado
                            </button>
                          )}
                          <button onClick={() => { if (confirm('¿Eliminar este proyecto?')) deleteProjectMut.mutate({ id: Number(project.id) }); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <Trash2 className="inline h-3.5 w-3.5 mr-1" /> Eliminar Proyecto
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Saved Recipes */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>Recetas Guardadas ({(recipes as any[]).length})</h2>
            {(recipes as any[]).length === 0 && (
              <p className="text-xs py-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay recetas. {isSA ? 'Crea una desde "Nueva Receta".' : ''}</p>
            )}
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {(recipes as any[]).map((recipe: any) => (
                <div key={recipe.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{recipe.name}</p>
                    {isSA && (
                      <button onClick={() => { if (confirm(`¿Eliminar receta "${recipe.name}"?`)) deleteRecipeMut.mutate({ id: Number(recipe.id) }); }} className="p-1 rounded" style={{ color: 'rgba(239,68,68,0.6)' }} title="Eliminar receta">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{recipe.materials?.length || 0} materiales · por {recipe.createdBy}</p>
                  {recipe.wikiUrl && (
                    <a href={recipe.wikiUrl} target="_blank" rel="noopener noreferrer" className="text-[10px]" style={{ color: '#60a5fa' }}>
                      <ExternalLink className="inline h-2.5 w-2.5 mr-0.5" /> Wiki
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Completed Projects */}
          {(projects as any[]).filter((p: any) => p.status === 'completed').length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>Proyectos Completados</h2>
              {(projects as any[]).filter((p: any) => p.status === 'completed').map((project: any) => (
                <div key={project.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <span>✅</span>
                    <span className="line-through">{project.recipeName}</span>
                    <span className="text-[10px]">{project.completedAt ? new Date(project.completedAt).toLocaleDateString('es-CL') : ''}</span>
                  </div>
                  {isSA && (
                    <button onClick={() => deleteProjectMut.mutate({ id: Number(project.id) })} className="p-1 rounded" style={{ color: 'rgba(239,68,68,0.4)' }}><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Register Material Modal */}
      {regOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Registrar Material</h3>
              <button onClick={() => setRegOpen(false)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Nombre *</label>
                <input value={regName} onChange={e => setRegName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Coal, Iron Ore, etc." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Categoría</label>
                  <select value={regCat} onChange={e => setRegCat(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{catLabels[c] || c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Cantidad *</label>
                  <input type="number" min="1" value={regQty} onChange={e => setRegQty(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>URL Imagen (opcional)</label>
                <input value={regImg} onChange={e => setRegImg(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="https://..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setRegOpen(false)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button onClick={handleRegister} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(52,211,153,0.2)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {withdrawItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Descontar: {withdrawItem.name}</h3>
              <button onClick={() => setWithdrawItem(null)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Stock actual: <span className="font-bold" style={{ color: '#34d399' }}>{Number(withdrawItem.quantity).toLocaleString()}</span></p>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Cantidad a descontar *</label>
                <input type="number" min="1" max={withdrawItem.quantity} value={withdrawQty} onChange={e => setWithdrawQty(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Motivo *</label>
                <input value={withdrawReason} onChange={e => setWithdrawReason(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Crafteo Lance, donación, etc." />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setWithdrawItem(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button onClick={handleWithdraw} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>Descontar</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Recipe Modal */}
      {recipeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-lg mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Nueva Receta de Crafteo</h3>
              <button onClick={() => setRecipeOpen(false)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Nombre del ítem final *</label>
                <input value={recipeName} onChange={e => setRecipeName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Lance, Majestic Plate Armor, etc." />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>URL Wiki (opcional)</label>
                <input value={recipeWiki} onChange={e => setRecipeWiki(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="https://wikipedia1.mw2.wiki/lu4/item/..." />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>URL Imagen (opcional)</label>
                <input value={recipeImg} onChange={e => setRecipeImg(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="https://..." />
              </div>
              {/* Materials list */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Materiales requeridos *</label>
                <div className="space-y-2">
                  {recipeMaterials.map((mat, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        value={mat.name} onChange={e => updateMaterialRow(idx, 'name', e.target.value)}
                        placeholder="Nombre del material"
                        className="flex-1 rounded-lg px-3 py-1.5 text-xs"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
                      />
                      <input
                        type="number" min="1" value={mat.quantity} onChange={e => updateMaterialRow(idx, 'quantity', e.target.value)}
                        className="w-20 rounded-lg px-3 py-1.5 text-xs text-center"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
                      />
                      {recipeMaterials.length > 1 && (
                        <button onClick={() => removeMaterialRow(idx)} className="p-1 rounded" style={{ color: 'rgba(239,68,68,0.5)' }}><X className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={addMaterialRow} className="mt-2 text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
                  + Agregar material
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setRecipeOpen(false)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button onClick={handleCreateRecipe} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(168,85,247,0.2)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>Crear Receta</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {projectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Nuevo Proyecto de Crafteo</h3>
              <button onClick={() => setProjectOpen(false)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Seleccionar Receta *</label>
                <select value={projectRecipeId} onChange={e => setProjectRecipeId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
                  <option value="">— Seleccionar —</option>
                  {(recipes as any[]).map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.materials?.length || 0} materiales)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Notas (opcional)</label>
                <input value={projectNotes} onChange={e => setProjectNotes(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Para armar a Juan, etc." />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setProjectOpen(false)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button onClick={handleCreateProject} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(52,211,153,0.2)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>Crear Proyecto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
