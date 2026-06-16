import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Package, Plus, CheckCircle, Trash2, Minus, Search, X, Hammer, ChevronDown, ChevronUp, ChevronRight, ExternalLink, PackagePlus, Loader2, Image as ImageIcon, AlertCircle, Star, User, Users, Pencil, Shield, Crown, Flag, Settings, Swords, UserCheck, UserX, RefreshCw, Clock, ArrowRightLeft, Target, Calendar, ChevronLeft, Check, CircleCheck, CircleX, CreditCard, BadgeCheck } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '../components/ui/alert-dialog';
import { trpc } from '../lib/trpc';
import { useApp } from '../contexts/AppContext';
import { AppShell } from '../components/layout/AppShell';
import { FancySelect, type FancyOption } from '../components/ui/FancySelect';
import { categoryMeta, CATEGORIES } from '../lib/category-meta';
import type { ItemCategory } from '../lib/types';
import { toast } from 'sonner';
import RaidClansAndCps from './raid/RaidClansAndCps';
import { ImageHoverPreview } from '../components/ui/ImageHoverPreview';

// ═══════════════════════════════════════════════════════════════════════════
// CatalogTypeahead
// ═══════════════════════════════════════════════════════════════════════════

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(123,241,214,0.25)', color: '#7bf1d6', borderRadius: 3 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

interface CatalogTypeaheadProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (item: { id?: number; name: string; category: string; imageUrl: string | null }) => void;
  catalog: any[];
  placeholder?: string;
}

function CatalogTypeahead({ value, onChange, onSelect, catalog, placeholder = 'Ej: Draconic Leather' }: CatalogTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const suppressRef = useRef(false);

  const results = useMemo(() => {
    if (!value.trim() || suppressRef.current) return [];
    const q = value.toLowerCase();
    return (catalog || []).filter((m: any) => String(m.name || '').toLowerCase().includes(q)).slice(0, 10);
  }, [catalog, value]);

  const handleSelect = useCallback((item: any) => {
    suppressRef.current = true;
    setOpen(false);
    setActiveIdx(-1);
    onSelect({ id: item.id, name: item.name, category: item.category, imageUrl: item.imageUrl || null });
    setTimeout(() => { suppressRef.current = false; }, 100);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(results[activeIdx]); }
    if (e.key === 'Escape') { setOpen(false); setActiveIdx(-1); }
  }, [open, results, activeIdx, handleSelect]);

  const handleChange = useCallback((v: string) => {
    suppressRef.current = false;
    onChange(v);
    if (v.trim()) {
      const q = v.toLowerCase();
      const r = (catalog || []).filter((m: any) => String(m.name || '').toLowerCase().includes(q)).slice(0, 10);
      setOpen(r.length > 0);
      setActiveIdx(-1);
    } else {
      setOpen(false);
    }
  }, [onChange, catalog]);

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 rounded-lg transition-all h-9 px-2"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Search className="shrink-0 h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.35)' }} />
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (value.trim() && !suppressRef.current) { const q = value.toLowerCase(); const r = (catalog || []).filter((m: any) => String(m.name || '').toLowerCase().includes(q)).slice(0, 10); setOpen(r.length > 0); } }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none text-xs"
          style={{ color: 'rgba(255,255,255,0.9)', caretColor: '#7bf1d6' }}
        />
      </div>

      {open && results.length > 0 && (
        <div ref={listRef} className="autocomplete-dropdown">
          {results.map((item: any, idx: number) => {
            const meta = categoryMeta[item.category] || { color: '#7bf1d6', emoji: '📦', label: item.category };
            const isActive = idx === activeIdx;
            return (
              <button
                key={item.id}
                onMouseDown={e => { e.preventDefault(); handleSelect(item); }}
                onMouseEnter={() => setActiveIdx(idx)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-all last:border-b-0"
                style={{ borderColor: 'rgba(255,255,255,0.05)', background: isActive ? 'rgba(123,241,214,0.06)' : 'transparent' }}
              >
                <div className="relative h-[30px] w-[30px] shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5">
                      <Package className="h-4 w-4 text-white/20" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {highlight(item.name, value)}
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {meta.emoji} {meta.label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Confirmation Modal
// ═══════════════════════════════════════════════════════════════════════════

function ConfirmModal({ open, title, message, confirmLabel, confirmColor, onConfirm, onCancel, icon, itemName, itemDetail, itemImage }: {
  open: boolean; title: string; message: string; confirmLabel: string; confirmColor: string;
  onConfirm: () => void; onCancel: () => void;
  icon?: React.ReactNode; itemName?: string; itemDetail?: string; itemImage?: string | null;
}) {
  if (!open) return null;
  const isDelete = confirmColor === '#ef4444';
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{
          background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
          border: `1px solid ${confirmColor}40`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              {icon || (isDelete ? <Trash2 className="h-5 w-5" style={{ color: confirmColor }} /> : <CheckCircle className="h-5 w-5" style={{ color: confirmColor }} />)}
              <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                {title}
              </h3>
            </div>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {message}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {itemName && (
          <div className="rounded-xl p-3 mb-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {itemImage ? (
                <img src={itemImage} alt={itemName} className="h-full w-full object-cover" />
              ) : (
                <Package className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{itemName}</p>
              {itemDetail && <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{itemDetail}</p>}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2" style={{
            background: isDelete
              ? 'linear-gradient(90deg, rgba(239,68,68,0.9), rgba(232,121,249,0.9))'
              : `linear-gradient(90deg, ${confirmColor}dd, ${confirmColor}99)`,
            border: `1px solid ${confirmColor}60`,
            color: '#fff',
          }}>
            {isDelete ? <Trash2 className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Row type for multi-row registration
// ═══════════════════════════════════════════════════════════════════════════

interface RowState {
  id: string;
  name: string;
  category: ItemCategory | '';
  quantity: string;
  imageUrl: string;
}

let rowIdCounter = 0;
const emptyRow = (): RowState => ({
  id: `wr-${Date.now()}-${++rowIdCounter}`,
  name: '',
  category: '',
  quantity: '0',
  imageUrl: '',
});

const isInvalidQuantity = (q: string) => {
  const n = parseInt(q, 10);
  return !q || isNaN(n) || n < 1;
};

// ═══════════════════════════════════════════════════════════════════════════
// WarehouseClan — main page
// ═══════════════════════════════════════════════════════════════════════════

export default function WarehouseClan() {
  const { currentUser } = useApp();
  const roleLc = String(currentUser?.role || '').toLowerCase();
  const isSA = roleLc === 'super_admin';
  const isAdminOrAbove = isSA || roleLc === 'admin';
  const currentUserId = Number(currentUser?.id || 0);

  // CP selector
  const [selectedCpId, setSelectedCpId] = useState<number | null>(null);
  const { data: warehouseCps = [] } = trpc.warehouse.listCps.useQuery(undefined, { refetchInterval: 5000 });
  const ledCpIds = useMemo(() => {
    return (warehouseCps as any[]).filter((cp: any) => Number(cp.leaderId) === currentUserId).map((cp: any) => Number(cp.id));
  }, [warehouseCps, currentUserId]);
  const isLeaderOfSelected = selectedCpId != null && ledCpIds.includes(selectedCpId);
  const canRegister = isSA || roleLc === 'admin' || roleLc === 'mapper' || isLeaderOfSelected;
  const canWriteSelected = isSA || isLeaderOfSelected;

  // Settings
  const { data: whSettings } = trpc.warehouse.getSettings.useQuery(undefined, { refetchInterval: 5000 });
  const crossCpVisible = whSettings?.crossCpVisibility !== false;
  const updateSettingsMut = trpc.warehouse.updateSettings.useMutation({ onSuccess: () => { toast.success('Configuración actualizada'); } });

  // My CP membership (for visibility restriction) — use client-side data so impersonation works
  const myMemberCpId = (currentUser as any)?.raidCpId ? Number((currentUser as any).raidCpId) : null;
  const allowedCpIds = useMemo(() => {
    if (isSA || crossCpVisible) return null; // null = no restriction, show all
    const ids = new Set<number>();
    if (myMemberCpId) ids.add(myMemberCpId);
    ledCpIds.forEach(id => ids.add(id));
    return ids.size > 0 ? Array.from(ids) : [];
  }, [isSA, crossCpVisible, myMemberCpId, ledCpIds]);

  // Filter visible CPs
  const visibleCps = useMemo(() => {
    if (!allowedCpIds) return warehouseCps as any[];
    return (warehouseCps as any[]).filter((cp: any) => allowedCpIds.includes(Number(cp.id)));
  }, [warehouseCps, allowedCpIds]);

  // Data queries (filtered by selected CP)
  // When visibility is restricted, always pass a cpId to prevent showing all data
  const effectiveCpId = selectedCpId ?? (allowedCpIds && allowedCpIds.length > 0 ? allowedCpIds[0] : null);
  const cpQueryArg = effectiveCpId ? { cpId: effectiveCpId } : undefined;
  const { data: warehouseItems = [], refetch: refetchItems } = trpc.warehouse.list.useQuery(cpQueryArg);
  const { data: incoming = [], refetch: refetchIncoming } = trpc.warehouse.listIncoming.useQuery(cpQueryArg);
  const { data: recipes = [], refetch: refetchRecipes } = trpc.warehouse.recipes.list.useQuery();
  const { data: projects = [], refetch: refetchProjects } = trpc.warehouse.projects.list.useQuery(cpQueryArg);
  const { data: catalog = [] } = trpc.warehouse.catalog.list.useQuery();

  // Auto-select CP when visibility is restricted or when current selection is invalid
  React.useEffect(() => {
    if (allowedCpIds && allowedCpIds.length > 0) {
      if (selectedCpId === null || !allowedCpIds.includes(selectedCpId)) {
        setSelectedCpId(allowedCpIds[0]);
      }
    }
  }, [allowedCpIds, selectedCpId]);

  // Category icons
  const categoryIconsQ = trpc.raid.categoryIcons.list.useQuery(undefined, { staleTime: 60_000 });
  const categoryIconMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    (categoryIconsQ.data || []).forEach((r: { category: string; imageUrl: string }) => {
      map[String(r.category).toUpperCase()] = r.imageUrl;
    });
    return map;
  }, [categoryIconsQ.data]);
  const resolveCategoryIcon = (cat: string): string => {
    if (!cat) return '';
    return categoryIconMap[String(cat).toUpperCase()] || '';
  };

  // Mutations
  const registerMut = trpc.warehouse.register.useMutation({ onSuccess: () => { refetchIncoming(); toast.success('Material registrado'); } });
  const confirmMut = trpc.warehouse.confirm.useMutation({ onSuccess: () => { refetchItems(); refetchIncoming(); toast.success('Confirmado y agrupado'); } });
  const deleteIncomingMut = trpc.warehouse.deleteIncoming.useMutation({ onSuccess: () => { refetchIncoming(); toast.success('Registro eliminado'); } });
  const withdrawMut = trpc.warehouse.withdraw.useMutation({ onSuccess: () => { refetchItems(); refetchHistory(); toast.success('Stock descontado'); } });
  const deleteItemMut = trpc.warehouse.deleteItem.useMutation({ onSuccess: () => { refetchItems(); refetchHistory(); toast.success('Ítem eliminado'); } });
  const createRecipeMut = trpc.warehouse.recipes.create.useMutation({ onSuccess: () => { refetchRecipes(); toast.success('Receta creada'); } });
  const deleteRecipeMut = trpc.warehouse.recipes.delete.useMutation({ onSuccess: () => { refetchRecipes(); toast.success('Receta eliminada'); } });
  const updateRecipeMut = trpc.warehouse.recipes.update.useMutation({ onSuccess: () => { refetchRecipes(); toast.success('Receta actualizada'); setEditRecipe(null); } });
  const deleteHistoryMut = trpc.warehouse.deleteHistory.useMutation({ onSuccess: () => { refetchHistory(); toast.success('Entrada de historial eliminada'); } });
  const createProjectMut = trpc.warehouse.projects.create.useMutation({ onSuccess: () => { refetchProjects(); toast.success('Proyecto creado'); } });
  const completeProjectMut = trpc.warehouse.projects.complete.useMutation({ onSuccess: () => { refetchProjects(); refetchItems(); toast.success('Proyecto completado — materiales descontados'); } });
  const deleteProjectMut = trpc.warehouse.projects.delete.useMutation({ onSuccess: () => { refetchProjects(); toast.success('Proyecto eliminado'); } });
  const togglePriorityMut = trpc.warehouse.projects.togglePriority.useMutation({ onSuccess: () => { refetchProjects(); } });
  const editAssignmentMut = trpc.warehouse.projects.editAssignment.useMutation({ onSuccess: () => { refetchProjects(); toast.success('Asignación actualizada'); } });
  const { data: allCharacters = [] } = trpc.warehouse.listCharacters.useQuery();
  const { data: warehouseHistory = [], refetch: refetchHistory } = trpc.warehouse.listHistory.useQuery(cpQueryArg);
  // CP members for project assignment (only members of the selected CP)
  const { data: cpMembersChars = [] } = trpc.warehouse.listCpMembers.useQuery(
    { cpId: selectedCpId! },
    { enabled: !!selectedCpId }
  );

  // ─── Loans between CPs ──────────────────────────────────────
  const { data: loans = [], refetch: refetchLoans } = trpc.warehouse.listLoans.useQuery(cpQueryArg);
  const createLoanMut = trpc.warehouse.createLoan.useMutation({ onSuccess: () => { refetchItems(); refetchLoans(); refetchHistory(); toast.success('Préstamo registrado'); } });
  const returnLoanMut = trpc.warehouse.returnLoan.useMutation({ onSuccess: () => { refetchItems(); refetchLoans(); refetchHistory(); toast.success('Devolución confirmada'); } });
  const [loanItem, setLoanItem] = useState<any>(null);
  const [loanQty, setLoanQty] = useState('1');
  const [loanToCpId, setLoanToCpId] = useState<number | null>(null);
  const [loanReason, setLoanReason] = useState('');
  const [loansModalCpId, setLoansModalCpId] = useState<number | null>(null); // which CP's loans to show

  // Derived: pending loans received by selected CP
  const receivedLoans = useMemo(() => {
    if (!effectiveCpId) return [];
    return (loans as any[]).filter((l: any) => Number(l.toCpId) === effectiveCpId && !l.returned);
  }, [loans, effectiveCpId]);

  // Derived: loans sent from selected CP (for P button)
  const sentLoans = useMemo(() => {
    if (!effectiveCpId) return [];
    return (loans as any[]).filter((l: any) => Number(l.fromCpId) === effectiveCpId);
  }, [loans, effectiveCpId]);

  const pendingSentLoans = useMemo(() => sentLoans.filter((l: any) => !l.returned), [sentLoans]);

  // Tab state
  const [tab, setTab] = useState<'bodega' | 'crafteo' | 'objetivos' | 'config'>('bodega');
  const [configSubTab, setConfigSubTab] = useState<'clans' | 'recipes'>('clans');

  // Config tab queries & mutations
  const { data: whClans = [], refetch: refetchWhClans } = trpc.warehouse.clans.list.useQuery();
  const { data: whCps = [], refetch: refetchWhCps } = trpc.warehouse.commandParties.list.useQuery();
  const { data: allAppUsers = [] } = trpc.warehouse.commandParties.listUsers.useQuery();
  const createClanMut = trpc.warehouse.clans.create.useMutation({ onSuccess: () => { refetchWhClans(); toast.success('Clan creado'); } });
  const updateClanMut = trpc.warehouse.clans.update.useMutation({ onSuccess: () => { refetchWhClans(); toast.success('Clan actualizado'); } });
  const deleteClanMut = trpc.warehouse.clans.delete.useMutation({ onSuccess: () => { refetchWhClans(); refetchWhCps(); toast.success('Clan eliminado'); } });
  const refetchCpSelector = trpc.warehouse.listCps.useQuery().refetch;
  const createCpMut = trpc.warehouse.commandParties.create.useMutation({ onSuccess: () => { refetchWhCps(); refetchCpSelector(); toast.success('CP creada'); } });
  const updateCpMut = trpc.warehouse.commandParties.update.useMutation({ onSuccess: () => { refetchWhCps(); refetchCpSelector(); toast.success('CP actualizada'); } });
  const deleteCpMut = trpc.warehouse.commandParties.delete.useMutation({ onSuccess: () => { refetchWhCps(); refetchCpSelector(); toast.success('CP eliminada'); } });

  // Config tab state
  const [newClanName, setNewClanName] = useState('');
  const [editingClan, setEditingClan] = useState<any>(null);
  const [editClanName, setEditClanName] = useState('');
  const [newCpName, setNewCpName] = useState('');
  const [newCpClanId, setNewCpClanId] = useState('');
  const [editingCp, setEditingCp] = useState<any>(null);
  const [editCpName, setEditCpName] = useState('');
  const [editCpLeaderId, setEditCpLeaderId] = useState<string>('');
  const [expandedConfigCps, setExpandedConfigCps] = useState<Set<number>>(new Set());
  const [showCreateCpForm, setShowCreateCpForm] = useState(false);
  const addMemberMut = trpc.warehouse.commandParties.addMember.useMutation({ onSuccess: () => { refetchWhCps(); refetchCpSelector(); toast.success('Miembro agregado'); } });
  const removeMemberMut = trpc.warehouse.commandParties.removeMember.useMutation({ onSuccess: () => { refetchWhCps(); refetchCpSelector(); toast.success('Miembro removido'); } });
  const syncFromRaidMut = trpc.warehouse.commandParties.syncFromRaid.useMutation({ onSuccess: (data) => { refetchWhClans(); refetchWhCps(); refetchCpSelector(); toast.success(`Sincronizado: ${data.syncedCps} CPs, ${data.syncedMembers} miembros de ${data.raidClanName}`); }, onError: (e: any) => toast.error(e.message) });

  // ─── Objetivos tab ──────────────────────────────────────────
  const getMonday = (d: Date) => { const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); dt.setDate(diff); dt.setHours(0, 0, 0, 0); return dt; };
  const [objMonth, setObjMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toISOString(); });
  const objCpId = effectiveCpId || 0;
  const { data: objectives = [], refetch: refetchObjectives } = trpc.warehouse.objectives.list.useQuery(
    { cpId: objCpId, monthStart: objMonth },
    { enabled: objCpId > 0 }
  );
  const { data: attendance = [], refetch: refetchAttendance } = trpc.warehouse.attendance.list.useQuery(
    { cpId: objCpId },
    { enabled: objCpId > 0 }
  );
  const createObjMut = trpc.warehouse.objectives.create.useMutation({ onSuccess: () => { refetchObjectives(); toast.success('Objetivo creado'); } });
  const updateObjMut = trpc.warehouse.objectives.update.useMutation({ onSuccess: () => { refetchObjectives(); toast.success('Objetivo actualizado'); } });
  const deleteObjMut = trpc.warehouse.objectives.delete.useMutation({ onSuccess: () => { refetchObjectives(); refetchAttendance(); toast.success('Objetivo eliminado'); } });
  const toggleAttMut = trpc.warehouse.attendance.toggle.useMutation({ onSuccess: () => { refetchAttendance(); } });
  const cleanupObjMut = trpc.warehouse.objectives.cleanup.useMutation({ onSuccess: (d) => { refetchObjectives(); toast.success(`Limpieza: ${d.removed} objetivos eliminados`); } });
  const { data: deliveries = [], refetch: refetchDeliveries } = trpc.warehouse.deliveries.list.useQuery(
    { cpId: objCpId },
    { enabled: objCpId > 0 }
  );
  const setDeliveryQtyMut = trpc.warehouse.deliveries.setQuantity.useMutation({ onSuccess: () => { refetchDeliveries(); refetchObjectives(); } });
  const payAllDebtMut = trpc.warehouse.deliveries.payAllDebt.useMutation({ onSuccess: (d) => { refetchDeliveries(); refetchObjectives(); toast.success(`Deuda saldada (${d.updated} registros actualizados)`); } });
  // Daily attendance (independent of objectives)
  const { data: dailyAtt = [], refetch: refetchDailyAtt } = trpc.warehouse.dailyAttendance.list.useQuery(
    { cpId: objCpId, monthStart: objMonth },
    { enabled: objCpId > 0 }
  );
  const toggleDailyAttMut = trpc.warehouse.dailyAttendance.toggle.useMutation({ onSuccess: () => { refetchDailyAtt(); } });

  // Objectives settings
  const crossCpObjVisible = (whSettings as any)?.crossCpObjectivesVisibility === true;

  // Objectives form state
  const [showObjForm, setShowObjForm] = useState(false);
  const [objFormDate, setObjFormDate] = useState('');
  const [objFormTitle, setObjFormTitle] = useState('');
  const [objFormDesc, setObjFormDesc] = useState('');
  const [objFormMats, setObjFormMats] = useState<{name:string;quantity:number;imageUrl?:string;catalogId?:number}[]>([]);
  const [editObjId, setEditObjId] = useState<number | null>(null);
  const [expandedObjDay, setExpandedObjDay] = useState<string | null>(null);
  const [expandedObjDelivery, setExpandedObjDelivery] = useState<number | null>(null);
  const [showObjReport, setShowObjReport] = useState(false);
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void }>({ open: false, title: '', description: '', onConfirm: () => {} });

  const resetObjForm = () => { setShowObjForm(false); setObjFormDate(''); setObjFormTitle(''); setObjFormDesc(''); setObjFormMats([]); setEditObjId(null); };

  // Search / filters
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL');

  // Multi-row registration
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [pulseRowId, setPulseRowId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (id: string) => setRows(prev => (prev.length === 1 ? prev : prev.filter(r => r.id !== id)));

  // Withdraw modal
  const [withdrawItem, setWithdrawItem] = useState<any>(null);
  const [withdrawQty, setWithdrawQty] = useState('1');
  const [withdrawReason, setWithdrawReason] = useState('');

  // History modal
  const [historyItem, setHistoryItem] = useState<any>(null);

  // Edit item modal (SA only)
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const updateItemMut = trpc.warehouse.updateItem.useMutation({ onSuccess: () => { refetchItems(); toast.success('Item actualizado'); setEditingItem(null); } });

  // Delete with reason modal
  const [deleteReasonItem, setDeleteReasonItem] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Confirmation modals
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; label: string; color: string; action: () => void; itemName?: string; itemDetail?: string; itemImage?: string | null } | null>(null);

  // Recipe form
  // Recipe registration is now inline in the Crafteo tab (no modal)
  const [recipeName, setRecipeName] = useState('');
  const [recipeCategory, setRecipeCategory] = useState('');
  const [recipeImg, setRecipeImg] = useState('');
  const [recipeWiki, setRecipeWiki] = useState('');

  // Edit recipe state
  const [editRecipe, setEditRecipe] = useState<any>(null);
  const [editRecipeName, setEditRecipeName] = useState('');
  const [editRecipeCategory, setEditRecipeCategory] = useState('');
  const [editRecipeImg, setEditRecipeImg] = useState('');
  const [editRecipeWiki, setEditRecipeWiki] = useState('');
  // Recursive material node type
  type MaterialNode = {
    name: string; quantity: string; imageUrl: string;
    expanded: boolean;
    isCraftable: boolean;
    subMaterials: MaterialNode[];
  };
  const emptyNode = (): MaterialNode => ({ name: '', quantity: '1', imageUrl: '', expanded: false, isCraftable: false, subMaterials: [] });
  const [editRecipeMaterials, setEditRecipeMaterials] = useState<MaterialNode[]>([]);
  const [recipeMaterials, setRecipeMaterials] = useState<MaterialNode[]>([emptyNode()]);

  // Project form
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectRecipeId, setProjectRecipeId] = useState('');
  const [projectNotes, setProjectNotes] = useState('');
  const [projectPriority, setProjectPriority] = useState(false);
  const [projectCharSearch, setProjectCharSearch] = useState('');
  const [projectCharSelected, setProjectCharSelected] = useState('');
  const [projectPreviewOpen, setProjectPreviewOpen] = useState(false);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [expandedCompleted, setExpandedCompleted] = useState<number | null>(null);

  // Complete project modal (confirm only — character already assigned)
  const [completeProjectModal, setCompleteProjectModal] = useState<{ id: number; name: string } | null>(null);
  const [completeCharSearch, setCompleteCharSearch] = useState('');
  const [completeCharSelected, setCompleteCharSelected] = useState('');

  // Edit assignment modal (for completed projects)
  const [editAssignmentModal, setEditAssignmentModal] = useState<{ id: number; name: string; current: string } | null>(null);
  const [editCharSearch, setEditCharSearch] = useState('');
  const [editCharSelected, setEditCharSelected] = useState('');

  // Loaned filter
  const [loanedFilter, setLoanedFilter] = useState('ALL');

  // Filtered items (combines name search + category filter + stock filter + loaned filter)
  const filtered = useMemo(() => {
    const result = (warehouseItems as any[]).filter((i: any) => {
      const q = search.toLowerCase();
      const matchName = !q || String(i.name || '').toLowerCase().includes(q);
      const matchCat = catFilter === 'ALL' || i.category === catFilter;
      const qty = Number(i.quantity) || 0;
      const matchStock = stockFilter === 'ALL' || (stockFilter === 'IN_STOCK' && qty > 0) || (stockFilter === 'OUT_OF_STOCK' && qty === 0);
      // Loaned filter
      let matchLoaned = true;
      if (loanedFilter === 'LOANED') {
        matchLoaned = sentLoans.some((l: any) => Number(l.itemId) === Number(i.id) && !l.returned);
      } else if (loanedFilter === 'NOT_LOANED') {
        matchLoaned = !sentLoans.some((l: any) => Number(l.itemId) === Number(i.id) && !l.returned);
      }
      return matchName && matchCat && matchStock && matchLoaned;
    });
    // Sort: in-stock first, out-of-stock last
    result.sort((a: any, b: any) => {
      const aQty = Number(a.quantity) || 0;
      const bQty = Number(b.quantity) || 0;
      if (aQty > 0 && bQty === 0) return -1;
      if (aQty === 0 && bQty > 0) return 1;
      return 0;
    });
    return result;
  }, [warehouseItems, search, catFilter, stockFilter, loanedFilter, sentLoans]);

  const stockLookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of warehouseItems as any[]) {
      const key = String(item.nameLower || item.name || '').toLowerCase();
      m.set(key, (m.get(key) || 0) + (Number(item.quantity) || 0));
    }
    return m;
  }, [warehouseItems]);

  const totalItems = filtered.length;
  const totalUnits = filtered.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
  const allItems = (warehouseItems as any[]);
  const inStockCount = allItems.filter((i: any) => (Number(i.quantity) || 0) > 0).length;
  const outOfStockCount = allItems.filter((i: any) => (Number(i.quantity) || 0) === 0).length;
  const activeProjects = (projects as any[]).filter((p: any) => p.status === 'active').length;

  const handleCatalogSelect = (rowId: string, item: { name: string; category: string; imageUrl: string | null }) => {
    updateRow(rowId, {
      name: item.name,
      category: (item.category as ItemCategory) || '',
      imageUrl: item.imageUrl || '',
      quantity: '0',
    });
  };

  const handleCategoryChange = (rowId: string, newCat: ItemCategory | '') => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, category: newCat };
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);

    const invalidQtyRows = rows.filter(r => isInvalidQuantity(r.quantity));
    if (invalidQtyRows.length > 0) {
      const firstInvalid = invalidQtyRows[0];
      const firstIdx = rows.findIndex(r => r.id === firstInvalid.id);
      const el = rowRefs.current[firstInvalid.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPulseRowId(firstInvalid.id);
      window.setTimeout(() => setPulseRowId(null), 750);
      toast.error(
        invalidQtyRows.length === 1
          ? `Material #${firstIdx + 1}: ingresá una cantidad mayor a 0.`
          : `${invalidQtyRows.length} materiales necesitan una cantidad mayor a 0.`
      );
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.name.trim()) { toast.error(`Material #${i + 1}: Nombre es obligatorio`); return; }
      if (!r.category || !CATEGORIES.includes(r.category as ItemCategory)) { toast.error(`Material #${i + 1}: Seleccioná una categoría`); return; }
    }

    rows.forEach(r => {
      registerMut.mutate({
        name: r.name.trim(),
        category: r.category as string,
        quantity: parseInt(r.quantity, 10) || 1,
        imageUrl: r.imageUrl || undefined,
        cpId: selectedCpId || undefined,
      });
    });

    if (rows.length === 1) {
      toast.success(`Material "${rows[0].name.trim()}" registrado.`);
    } else {
      toast.success(`${rows.length} materiales registrados.`);
    }
    setRows([emptyRow()]);
    setTriedSubmit(false);
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
    const mapNodes = (nodes: MaterialNode[]): any[] => nodes.filter(n => n.name.trim()).map(n => ({
      name: n.name.trim(),
      quantity: Number(n.quantity) || 1,
      imageUrl: n.imageUrl || undefined,
      isCraftable: n.isCraftable || undefined,
      subMaterials: n.subMaterials.length > 0 ? mapNodes(n.subMaterials) : undefined,
    }));
    const mats = mapNodes(recipeMaterials);
    if (mats.length === 0) { toast.error('Agrega al menos 1 material'); return; }
    createRecipeMut.mutate({
      name: recipeName.trim(),
      category: recipeCategory || undefined,
      imageUrl: recipeImg || undefined,
      wikiUrl: recipeWiki || undefined,
      materials: mats,
    });
    setRecipeName(''); setRecipeCategory(''); setRecipeImg(''); setRecipeWiki('');
    setRecipeMaterials([emptyNode()]);
  };

  const handleCreateProject = () => {
    if (!projectRecipeId) { toast.error('Selecciona una receta'); return; }
    if (!projectCharSelected) { toast.error('Selecciona un personaje/cuenta'); return; }
    createProjectMut.mutate({
      recipeId: Number(projectRecipeId),
      notes: projectNotes || undefined,
      priority: projectPriority || undefined,
      assignedCharacter: projectCharSelected,
      cpId: selectedCpId || undefined,
    });
    setProjectOpen(false);
    setProjectRecipeId(''); setProjectNotes(''); setProjectPriority(false);
    setProjectCharSearch(''); setProjectCharSelected('');
  };

  // Recursive tree helpers — path = array of indices [0] = root, [0,2] = child of root at idx 2
  const updateNodeAt = (nodes: MaterialNode[], path: number[], updater: (n: MaterialNode) => MaterialNode): MaterialNode[] => {
    if (path.length === 1) return nodes.map((n, i) => i === path[0] ? updater(n) : n);
    return nodes.map((n, i) => i === path[0] ? { ...n, subMaterials: updateNodeAt(n.subMaterials, path.slice(1), updater) } : n);
  };
  const addNodeAt = (nodes: MaterialNode[], path: number[]): MaterialNode[] => {
    if (path.length === 0) return [...nodes, emptyNode()];
    return nodes.map((n, i) => i === path[0] ? { ...n, subMaterials: addNodeAt(n.subMaterials, path.slice(1)) } : n);
  };
  const removeNodeAt = (nodes: MaterialNode[], path: number[]): MaterialNode[] => {
    if (path.length === 1) return nodes.filter((_, i) => i !== path[0]);
    return nodes.map((n, i) => i === path[0] ? { ...n, subMaterials: removeNodeAt(n.subMaterials, path.slice(1)) } : n);
  };
  const addMaterialRow = () => setRecipeMaterials(prev => [...prev, emptyNode()]);
  const removeMaterialRow = (idx: number) => setRecipeMaterials(prev => prev.filter((_, i) => i !== idx));

  // Convert DB materials to MaterialNode format for editing
  const dbMatsToNodes = (mats: any[]): MaterialNode[] =>
    (mats || []).map((m: any) => ({
      name: m.name || '',
      quantity: String(m.quantity || 1),
      imageUrl: m.imageUrl || '',
      expanded: false,
      isCraftable: m.isCraftable || false,
      subMaterials: dbMatsToNodes(m.subMaterials),
    }));

  // Open edit modal with all recipe data including materials
  const openEditRecipe = (recipe: any) => {
    setEditRecipe(recipe);
    setEditRecipeName(recipe.name);
    setEditRecipeCategory(recipe.category || '');
    setEditRecipeImg(recipe.imageUrl || '');
    setEditRecipeWiki(recipe.wikiUrl || '');
    const nodes = dbMatsToNodes(recipe.materials);
    setEditRecipeMaterials(nodes.length > 0 ? nodes : [emptyNode()]);
  };

  // Reusable recipe materials tree renderer
  const renderRecipeMaterialsTree = () => {
    const palette = [
      { color: '#2dd4bf', bg: 'rgba(45,212,191,0.06)', border: 'rgba(45,212,191,0.25)', light: 'rgba(45,212,191,0.12)' },
      { color: '#a855f7', bg: 'rgba(168,85,247,0.06)', border: 'rgba(168,85,247,0.25)', light: 'rgba(168,85,247,0.12)' },
      { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', light: 'rgba(245,158,11,0.12)' },
      { color: '#ec4899', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.25)', light: 'rgba(236,72,153,0.12)' },
      { color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.25)', light: 'rgba(59,130,246,0.12)' },
      { color: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.25)', light: 'rgba(16,185,129,0.12)' },
    ];
    const getLevel = (d: number) => palette[d % palette.length];
    const renderNodes = (nodes: MaterialNode[], path: number[], depth: number): React.ReactNode => {
      const lv = getLevel(depth);
      const isRoot = depth === 0;
      return (
        <div className={isRoot ? 'space-y-3' : 'space-y-2'}>
          {nodes.map((node, idx) => {
            const currentPath = [...path, idx];
            const catMatch = (catalog as any[]).find((c: any) => String(c.name || '').toLowerCase() === node.name.trim().toLowerCase());
            const imgSrc = node.imageUrl || catMatch?.imageUrl || '';
            const subCount = node.subMaterials.length;
            if (isRoot) {
              return (
                <div key={idx} className="rounded-xl" style={{ border: `1px solid ${lv.border}`, background: 'rgba(255,255,255,0.015)' }}>
                  <div className="flex items-center justify-between px-3 py-2" style={{ background: lv.bg, borderBottom: `1px solid ${lv.border}` }}>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-5 rounded-full" style={{ background: lv.color }} />
                      {imgSrc && <img src={imgSrc} alt="" className="h-6 w-6 rounded object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                      <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>Material #{idx + 1}{node.name ? ` — ${node.name}` : ''}</span>
                      {subCount > 0 && !node.expanded && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: lv.light, color: lv.color }}>{subCount} sub</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, expanded: !n.expanded, subMaterials: !n.expanded && n.subMaterials.length === 0 ? [emptyNode()] : n.subMaterials })))} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all" style={{ background: node.expanded ? lv.light : 'rgba(255,255,255,0.03)', color: node.expanded ? lv.color : 'rgba(255,255,255,0.4)', border: `1px solid ${node.expanded ? lv.border : 'rgba(255,255,255,0.08)'}` }}>
                        {node.expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        Sub-materiales
                      </button>
                      {nodes.length > 1 && (
                        <button type="button" onClick={() => setRecipeMaterials(prev => removeNodeAt(prev, currentPath))} className="rounded-lg px-2 py-1 text-[10px] flex items-center gap-1" style={{ background: 'rgba(255,120,120,0.05)', border: '1px solid rgba(255,120,120,0.15)', color: 'rgba(255,120,120,0.7)' }}>
                          <Trash2 className="h-3 w-3" /> quitar
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3">
                    <input value={node.name} onChange={e => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, name: e.target.value })))} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} placeholder="Nombre material..." />
                    <input type="number" min="1" value={node.quantity} onChange={e => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, quantity: e.target.value })))} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} placeholder="Cant." />
                    <input value={node.imageUrl} onChange={e => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, imageUrl: e.target.value })))} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} placeholder="URL imagen..." />
                  </div>
                  {node.subMaterials.length > 0 && (
                    <div className="px-3 pb-2">
                      <button type="button" onClick={() => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, isCraftable: !n.isCraftable })))} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg font-semibold transition-all" style={{ background: node.isCraftable ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${node.isCraftable ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)'}`, color: node.isCraftable ? '#60a5fa' : 'rgba(255,255,255,0.4)' }}>
                        ⚒ {node.isCraftable ? 'Material padre (crafteable)' : 'Marcar como crafteable'}
                      </button>
                    </div>
                  )}
                  {node.expanded && (
                    <div className="px-2.5 pb-2.5 relative" style={{ paddingLeft: 20 }}>
                      <div className="absolute left-2 top-0 bottom-2 w-0.5 rounded-full" style={{ background: getLevel(depth + 1).border }} />
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1" style={{ color: getLevel(depth + 1).color }}>
                          <span className="w-1.5 h-0.5 rounded-full inline-block" style={{ background: getLevel(depth + 1).color }} />Sub-materiales
                        </p>
                        <button type="button" onClick={() => setRecipeMaterials(prev => addNodeAt(prev, currentPath))} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: getLevel(depth + 1).light, color: getLevel(depth + 1).color }}>
                          <Plus className="h-2 w-2" /> Añadir
                        </button>
                      </div>
                      {renderNodes(node.subMaterials, currentPath, depth + 1)}
                    </div>
                  )}
                </div>
              );
            }
            // Non-root compact row
            return (
              <div key={idx} className="rounded-lg" style={{ background: lv.bg, border: `1px solid ${lv.border}` }}>
                <div className="flex items-center gap-2 px-2.5 py-2">
                  {imgSrc && <img src={imgSrc} alt="" className="h-5 w-5 rounded object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                  <input value={node.name} onChange={e => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, name: e.target.value })))} className="flex-1 rounded px-2 py-1 text-[11px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' }} placeholder="Material..." />
                  <input type="number" min="1" value={node.quantity} onChange={e => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, quantity: e.target.value })))} className="w-14 rounded px-2 py-1 text-[11px] text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' }} />
                  <button type="button" onClick={() => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, isCraftable: !n.isCraftable })))} className="text-[9px] px-1 py-0.5 rounded shrink-0 font-semibold" style={{ background: node.isCraftable ? 'rgba(96,165,250,0.15)' : 'transparent', border: `1px solid ${node.isCraftable ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.1)'}`, color: node.isCraftable ? '#60a5fa' : 'rgba(255,255,255,0.3)' }} title="Marcar como material padre crafteable">
                    ⚒
                  </button>
                  <button type="button" onClick={() => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, expanded: !n.expanded, subMaterials: !n.expanded && n.subMaterials.length === 0 ? [emptyNode()] : n.subMaterials })))} className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0" style={{ background: node.expanded ? lv.light : 'transparent', color: lv.color }}>
                    {node.expanded ? <ChevronUp className="h-3 w-3 inline" /> : <Plus className="h-3 w-3 inline" />}
                  </button>
                  {nodes.length > 1 && (
                    <button type="button" onClick={() => setRecipeMaterials(prev => removeNodeAt(prev, currentPath))} className="shrink-0 rounded p-0.5" style={{ color: 'rgba(255,120,120,0.6)' }}><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
                {node.expanded && node.subMaterials.length > 0 && (
                  <div className="px-2.5 pb-2.5 relative" style={{ paddingLeft: 20 }}>
                    <div className="absolute left-2 top-0 bottom-2 w-0.5 rounded-full" style={{ background: getLevel(depth + 1).border }} />
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1" style={{ color: getLevel(depth + 1).color }}>
                        <span className="w-1.5 h-0.5 rounded-full inline-block" style={{ background: getLevel(depth + 1).color }} />Sub-materiales
                      </p>
                      <button type="button" onClick={() => setRecipeMaterials(prev => addNodeAt(prev, currentPath))} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: getLevel(depth + 1).light, color: getLevel(depth + 1).color }}>
                        <Plus className="h-2 w-2" /> Añadir
                      </button>
                    </div>
                    {renderNodes(node.subMaterials, currentPath, depth + 1)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    };
    return renderNodes(recipeMaterials, [], 0);
  };

  const validCount = rows.filter(r => r.name.trim() && r.category).length;

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Warehouse Clan</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Bodega del clan — materiales para crafteo. Los ítems se acumulan automáticamente al confirmar.
        </p>
      </div>

      {/* CP Selector */}
      {visibleCps.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 mr-1">
            <Shield className="h-4 w-4" style={{ color: '#e879f9' }} />
            <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>CP:</span>
          </div>
          {/* "Todas" button — only when cross-CP visibility is ON or user is SA */}
          {(isSA || !allowedCpIds) && (
            <button
              onClick={() => setSelectedCpId(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
              style={{
                background: selectedCpId === null ? 'linear-gradient(135deg, rgba(232,121,249,0.2), rgba(168,85,247,0.2))' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selectedCpId === null ? 'rgba(232,121,249,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: selectedCpId === null ? '#e879f9' : 'rgba(255,255,255,0.5)',
              }}
            >
              Todas
            </button>
          )}
          {visibleCps.map((cp: any) => {
            const isActive = selectedCpId === Number(cp.id);
            const isLeader = ledCpIds.includes(Number(cp.id));
            return (
              <button
                key={cp.id}
                onClick={() => setSelectedCpId(Number(cp.id))}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5"
                style={{
                  background: isActive ? 'linear-gradient(135deg, rgba(232,121,249,0.2), rgba(168,85,247,0.2))' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? 'rgba(232,121,249,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: isActive ? '#e879f9' : 'rgba(255,255,255,0.5)',
                }}
              >
                {cp.name}
                {isLeader && <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>Líder</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Tabs — pill style */}
      <div
        className="flex items-center gap-1 mb-5 rounded-xl p-1"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          type="button"
          onClick={() => setTab('bodega')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background: tab === 'bodega'
              ? 'linear-gradient(135deg, rgba(123,241,214,0.25), rgba(139,183,250,0.25))'
              : 'transparent',
            color: tab === 'bodega' ? '#7bf1d6' : 'rgba(255,255,255,0.55)',
            border: tab === 'bodega' ? '1px solid rgba(123,241,214,0.25)' : '1px solid transparent',
          }}
        >
          <Package className="h-4 w-4" />
          Bodega ({totalItems})
        </button>
        <button
          type="button"
          onClick={() => setTab('crafteo')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background: tab === 'crafteo'
              ? 'linear-gradient(135deg, rgba(232,121,249,0.25), rgba(167,139,250,0.25))'
              : 'transparent',
            color: tab === 'crafteo' ? '#e879f9' : 'rgba(255,255,255,0.55)',
            border: tab === 'crafteo' ? '1px solid rgba(232,121,249,0.25)' : '1px solid transparent',
          }}
        >
          <Hammer className="h-4 w-4" />
          Crafteo ({activeProjects})
        </button>
        <button
          type="button"
          onClick={() => setTab('objetivos')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background: tab === 'objetivos'
              ? 'linear-gradient(135deg, rgba(56,189,248,0.25), rgba(34,211,238,0.25))'
              : 'transparent',
            color: tab === 'objetivos' ? '#38bdf8' : 'rgba(255,255,255,0.55)',
            border: tab === 'objetivos' ? '1px solid rgba(56,189,248,0.25)' : '1px solid transparent',
          }}
        >
          <Target className="h-4 w-4" />
          Objetivos
        </button>
        <button
          type="button"
          onClick={() => setTab('config')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background: tab === 'config'
              ? 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.25))'
              : 'transparent',
            color: tab === 'config' ? '#fbbf24' : 'rgba(255,255,255,0.55)',
            border: tab === 'config' ? '1px solid rgba(251,191,36,0.25)' : '1px solid transparent',
          }}
        >
          <Settings className="h-4 w-4" />
          Config
        </button>
      </div>

      {/* ═══ TAB: BODEGA ═══ */}
      {tab === 'bodega' && (
        <div className="space-y-5">
          {/* Hint: SA must select a CP */}
          {isSA && !selectedCpId && (
            <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <AlertCircle className="h-4 w-4 shrink-0" style={{ color: '#fbbf24' }} />
              <p className="text-xs" style={{ color: 'rgba(251,191,36,0.8)' }}>Selecciona una CP arriba para registrar materiales o crear proyectos.</p>
            </div>
          )}
          {/* Received Loans — items lent TO this CP by other CPs */}
          {receivedLoans.length > 0 && (
            <div className="card-glass rounded-2xl p-4" style={{ border: '1px solid rgba(96,165,250,0.2)' }}>
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft className="h-4 w-4" style={{ color: '#60a5fa' }} />
                <h3 className="text-sm font-semibold" style={{ color: '#60a5fa' }}>Materiales prestados recibidos</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>{receivedLoans.length}</span>
              </div>
              <div className="space-y-2 max-h-[250px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(96,165,250,0.3) transparent' }}>
                {receivedLoans.map((loan: any) => {
                  const elapsed = Date.now() - new Date(loan.lentAt).getTime();
                  const days = Math.floor(elapsed / 86400000);
                  const hours = Math.floor((elapsed % 86400000) / 3600000);
                  const mins = Math.floor((elapsed % 3600000) / 60000);
                  const elapsedStr = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  return (
                    <div key={loan.id} className="rounded-xl p-3" style={{ background: 'rgba(96,165,250,0.04)', border: '1px solid rgba(96,165,250,0.1)' }}>
                      <div className="flex items-center gap-3">
                        {loan.itemImageUrl ? (
                          <img src={loan.itemImageUrl} className="h-10 w-10 rounded-lg object-cover shrink-0" alt="" style={{ border: '1px solid rgba(96,165,250,0.2)' }} />
                        ) : (
                          <div className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center text-sm" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>📦</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className="text-sm font-bold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{loan.itemName}</p>
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ml-2" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>PRESTADO</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            <span>De: <span style={{ color: 'rgba(96,165,250,0.8)' }}>{loan.fromCpName}</span></span>
                            <span>·</span>
                            <span className="font-mono font-bold" style={{ color: '#60a5fa' }}>{loan.quantity}×</span>
                            <span>·</span>
                            <span>Por: {loan.lentBy}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            <span>📅 {new Date(loan.lentAt).toLocaleDateString('es-CL')} {new Date(loan.lentAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span>·</span>
                            <span className="font-semibold" style={{ color: days > 3 ? '#ef4444' : days > 1 ? '#f59e0b' : '#22c55e' }}>⏱ {elapsedStr}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Registration Panel (card-glass, CreateItemPanel style) — requires CP selected */}
          {canRegister && selectedCpId && (
            <div className="card-glass rounded-2xl p-5 relative" style={{ zIndex: 20 }}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    <PackagePlus className="h-5 w-5" style={{ color: '#7bf1d6' }} />
                    Registro de Materiales
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Registrá materiales para la bodega. El autocompletado busca en el catálogo y copia
                    <strong style={{ color: 'rgba(255,255,255,0.7)' }}> nombre, categoría e imagen</strong>
                    {' '}— la cantidad siempre la ingresás vos.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Toolbar: counter + add */}
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Ítems <span style={{ color: '#f87171' }}>*</span> ({validCount})
                  </label>
                  <button
                    type="button"
                    onClick={addRow}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
                    style={{ background: 'rgba(123,241,214,0.1)', border: '1px solid rgba(123,241,214,0.25)', color: '#7bf1d6' }}
                  >
                    <Plus className="h-3 w-3" /> Añadir ítem
                  </button>
                </div>

                <div className="space-y-3">
                  {rows.map((row, idx) => {
                    const catOk = row.category && CATEGORIES.includes(row.category as ItemCategory);
                    const qtyInvalid = triedSubmit && isInvalidQuantity(row.quantity);
                    return (
                      <div
                        key={row.id}
                        ref={el => { rowRefs.current[row.id] = el; }}
                        className={`rounded-xl p-3 ${pulseRowId === row.id ? 'row-pulse-error' : ''}`}
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: `1px solid ${qtyInvalid ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.06)'}`,
                          transition: 'border-color 200ms ease',
                        }}
                      >
                        {/* Row header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                            Material #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            disabled={rows.length <= 1}
                            className="rounded-lg px-2 py-1 text-xs transition-all flex items-center gap-1"
                            style={{
                              background: 'rgba(255,120,120,0.05)',
                              border: '1px solid rgba(255,120,120,0.15)',
                              color: 'rgba(255,120,120,0.7)',
                              opacity: rows.length <= 1 ? 0.3 : 1,
                              cursor: rows.length <= 1 ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <Trash2 className="h-3 w-3" /> quitar
                          </button>
                        </div>

                        {/* Grid: name + cat + qty + image */}
                        <div className="grid gap-3 sm:grid-cols-12">
                          {/* Name with catalog typeahead */}
                          <div className="sm:col-span-4">
                            <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              Nombre del item <span style={{ color: '#f87171' }}>*</span>
                            </label>
                            <CatalogTypeahead
                              value={row.name}
                              onChange={v => updateRow(row.id, { name: v })}
                              onSelect={item => handleCatalogSelect(row.id, item)}
                              catalog={catalog as any[]}
                              placeholder="Ej: Draconic Leather"
                            />
                          </div>

                          {/* Category with FancySelect */}
                          <div className="sm:col-span-3">
                            <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              Categoría <span style={{ color: '#f87171' }}>*</span>
                            </label>
                            <FancySelect<ItemCategory | ''>
                              value={catOk ? (row.category as ItemCategory) : ''}
                              onChange={v => handleCategoryChange(row.id, v as ItemCategory | '')}
                              accent="turquoise"
                              size="md"
                              placeholder="-- Seleccionar --"
                              options={CATEGORIES.map<FancyOption<ItemCategory | ''>>(cat => {
                                const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                                return { value: cat, label: meta.label, emoji: meta.emoji };
                              })}
                            />
                          </div>

                          {/* Quantity */}
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              Cant. <span style={{ color: '#f87171' }}>*</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={row.quantity}
                              onChange={e => updateRow(row.id, { quantity: e.target.value })}
                              onFocus={e => { if (row.quantity === '0') { updateRow(row.id, { quantity: '' }); e.target.select?.(); } }}
                              placeholder="0"
                              className={`w-full rounded-lg px-2 py-1.5 text-xs ${qtyInvalid ? 'input-error' : ''}`}
                              style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: `1px solid ${qtyInvalid ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                color: 'rgba(255,255,255,0.9)',
                                height: 36,
                              }}
                              aria-invalid={qtyInvalid}
                            />
                            {qtyInvalid && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] font-medium" style={{ color: '#f87171', whiteSpace: 'nowrap' }}>
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                <span>debe ser &gt; 0</span>
                              </div>
                            )}
                          </div>

                          {/* Image preview */}
                          <div className="sm:col-span-3">
                            <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              Imagen
                            </label>
                            <div
                              className="rounded-lg overflow-hidden flex items-center justify-center px-2 gap-2"
                              style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)', height: 36 }}
                              title={row.imageUrl ? 'Asignada desde catálogo' : 'Elegí del catálogo o una categoría'}
                            >
                              {row.imageUrl ? (
                                <>
                                  <img src={row.imageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  <span className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                    auto · {catOk ? row.category : ''}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <ImageIcon className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    elegí categoría
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={registerMut.isPending}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                  style={{
                    background: 'linear-gradient(135deg, rgba(123,241,214,0.2), rgba(139,183,250,0.2))',
                    border: '1px solid rgba(123,241,214,0.35)',
                    color: '#7bf1d6',
                    opacity: registerMut.isPending ? 0.5 : 1,
                    cursor: registerMut.isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {registerMut.isPending
                    ? 'Registrando…'
                    : rows.length === 1
                    ? 'Registrar item'
                    : `Registrar ${rows.length} items`}
                </button>
              </form>
            </div>
          )}

          {/* Incoming (pending confirmation) */}
          {(incoming as any[]).length > 0 && (
            <div className="card-glass rounded-2xl p-5" style={{ borderColor: 'rgba(251,191,36,0.15)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: '#fbbf24' }}>
                ⏳ Pendientes de confirmación ({(incoming as any[]).length})
              </p>
              <div className="space-y-1.5">
                {(incoming as any[]).map((inc: any) => (
                  <div key={inc.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-3 text-sm">
                      {inc.imageUrl && <img src={inc.imageUrl} alt="" className="h-6 w-6 rounded object-cover" />}
                      <span style={{ color: 'rgba(255,255,255,0.8)' }}>{inc.name}</span>
                      {(() => {
                        const meta = categoryMeta[inc.category];
                        return meta ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30`, color: meta.color }}>
                            {meta.emoji} {meta.label}
                          </span>
                        ) : null;
                      })()}
                      <span className="font-mono font-bold" style={{ color: '#60a5fa' }}>×{inc.quantity}</span>
                      {(() => { const cp = (warehouseCps as any[]).find((c: any) => Number(c.id) === Number(inc.cpId)); return cp ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(232,121,249,0.1)', border: '1px solid rgba(232,121,249,0.25)', color: '#e879f9' }}>{cp.name}</span> : null; })()}
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>por {inc.registeredBy}</span>
                    </div>
                    {(isSA || canWriteSelected) && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setConfirmAction({
                            title: 'Confirmar material',
                            message: `¿Confirmar "${inc.name}" ×${inc.quantity}? Se agrupará con el stock existente.`,
                            label: 'Confirmar',
                            color: '#34d399',
                            action: () => { confirmMut.mutate({ id: Number(inc.id) }); setConfirmAction(null); },
                            itemName: inc.name,
                            itemDetail: `${(() => { const m = categoryMeta[inc.category]; return m ? m.emoji + ' ' + m.label : inc.category; })()} · ×${inc.quantity}`,
                            itemImage: inc.imageUrl || null,
                          })}
                          className="p-1.5 rounded-lg" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }} title="Confirmar"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmAction({
                            title: 'Rechazar material',
                            message: `¿Eliminar el registro pendiente de "${inc.name}" ×${inc.quantity}? Esta acción no se puede deshacer.`,
                            label: 'Sí, eliminar',
                            color: '#ef4444',
                            action: () => { deleteIncomingMut.mutate({ id: Number(inc.id) }); setConfirmAction(null); },
                            itemName: inc.name,
                            itemDetail: `Pendiente · ×${inc.quantity} · por ${inc.registeredBy}`,
                            itemImage: inc.imageUrl || null,
                          })}
                          className="p-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }} title="Rechazar"
                        >
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
          <div className="card-glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  Warehouse Items
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(123,241,214,0.15)', color: '#7bf1d6' }}>{totalItems}</span>
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Unid: {totalUnits.toLocaleString()} · Con stock: {inStockCount} · Sin stock: {outOfStockCount}
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="grid gap-3 items-center mb-4" style={{ gridTemplateColumns: '1fr 200px 180px 180px' }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <input
                  type="text" placeholder="Buscar por nombre..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-lg pl-10 pr-3 py-2 text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}
                />
              </div>
              <div>
                <FancySelect<string>
                  value={catFilter}
                  onChange={setCatFilter}
                  accent="turquoise"
                  size="md"
                  placeholder="Todas las categorías"
                  options={[
                    { value: 'ALL', label: 'Todas las categorías', emoji: '📦' },
                    ...CATEGORIES.map(cat => {
                      const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                      return { value: cat, label: meta.label, emoji: meta.emoji };
                    }),
                  ]}
                />
              </div>
              <div>
                <FancySelect<string>
                  value={stockFilter}
                  onChange={setStockFilter}
                  accent="turquoise"
                  size="md"
                  placeholder="Todos los estados"
                  options={[
                    { value: 'ALL', label: 'Todos los estados', emoji: '📋' },
                    { value: 'IN_STOCK', label: 'Con stock', emoji: '✅' },
                    { value: 'OUT_OF_STOCK', label: 'Sin stock', emoji: '❌' },
                  ]}
                />
              </div>
              <div>
                <FancySelect<string>
                  value={loanedFilter}
                  onChange={setLoanedFilter}
                  accent="turquoise"
                  size="md"
                  placeholder="Préstamos"
                  options={[
                    { value: 'ALL', label: 'Todos', emoji: '📋' },
                    { value: 'LOANED', label: 'Con préstamo activo', emoji: '🔄' },
                    { value: 'NOT_LOANED', label: 'Sin préstamo', emoji: '✔️' },
                  ]}
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>IMG</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>NOMBRE</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>CP</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>CATEGORÍA</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>CANTIDAD</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>ESTADO</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      No hay materiales en la bodega.
                    </td></tr>
                  )}
                  {filtered.map((item: any) => {
                    const qty = Number(item.quantity) || 0;
                    const inStock = qty > 0;
                    const meta = categoryMeta[item.category] || { emoji: '📦', label: item.category, color: '#7bf1d6' };
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3">
                          <ImageHoverPreview src={item.imageUrl} caption={item.name} size={280}>
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover border" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                            ) : (
                              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <Package className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                              </div>
                            )}
                          </ImageHoverPreview>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{item.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const cp = (warehouseCps as any[]).find((c: any) => Number(c.id) === Number(item.cpId));
                            return cp ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(232,121,249,0.1)', border: '1px solid rgba(232,121,249,0.25)', color: '#e879f9' }}>
                                {cp.name}
                              </span>
                            ) : (
                              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30`, color: meta.color }}>
                            {meta.emoji} {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-sm" style={{ color: inStock ? '#34d399' : '#ef4444' }}>
                            {qty.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{
                            background: inStock ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${inStock ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
                            color: inStock ? '#34d399' : '#ef4444',
                          }}>
                            {inStock ? '✅ Con stock' : '❌ Sin stock'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {(isAdminOrAbove || canWriteSelected) && (
                              <button
                                onClick={inStock ? () => { setWithdrawItem(item); setWithdrawQty('1'); setWithdrawReason(''); } : undefined}
                                disabled={!inStock}
                                className="btn-ghost p-2"
                                style={{ color: inStock ? '#fbbf24' : 'rgba(251,191,36,0.35)', borderColor: inStock ? 'rgba(251,191,36,0.25)' : 'rgba(251,191,36,0.08)', background: inStock ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.02)', opacity: inStock ? 1 : 0.4, cursor: inStock ? 'pointer' : 'not-allowed' }}
                                title={inStock ? 'Descontar' : 'Sin stock'}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {(() => {
                              const hasHistory = (warehouseHistory as any[]).some((h: any) => Number(h.itemId) === Number(item.id));
                              return (
                                <button
                                  onClick={hasHistory ? () => setHistoryItem(item) : undefined}
                                  disabled={!hasHistory}
                                  className="btn-ghost p-2"
                                  title={hasHistory ? `Historial de movimientos` : 'Sin historial'}
                                  style={{
                                    color: hasHistory ? '#a78bfa' : 'rgba(255,255,255,0.2)',
                                    borderColor: hasHistory ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.04)',
                                    background: hasHistory ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.02)',
                                    opacity: hasHistory ? 1 : 0.4,
                                    cursor: hasHistory ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[13px] font-black leading-none">H</span>
                                </button>
                              );
                            })()}
                            {(() => {
                              const itemLoans = sentLoans.filter((l: any) => Number(l.itemId) === Number(item.id));
                              const hasPending = itemLoans.some((l: any) => !l.returned);
                              const hasAny = itemLoans.length > 0;
                              return (
                                <button
                                  onClick={hasPending ? () => setLoansModalCpId(Number(item.cpId) || effectiveCpId || 0) : undefined}
                                  disabled={!hasPending}
                                  className="btn-ghost p-2"
                                  title={hasAny ? `Préstamos${hasPending ? ' (pendientes)' : ''}` : 'Sin préstamos'}
                                  style={{
                                    color: hasPending ? '#22c55e' : 'rgba(255,255,255,0.2)',
                                    borderColor: hasPending ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.04)',
                                    background: hasPending ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
                                    opacity: hasPending ? 1 : 0.4,
                                    cursor: hasPending ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[13px] font-black leading-none">P</span>
                                </button>
                              );
                            })()}
                            {isSA && (
                              <button
                                onClick={() => { setEditingItem(item); setEditCategory(item.category || ''); setEditQuantity(String(Number(item.quantity) || 0)); }}
                                className="btn-ghost p-2"
                                title="Editar (Super Admin)"
                                style={{ color: '#60a5fa', borderColor: 'rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.08)' }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {(isSA || canWriteSelected) && (
                              <button
                                onClick={() => { setDeleteReasonItem(item); setDeleteReason(''); }}
                                className="btn-ghost p-2"
                                style={{ color: 'rgba(255,120,120,0.7)', borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)' }}
                                title="Eliminar"
                              >
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
        </div>
      )}

      {/* ═══ TAB: CRAFTEO ═══ */}
      {tab === 'crafteo' && (
        <div className="space-y-5">
          {/* Recipe Registration moved to Config tab */}
          {false && isSA && (
            <div className="card-glass rounded-2xl p-5 relative" style={{ zIndex: 20 }}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    <Hammer className="h-5 w-5" style={{ color: '#c084fc' }} />
                    Registro de Recetas
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Define el ítem final y los materiales necesarios. Los materiales pueden tener <strong style={{ color: 'rgba(255,255,255,0.7)' }}>sub-materiales</strong>.
                  </p>
                </div>
              </div>

              {/* Recipe item final */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Nombre del ítem final <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <input value={recipeName} onChange={e => setRecipeName(e.target.value)} className="w-full rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', height: 36 }} placeholder="Lance, Majestic Plate Armor..." />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>Categoría</label>
                  <FancySelect<string>
                    value={recipeCategory || null}
                    onChange={(v) => setRecipeCategory(v)}
                    accent="purple"
                    size="sm"
                    placeholder="— Seleccionar —"
                    options={CATEGORIES.map((c: string) => ({
                      value: c,
                      label: categoryMeta[c as ItemCategory]?.label || c,
                      emoji: categoryMeta[c as ItemCategory]?.emoji || '📦',
                    }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>URL Wiki</label>
                  <input value={recipeWiki} onChange={e => setRecipeWiki(e.target.value)} className="w-full rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', height: 36 }} placeholder="https://wikipedia1.mw2.wiki/..." />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>URL Imagen</label>
                  <input value={recipeImg} onChange={e => setRecipeImg(e.target.value)} className="w-full rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', height: 36 }} placeholder="https://..." />
                </div>
              </div>

              {/* Materials */}
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Materiales <span style={{ color: '#f87171' }}>*</span> ({recipeMaterials.filter(m => m.name.trim()).length})
                </label>
                <button type="button" onClick={addMaterialRow} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all" style={{ background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.25)', color: '#c084fc' }}>
                  <Plus className="h-3 w-3" /> Añadir material
                </button>
              </div>

              {/* Recursive material node renderer — improved compact design */}
              {(() => {
                // Distinct color palette cycling for unlimited depth
                const palette = [
                  { color: '#2dd4bf', bg: 'rgba(45,212,191,0.06)', border: 'rgba(45,212,191,0.25)', light: 'rgba(45,212,191,0.12)' },  // teal
                  { color: '#a855f7', bg: 'rgba(168,85,247,0.06)', border: 'rgba(168,85,247,0.25)', light: 'rgba(168,85,247,0.12)' },  // purple
                  { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', light: 'rgba(245,158,11,0.12)' },  // amber
                  { color: '#ec4899', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.25)', light: 'rgba(236,72,153,0.12)' },  // pink
                  { color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.25)', light: 'rgba(59,130,246,0.12)' },  // blue
                  { color: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.25)', light: 'rgba(16,185,129,0.12)' },  // emerald
                ];
                const getLevel = (d: number) => palette[d % palette.length];

                const renderNodes = (nodes: MaterialNode[], path: number[], depth: number): React.ReactNode => {
                  const lv = getLevel(depth);
                  const isRoot = depth === 0;

                  return (
                    <div className={isRoot ? 'space-y-3' : 'space-y-2'}>
                      {nodes.map((node, idx) => {
                        const currentPath = [...path, idx];
                        const catMatch = (catalog as any[]).find((c: any) => String(c.name || '').toLowerCase() === node.name.trim().toLowerCase());
                        const imgSrc = node.imageUrl || catMatch?.imageUrl || '';
                        const subCount = node.subMaterials.length;
                        const collapsedNames = !node.expanded && subCount > 0 ? node.subMaterials.filter(s => s.name.trim()).map(s => s.name.trim()) : [];

                        if (isRoot) {
                          // === ROOT LEVEL: Full card with labels ===
                          return (
                            <div key={idx} className="rounded-xl" style={{ border: `1px solid ${lv.border}`, background: 'rgba(255,255,255,0.015)' }}>
                              {/* Header bar */}
                              <div className="flex items-center justify-between px-3 py-2" style={{ background: lv.bg, borderBottom: `1px solid ${lv.border}` }}>
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-5 rounded-full" style={{ background: lv.color }} />
                                  {imgSrc && <img src={imgSrc} alt="" className="h-6 w-6 rounded object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                                  <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                    Material #{idx + 1}{node.name ? ` — ${node.name}` : ''}
                                  </span>
                                  {subCount > 0 && !node.expanded && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: lv.light, color: lv.color }}>{subCount} sub</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button type="button" onClick={() => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, expanded: !n.expanded, subMaterials: !n.expanded && n.subMaterials.length === 0 ? [emptyNode()] : n.subMaterials })))} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all" style={{ background: node.expanded ? lv.light : 'rgba(255,255,255,0.03)', color: node.expanded ? lv.color : 'rgba(255,255,255,0.4)', border: `1px solid ${node.expanded ? lv.border : 'rgba(255,255,255,0.08)'}` }}>
                                    {node.expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    Sub-materiales
                                  </button>
                                  {nodes.length > 1 && (
                                    <button type="button" onClick={() => setRecipeMaterials(prev => removeNodeAt(prev, currentPath))} className="rounded-lg px-2 py-1 text-[10px] flex items-center gap-1" style={{ background: 'rgba(255,120,120,0.05)', border: '1px solid rgba(255,120,120,0.15)', color: 'rgba(255,120,120,0.7)' }}>
                                      <Trash2 className="h-3 w-3" /> quitar
                                    </button>
                                  )}
                                </div>
                              </div>
                              {/* Fields */}
                              <div className="p-3">
                                <div className="grid gap-3 sm:grid-cols-12">
                                  <div className="sm:col-span-5">
                                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Nombre <span style={{ color: '#f87171' }}>*</span></label>
                                    <CatalogTypeahead catalog={catalog as any[]} value={node.name} onChange={val => {
                                      setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, name: val })));
                                    }} onSelect={item => {
                                      setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, name: item.name, imageUrl: item.imageUrl || n.imageUrl })));
                                    }} />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Cant. <span style={{ color: '#f87171' }}>*</span></label>
                                    <input type="number" min="1" value={node.quantity} onChange={e => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, quantity: e.target.value })))} className="w-full rounded-lg px-2 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)', height: 36 }} />
                                  </div>
                                  <div className="sm:col-span-5">
                                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Imagen</label>
                                    <div className="rounded-lg overflow-hidden flex items-center justify-center px-2 gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)', height: 36 }}>
                                      {imgSrc ? (
                                        <>
                                          <img src={imgSrc} alt="" className="h-7 w-7 rounded object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                          <span className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>auto · catálogo</span>
                                        </>
                                      ) : (
                                        <>
                                          <ImageIcon className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                                          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>buscar en catálogo</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {/* Crafteable toggle */}
                                {node.subMaterials.length > 0 && (
                                  <div className="mt-2">
                                    <button type="button" onClick={() => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, isCraftable: !n.isCraftable })))} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg font-semibold transition-all" style={{ background: node.isCraftable ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${node.isCraftable ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)'}`, color: node.isCraftable ? '#60a5fa' : 'rgba(255,255,255,0.4)' }}>
                                      ⚒ {node.isCraftable ? 'Material padre (crafteable)' : 'Marcar como crafteable'}
                                    </button>
                                  </div>
                                )}
                                {/* Collapsed summary chips */}
                                {!node.expanded && collapsedNames.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {collapsedNames.map((n, i) => (
                                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: getLevel(depth + 1).light, color: getLevel(depth + 1).color }}>{n}</span>
                                    ))}
                                  </div>
                                )}
                                {/* Expanded sub-materials */}
                                {node.expanded && (
                                  <div className="mt-3 relative" style={{ paddingLeft: 16 }}>
                                    <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full" style={{ background: getLevel(depth + 1).border }} />
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5" style={{ color: getLevel(depth + 1).color }}>
                                        <span className="w-2 h-0.5 rounded-full inline-block" style={{ background: getLevel(depth + 1).color }} />
                                        Sub-materiales de {node.name || `material #${idx + 1}`}
                                      </p>
                                      <button type="button" onClick={() => setRecipeMaterials(prev => addNodeAt(prev, currentPath))} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: getLevel(depth + 1).light, color: getLevel(depth + 1).color }}>
                                        <Plus className="h-2.5 w-2.5" /> Añadir
                                      </button>
                                    </div>
                                    {renderNodes(node.subMaterials, currentPath, depth + 1)}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // === NESTED LEVELS: Compact inline rows ===
                        return (
                          <div key={idx} className="rounded-lg" style={{ background: lv.bg, border: `1px solid ${lv.border}` }}>
                            {/* Compact inline row: color dot + image + name + qty + actions */}
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <div className="w-1 h-6 rounded-full shrink-0" style={{ background: lv.color }} />
                              {imgSrc ? (
                                <img src={imgSrc} alt="" className="h-6 w-6 rounded object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <div className="h-6 w-6 rounded shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                  <ImageIcon className="h-3 w-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <CatalogTypeahead catalog={catalog as any[]} value={node.name} onChange={val => {
                                  setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, name: val })));
                                }} onSelect={item => {
                                  setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, name: item.name, imageUrl: item.imageUrl || n.imageUrl })));
                                }} />
                              </div>
                              <div className="w-16 shrink-0">
                                <input type="number" min="1" value={node.quantity} onChange={e => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, quantity: e.target.value })))} className="w-full rounded-lg px-2 py-1 text-xs text-center" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${lv.border}`, color: 'rgba(255,255,255,0.9)', height: 30 }} />
                              </div>
                              <button type="button" onClick={() => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, isCraftable: !n.isCraftable })))} className="text-[9px] px-1 py-0.5 rounded shrink-0 font-semibold" style={{ background: node.isCraftable ? 'rgba(96,165,250,0.15)' : 'transparent', border: `1px solid ${node.isCraftable ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.1)'}`, color: node.isCraftable ? '#60a5fa' : 'rgba(255,255,255,0.3)' }} title="Marcar como material padre crafteable">
                                ⚒
                              </button>
                              <button type="button" onClick={() => setRecipeMaterials(prev => updateNodeAt(prev, currentPath, n => ({ ...n, expanded: !n.expanded, subMaterials: !n.expanded && n.subMaterials.length === 0 ? [emptyNode()] : n.subMaterials })))} className="p-1 rounded shrink-0" style={{ color: node.expanded ? lv.color : 'rgba(255,255,255,0.3)' }} title="Sub-materiales">
                                {node.expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                              {subCount > 0 && !node.expanded && (
                                <span className="text-[10px] px-1 py-0.5 rounded-full shrink-0" style={{ background: lv.light, color: lv.color }}>{subCount}</span>
                              )}
                              <button type="button" onClick={() => setRecipeMaterials(prev => removeNodeAt(prev, currentPath))} className="p-1 rounded shrink-0" style={{ color: 'rgba(239,68,68,0.5)' }}><X className="h-3 w-3" /></button>
                            </div>
                            {/* Collapsed summary */}
                            {!node.expanded && collapsedNames.length > 0 && (
                              <div className="px-2.5 pb-2 flex flex-wrap gap-1" style={{ marginLeft: 12 }}>
                                {collapsedNames.map((n, i) => (
                                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: getLevel(depth + 1).light, color: getLevel(depth + 1).color }}>{n}</span>
                                ))}
                              </div>
                            )}
                            {/* Expanded children */}
                            {node.expanded && (
                              <div className="px-2.5 pb-2.5 relative" style={{ paddingLeft: 20 }}>
                                <div className="absolute left-2 top-0 bottom-2 w-0.5 rounded-full" style={{ background: getLevel(depth + 1).border }} />
                                <div className="flex items-center justify-between mb-1.5">
                                  <p className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1" style={{ color: getLevel(depth + 1).color }}>
                                    <span className="w-1.5 h-0.5 rounded-full inline-block" style={{ background: getLevel(depth + 1).color }} />
                                    Sub-materiales
                                  </p>
                                  <button type="button" onClick={() => setRecipeMaterials(prev => addNodeAt(prev, currentPath))} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: getLevel(depth + 1).light, color: getLevel(depth + 1).color }}>
                                    <Plus className="h-2 w-2" /> Añadir
                                  </button>
                                </div>
                                {renderNodes(node.subMaterials, currentPath, depth + 1)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                };
                return renderNodes(recipeMaterials, [], 0);
              })()}

              {/* Submit button */}
              <button
                type="button"
                onClick={handleCreateRecipe}
                disabled={createRecipeMut.isPending}
                className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all mt-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(192,132,252,0.2), rgba(168,85,247,0.2))',
                  border: '1px solid rgba(192,132,252,0.35)',
                  color: '#c084fc',
                }}
              >
                {createRecipeMut.isPending ? <><Loader2 className="inline h-4 w-4 mr-2 animate-spin" /> Creando...</> : <><Hammer className="inline h-4 w-4 mr-2" /> Crear Receta</>}
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>Proyectos Activos</h3>
              {(isSA || canWriteSelected) && selectedCpId && (
                <button onClick={() => setProjectOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                  <Hammer className="h-3.5 w-3.5" /> Nuevo Proyecto
                </button>
              )}
            </div>
            {(projects as any[]).filter((p: any) => p.status === 'active').length === 0 && (
              <div className="card-glass rounded-2xl p-8 text-center">
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay proyectos activos. {isSA ? 'Crea uno desde "Nuevo Proyecto".' : ''}</p>
              </div>
            )}
            <div className="space-y-3">
            {(projects as any[]).filter((p: any) => p.status === 'active').sort((a: any, b: any) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0)).map((project: any) => {
              const recipe = (recipes as any[]).find((r: any) => Number(r.id) === Number(project.recipeId));
              const materials = recipe?.materials || [];
              // Smart stock allocation with proportional sub-material calculation
              const stockPool = new Map<string, number>();
              for (const item of warehouseItems as any[]) {
                const key = String(item.nameLower || item.name || '').toLowerCase();
                stockPool.set(key, (stockPool.get(key) || 0) + (Number(item.quantity) || 0));
              }
              // parentScale: ratio (0-1) representing what fraction of this material is actually needed
              // e.g. if parent needs 232 but only 2 are missing, parentScale = 2/232 for sub-materials
              const countAllMats = (mats: any[], parentScale: number = 1): { total: number; completed: number } => {
                let total = 0, completed = 0;
                for (const m of mats) {
                  total++;
                  const key = String(m.nameLower || m.name || '').toLowerCase();
                  const recipeQty = Number(m.quantity) || 0;
                  const craftNeed = Math.ceil(recipeQty * parentScale);
                  const available = stockPool.get(key) || 0;
                  const isCovered = craftNeed <= 0 || available >= craftNeed;
                  if (isCovered) {
                    completed++;
                    if (craftNeed > 0) stockPool.set(key, available - craftNeed);
                  }
                  if (m.subMaterials?.length) {
                    // Calculate scale for children: if this material is covered, children need 0
                    // Otherwise, propagate the deficit ratio downward
                    let childScale = 0;
                    if (!isCovered && recipeQty > 0) {
                      const deficit = Math.max(0, craftNeed - available);
                      childScale = deficit / recipeQty;
                    }
                    const sub = countAllMats(m.subMaterials, childScale);
                    total += sub.total;
                    completed += sub.completed;
                  }
                }
                return { total, completed };
              };
              const { total: totalMats, completed: completedMats } = countAllMats(materials);
              const progress = totalMats > 0 ? Math.round((completedMats / totalMats) * 100) : 0;
              const isExpanded = expandedProject === Number(project.id);
              const isPriority = !!project.priority;

              // Check if all base materials (no sub-materials) are covered → ready to craft
              const checkBaseCovered = (mats: any[], pScale: number = 1): { allBaseCovered: boolean; hasUncoveredCraftable: boolean } => {
                const bPool = new Map<string, number>();
                for (const item of warehouseItems as any[]) {
                  const k = String(item.nameLower || item.name || '').toLowerCase();
                  bPool.set(k, (bPool.get(k) || 0) + (Number(item.quantity) || 0));
                }
                let allBase = true;
                let hasUncraftable = false;
                const walk = (ms: any[], ps: number) => {
                  for (const m of ms) {
                    const k = String(m.nameLower || m.name || '').toLowerCase();
                    const rq = Number(m.quantity) || 0;
                    const cn = Math.ceil(rq * ps);
                    const av = bPool.get(k) || 0;
                    const covered = cn <= 0 || av >= cn;
                    if (covered && cn > 0) bPool.set(k, av - cn);
                    const subs = m.subMaterials || [];
                    if (subs.length === 0) {
                      // Base material
                      if (!covered) allBase = false;
                    } else {
                      // Crafteable material
                      if (!covered) hasUncraftable = true;
                      let cs = 0;
                      if (!covered && rq > 0) cs = Math.max(0, cn - av) / rq;
                      walk(subs, cs);
                    }
                  }
                };
                walk(mats, pScale);
                return { allBaseCovered: allBase, hasUncoveredCraftable: hasUncraftable };
              };
              const { allBaseCovered, hasUncoveredCraftable } = checkBaseCovered(materials);
              const readyToCraft = allBaseCovered && hasUncoveredCraftable && progress < 100;

              return (
                <div key={project.id} className="card-glass rounded-2xl overflow-hidden" style={{ borderColor: isPriority ? 'rgba(251,191,36,0.3)' : 'rgba(168,85,247,0.15)' }}>
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => setExpandedProject(isExpanded ? null : Number(project.id))}>
                    <div className="flex items-center gap-3">
                      {isPriority ? <Star className="h-5 w-5 fill-current" style={{ color: '#fbbf24' }} /> : <span className="text-lg">🎯</span>}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>{project.recipeName}</p>
                          {isPriority && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>PRIORIDAD</span>}
                        </div>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {(() => { const cp = (warehouseCps as any[]).find((c: any) => Number(c.id) === Number(project.cpId)); return cp ? <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 mr-1.5 text-[10px] font-semibold" style={{ background: 'rgba(232,121,249,0.1)', border: '1px solid rgba(232,121,249,0.25)', color: '#e879f9' }}>{cp.name}</span> : null; })()}
                          Creado por {project.createdBy} · {new Date(project.createdAt).toLocaleDateString('es-CL')}
                          {project.assignedCharacter && <> · <span style={{ color: '#6ee7b7' }}>Para: {project.assignedCharacter}</span></>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
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
                  {isExpanded && (
                    <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      {recipe?.wikiUrl && (
                        <a href={recipe.wikiUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] mt-3 mb-3 px-2 py-1 rounded-lg" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}>
                          <ExternalLink className="h-3 w-3" /> Ver en Wiki
                        </a>
                      )}
                      {readyToCraft && (
                        <div className="flex items-center gap-3 mt-3 mb-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
                          <span style={{ fontSize: 22 }}>✅</span>
                          <div>
                            <p className="text-xs font-bold" style={{ color: '#34d399' }}>Tienes todos los materiales base</p>
                            <p className="text-[11px]" style={{ color: 'rgba(52,211,153,0.7)' }}>Ve al juego, craftea los materiales y guárdalos en la bodega para completar el proyecto.</p>
                          </div>
                        </div>
                      )}
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <th className="py-2 text-left font-semibold" style={{ color: 'rgba(255,255,255,0.3)', width: 32 }}>IMG</th>
                            <th className="py-2 text-left font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Material</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Necesario</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Tenemos</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Falta</th>
                            <th className="py-2 text-right font-semibold" style={{ color: 'rgba(96,165,250,0.6)' }}>Craftear</th>
                            <th className="py-2 text-center font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            // Separate pool for display rendering (the counting pool above already consumed stock)
                            const displayPool = new Map<string, number>();
                            for (const item of warehouseItems as any[]) {
                              const k = String(item.nameLower || item.name || '').toLowerCase();
                              displayPool.set(k, (displayPool.get(k) || 0) + (Number(item.quantity) || 0));
                            }
                            // PROPORTIONAL MODE: "Craftear" column shows what you actually need based on parent deficit.
                            // parentScale: ratio 0-1 indicating what fraction of this material's recipe qty is actually needed.
                            // For root materials parentScale = 1 (need the full amount). For sub-materials it's parentDeficit/parentRecipeQty.
                            const renderMatRows = (mats: any[], depth: number, parentKey: string, parentScale: number): React.ReactNode[] => {
                              const rows: React.ReactNode[] = [];
                              mats.forEach((mat: any, mi: number) => {
                                const key = `${parentKey}-${mi}`;
                                const recipeQty = Number(mat.quantity) || 0;
                                const matKey = String(mat.nameLower || mat.name || '').toLowerCase();
                                const poolAvail = displayPool.get(matKey) || 0;

                                // "Craftear": how many of this material you actually need to obtain
                                const craftNeed = Math.ceil(recipeQty * parentScale);

                                // Evaluate status against craftNeed (the proportional amount), not recipeQty
                                const isCovered = craftNeed <= 0 || poolAvail >= craftNeed;
                                // Deduct only what's needed (craftNeed) from pool, not the full recipe qty
                                const allocated = isCovered && craftNeed > 0 ? craftNeed : 0;
                                if (allocated > 0) displayPool.set(matKey, poolAvail - allocated);

                                // Display columns: "Tenemos" = available stock (capped at recipe qty), "Falta" = Necesario - Tenemos
                                const have = Math.min(poolAvail, recipeQty);
                                const missingFull = Math.max(0, recipeQty - have);
                                // "Craftear" NET: what you actually still need to obtain (demand minus what you have)
                                const craftNet = Math.max(0, craftNeed - poolAvail);
                                const status = isCovered ? 'complete' : poolAvail > 0 ? 'partial' : 'none';
                                const subs = mat.subMaterials || [];
                                const indent = depth * 20;

                                // Calculate child scale: propagate deficit ratio to sub-materials
                                let childScale = 0;
                                if (!isCovered && recipeQty > 0) {
                                  childScale = craftNet / recipeQty;
                                }

                                rows.push(
                                  <tr key={key} style={{ borderBottom: subs.length > 0 ? 'none' : '1px solid rgba(255,255,255,0.04)', background: isCovered ? 'rgba(52,211,153,0.04)' : 'transparent' }}>
                                    <td className="py-2">
                                      {mat.imageUrl ? (
                                        <img src={mat.imageUrl} alt="" className={depth === 0 ? 'h-6 w-6 rounded object-cover' : 'h-5 w-5 rounded object-cover'} />
                                      ) : (
                                        <div className={`${depth === 0 ? 'h-6 w-6' : 'h-5 w-5'} rounded flex items-center justify-center`} style={{ background: 'rgba(255,255,255,0.04)' }}>
                                          <Package className="h-3 w-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2" style={{ paddingLeft: indent }}>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {depth > 0 && <span className="text-[10px]" style={{ color: `rgba(168,85,247,${0.3 + depth * 0.1})` }}>└</span>}
                                        <span className={depth === 0 ? '' : 'text-[11px]'} style={{ color: isCovered ? '#34d399' : depth === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.65)', textDecoration: isCovered ? 'line-through' : 'none', fontWeight: subs.length > 0 ? 600 : 400 }}>{mat.name}</span>
                                        {subs.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>{subs.length} sub</span>}
                                        {(mat.isCraftable || subs.length > 0) && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa' }}>⚒ Crafteable</span>}
                                      </div>
                                    </td>
                                    <td className={`py-2 text-right font-mono ${depth > 0 ? 'text-[11px]' : ''}`} style={{ color: 'rgba(255,255,255,0.5)' }}>{recipeQty.toLocaleString()}</td>
                                    <td className={`py-2 text-right font-mono ${depth > 0 ? 'text-[11px]' : ''}`} style={{ color: have > 0 ? '#34d399' : 'rgba(255,255,255,0.3)' }}>{have.toLocaleString()}</td>
                                    <td className={`py-2 text-right font-mono font-bold ${depth > 0 ? 'text-[11px]' : ''}`} style={{ color: craftNet > 0 ? '#ef4444' : '#34d399' }}>{craftNet > 0 ? craftNet.toLocaleString() : '—'}</td>
                                    <td className={`py-2 text-right font-mono font-bold ${depth > 0 ? 'text-[11px]' : ''}`} style={{ color: !(mat.isCraftable || subs.length > 0) ? 'rgba(255,255,255,0.15)' : craftNet <= 0 ? '#34d399' : '#60a5fa' }}>{!(mat.isCraftable || subs.length > 0) ? '—' : craftNet > 0 ? craftNet.toLocaleString() : '—'}</td>
                                    <td className="py-2 text-center"><span style={{ fontSize: depth === 0 ? 14 : 12 }}>{status === 'complete' ? '✅' : status === 'partial' ? '⚠️' : '❌'}</span></td>
                                  </tr>
                                );
                                if (subs.length > 0) rows.push(...renderMatRows(subs, depth + 1, key, childScale));
                              });
                              return rows;
                            };
                            return renderMatRows(materials, 0, 'mat', 1);
                          })()}
                        </tbody>
                      </table>
                      {(isSA || canWriteSelected) && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {progress === 100 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setCompleteProjectModal({ id: Number(project.id), name: project.recipeName }); }}
                              className="px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5" style={{ background: 'linear-gradient(90deg, rgba(52,211,153,0.8), rgba(45,212,191,0.8))', color: '#fff', border: '1px solid rgba(52,211,153,0.5)' }}
                            >
                              <CheckCircle className="h-4 w-4" /> Crear Item
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditAssignmentModal({ id: Number(project.id), name: project.recipeName, current: project.assignedCharacter || '' }); setEditCharSelected(project.assignedCharacter || ''); setEditCharSearch(''); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}
                          >
                            <Pencil className="h-3.5 w-3.5" /> {project.assignedCharacter ? 'Cambiar personaje' : 'Asignar personaje'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePriorityMut.mutate({ id: Number(project.id) }); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1" style={{ background: isPriority ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)', color: isPriority ? '#fbbf24' : 'rgba(255,255,255,0.5)', border: `1px solid ${isPriority ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)'}` }}
                          >
                            <Star className={`h-3.5 w-3.5 ${isPriority ? 'fill-current' : ''}`} /> {isPriority ? 'Quitar prioridad' : 'Prioridad'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmAction({
                              title: 'Eliminar proyecto',
                              message: 'Esta acción eliminará el proyecto de forma permanente. No se puede deshacer.',
                              label: 'Sí, eliminar',
                              color: '#ef4444',
                              action: () => { deleteProjectMut.mutate({ id: Number(project.id) }); setConfirmAction(null); },
                              itemName: project.recipeName,
                              itemDetail: `Proyecto activo · ${completedMats}/${totalMats} materiales`,
                            }); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>Recetas Guardadas ({(recipes as any[]).length})</h3>
            {(recipes as any[]).length === 0 && (
              <div className="card-glass rounded-2xl p-6 text-center">
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay recetas. {isSA ? 'Crea una desde "Nueva Receta".' : ''}</p>
              </div>
            )}
            <div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {(recipes as any[]).map((recipe: any) => (
                <div key={recipe.id} className="card-glass rounded-xl overflow-hidden">
                  {/* Header with recipe image + name */}
                  <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'rgba(168,85,247,0.04)', borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
                    <ImageHoverPreview src={recipe.imageUrl} caption={recipe.name} size={280}>
                      {recipe.imageUrl ? (
                        <img src={recipe.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" style={{ border: '2px solid rgba(168,85,247,0.2)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)', border: '2px solid rgba(168,85,247,0.2)' }}>
                          <Hammer className="h-5 w-5" style={{ color: '#a855f7' }} />
                        </div>
                      )}
                    </ImageHoverPreview>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold truncate" style={{ color: 'rgba(255,255,255,0.95)' }}>{recipe.name}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{recipe.materials?.length || 0} materiales{recipe.materials?.some((m: any) => m.subMaterials?.length > 0) ? ' (con sub-materiales)' : ''}</p>
                    </div>
                    {/* Delete button removed from Crafteo — only available in Config tab */}
                  </div>
                  {/* Body */}
                  <div className="px-4 py-3">
                    <p className="text-[11px] mb-2.5 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>por {recipe.createdBy} · {recipe.createdAt ? new Date(recipe.createdAt).toLocaleDateString('es-CL') : ''}</p>
                    <div className="space-y-1.5 mb-3">
                      {(recipe.materials || []).slice(0, 5).map((m: any, mi: number) => (
                        <div key={mi} className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
                          {m.imageUrl ? (
                            <img src={m.imageUrl} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-5 w-5 rounded shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                              <ImageIcon className="h-3 w-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
                            </div>
                          )}
                          <span className="font-medium">{m.name}</span>
                          <span className="font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>×{m.quantity}</span>
                          {m.subMaterials?.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>{m.subMaterials.length} sub</span>}
                        </div>
                      ))}
                      {(recipe.materials || []).length > 5 && (
                        <p className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>+{recipe.materials.length - 5} materiales más...</p>
                      )}
                    </div>
                    {recipe.wikiUrl && (
                      <a href={recipe.wikiUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-all" style={{ background: 'rgba(96,165,250,0.08)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.15)' }}>
                        <ExternalLink className="h-3 w-3" /> Wiki
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </div>
          </div>

          {(() => {
            const completed = (projects as any[]).filter((p: any) => p.status === 'completed');
            if (completed.length === 0) return null;
            // Group by assignedCharacter
            const charGroups = new Map<string, any[]>();
            for (const p of completed) {
              const char = p.assignedCharacter || 'Sin asignar';
              if (!charGroups.has(char)) charGroups.set(char, []);
              charGroups.get(char)!.push(p);
            }
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>Proyectos Completados ({completed.length})</h3>
                </div>
                {Array.from(charGroups.entries()).map(([charName, charProjects]) => {
                  const isGroupExpanded = expandedCompleted === null ? true : expandedCompleted === charProjects[0]?.id;
                  return (
                  <div key={charName} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(52,211,153,0.15)' }}>
                    {/* Character group header — clickable to collapse/expand */}
                    <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors" style={{ background: 'rgba(52,211,153,0.08)', borderBottom: isGroupExpanded ? '1px solid rgba(52,211,153,0.1)' : 'none' }}
                      onClick={() => setExpandedCompleted(isGroupExpanded ? -1 : charProjects[0]?.id)}
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" style={{ color: '#6ee7b7' }} />
                        <span className="text-sm font-bold" style={{ color: '#6ee7b7' }}>{charName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
                          {charProjects.length} ítem{charProjects.length !== 1 ? 's' : ''}
                        </span>
                        {isGroupExpanded ? <ChevronUp className="h-3.5 w-3.5" style={{ color: 'rgba(52,211,153,0.5)' }} /> : <ChevronDown className="h-3.5 w-3.5" style={{ color: 'rgba(52,211,153,0.5)' }} />}
                      </div>
                    </div>
                    {/* Items in this character group — collapsible */}
                    {isGroupExpanded && (
                    <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                      {charProjects.map((project: any) => {
                        const recipeForCompleted = (recipes as any[]).find((r: any) => Number(r.id) === Number(project.recipeId));
                        const img = project.recipeImage || recipeForCompleted?.imageUrl || null;
                        const cat = project.recipeCategory || recipeForCompleted?.category || null;
                        const catInfo = cat ? categoryMeta[cat as ItemCategory] : null;
                        return (
                          <div key={project.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors" style={{ background: 'rgba(52,211,153,0.03)' }}>
                            <div className="flex items-center gap-3">
                              <ImageHoverPreview src={img} caption={project.recipeName} size={280}>
                                {img ? (
                                  <img src={img} alt="" className="h-8 w-8 rounded-lg object-cover" style={{ border: '1px solid rgba(52,211,153,0.2)' }} />
                                ) : (
                                  <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.08)' }}>
                                    <span className="text-base">✅</span>
                                  </div>
                                )}
                              </ImageHoverPreview>
                              <div>
                                <p className="text-sm font-bold" style={{ color: '#34d399' }}>{project.recipeName}</p>
                                <div className="flex items-center gap-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                  {catInfo && (
                                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.1)', color: '#c084fc' }}>
                                      {catInfo.emoji} {catInfo.label}
                                    </span>
                                  )}
                                  <span>{project.completedAt ? new Date(project.completedAt).toLocaleDateString('es-CL') : ''}</span>
                                </div>
                              </div>
                            </div>
                            {(isSA || canWriteSelected) && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => { setEditAssignmentModal({ id: Number(project.id), name: project.recipeName, current: project.assignedCharacter || '' }); setEditCharSelected(project.assignedCharacter || ''); setEditCharSearch(''); }}
                                  className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'rgba(96,165,250,0.6)' }}
                                  title="Editar asignación"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setConfirmAction({
                                    title: 'Eliminar proyecto completado',
                                    message: 'Se eliminará el registro del proyecto completado. No se puede deshacer.',
                                    label: 'Sí, eliminar',
                                    color: '#ef4444',
                                    action: () => { deleteProjectMut.mutate({ id: Number(project.id) }); setConfirmAction(null); },
                                    itemName: project.recipeName,
                                    itemDetail: `Completado ${project.completedAt ? new Date(project.completedAt).toLocaleDateString('es-CL') : ''}`,
                                    itemImage: img,
                                  })}
                                  className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'rgba(239,68,68,0.4)' }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ TAB: OBJETIVOS ═══ */}
      {tab === 'objetivos' && (
        <div className="space-y-5">
          {(() => {
            const ms = new Date(objMonth);
            const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const dayHeaders = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
            const cpName = (warehouseCps as any[]).find((cp: any) => Number(cp.id) === objCpId)?.name || '';
            const today = new Date().toISOString().slice(0, 10);

            // Build calendar grid for the month
            const year = ms.getFullYear();
            const month = ms.getMonth();
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
            const totalDays = lastDay.getDate();
            const calendarCells: ({ day: number; key: string } | null)[] = [];
            for (let i = 0; i < startDow; i++) calendarCells.push(null);
            for (let d = 1; d <= totalDays; d++) {
              const dt = new Date(year, month, d);
              calendarCells.push({ day: d, key: dt.toISOString().slice(0, 10) });
            }
            while (calendarCells.length % 7 !== 0) calendarCells.push(null);

            // Map objectives by day
            const objsByDay: Record<string, any[]> = {};
            (objectives as any[]).forEach((o: any) => {
              const dk = (o.date || '').slice(0, 10);
              if (!objsByDay[dk]) objsByDay[dk] = [];
              objsByDay[dk].push(o);
            });

            // Build maps
            const attMap: Record<number, Record<number, boolean>> = {};
            (attendance as any[]).forEach((a: any) => {
              if (!attMap[a.objectiveId]) attMap[a.objectiveId] = {};
              attMap[a.objectiveId][Number(a.userId)] = a.present;
            });
            // deliveryMap: objectiveId -> materialIndex -> userId -> { quantity, delivered }
            const deliveryMap: Record<number, Record<number, Record<number, { quantity: number; delivered: boolean }>>> = {};
            (deliveries as any[]).forEach((d: any) => {
              if (!deliveryMap[d.objectiveId]) deliveryMap[d.objectiveId] = {};
              if (!deliveryMap[d.objectiveId][d.materialIndex]) deliveryMap[d.objectiveId][d.materialIndex] = {};
              deliveryMap[d.objectiveId][d.materialIndex][Number(d.userId)] = { quantity: d.quantity || 0, delivered: d.delivered };
            });

            // dailyAttMap: date -> userId -> boolean
            const dailyAttMap: Record<string, Record<number, boolean>> = {};
            (dailyAtt as any[]).forEach((a: any) => {
              const dk = (a.date || '').slice(0, 10);
              if (!dailyAttMap[dk]) dailyAttMap[dk] = {};
              dailyAttMap[dk][Number(a.userId)] = a.present;
            });

            const canCreateObj = isSA || ledCpIds.includes(objCpId);
            const members = cpMembersChars as any[];
            const allObjs = objectives as any[];

            return (
              <>
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <Target className="h-5 w-5" style={{ color: '#38bdf8' }} />
                    <div>
                      <h3 className="text-base font-bold" style={{ color: '#fff' }}>Objetivos {cpName && `— ${cpName}`}</h3>
                      <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Calendario mensual de tareas y participación</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { const d = new Date(ms); d.setMonth(d.getMonth() - 1); setObjMonth(new Date(d.getFullYear(), d.getMonth(), 1).toISOString()); setExpandedObjDay(null); }} className="p-1.5 rounded-lg hover:bg-white/5 transition" style={{ color: 'rgba(255,255,255,0.5)' }}><ChevronLeft className="h-4 w-4" /></button>
                    <span className="text-xs font-bold px-3" style={{ color: 'rgba(255,255,255,0.8)' }}>
                      {monthNames[month]} {year}
                    </span>
                    <button onClick={() => { const d = new Date(ms); d.setMonth(d.getMonth() + 1); setObjMonth(new Date(d.getFullYear(), d.getMonth(), 1).toISOString()); setExpandedObjDay(null); }} className="p-1.5 rounded-lg hover:bg-white/5 transition" style={{ color: 'rgba(255,255,255,0.5)' }}><ChevronRight className="h-4 w-4" /></button>
                    <button onClick={() => { const n = new Date(); setObjMonth(new Date(n.getFullYear(), n.getMonth(), 1).toISOString()); setExpandedObjDay(null); }} className="text-[10px] px-2 py-1 rounded-lg font-medium" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>Hoy</button>
                    {allObjs.length > 0 && (
                      <button onClick={() => setShowObjReport(!showObjReport)} className="text-[10px] px-2.5 py-1 rounded-lg font-semibold" style={{ background: showObjReport ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.08)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' }}>
                        <Flag className="h-3 w-3 inline mr-1" />Informe
                      </button>
                    )}
                  </div>
                </div>

                {!effectiveCpId && (
                  <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                    <AlertCircle className="h-4 w-4 shrink-0" style={{ color: '#fbbf24' }} />
                    <p className="text-xs" style={{ color: '#fbbf24' }}>Selecciona una CP para ver los objetivos.</p>
                  </div>
                )}

                {effectiveCpId && (
                  <>
                    {/* Monthly calendar grid */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div className="grid grid-cols-7">
                        {dayHeaders.map(dh => (
                          <div key={dh} className="text-center py-2 text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{dh}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7">
                        {calendarCells.map((cell, ci) => {
                          if (!cell) return <div key={`empty-${ci}`} className="min-h-[72px]" style={{ background: 'rgba(0,0,0,0.15)', borderRight: ci % 7 !== 6 ? '1px solid rgba(255,255,255,0.04)' : 'none', borderBottom: '1px solid rgba(255,255,255,0.04)' }} />;
                          const dayObjs = objsByDay[cell.key] || [];
                          const isToday = cell.key === today;
                          const isSelected = expandedObjDay === cell.key;
                          const achieved = dayObjs.filter((o: any) => o.achieved).length;
                          const total = dayObjs.length;
                          const dayAttData = dailyAttMap[cell.key] || {};
                          const attCount = members.filter((m: any) => dayAttData[m.userId] === true).length;
                          return (
                            <button
                              key={cell.key}
                              type="button"
                              onClick={() => setExpandedObjDay(isSelected ? null : cell.key)}
                              className="min-h-[72px] p-1.5 text-left transition-all hover:bg-white/[0.02] relative"
                              style={{
                                background: isSelected ? 'rgba(56,189,248,0.12)' : isToday ? 'rgba(56,189,248,0.05)' : 'transparent',
                                borderRight: ci % 7 !== 6 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold" style={{ color: isToday ? '#38bdf8' : isSelected ? '#38bdf8' : 'rgba(255,255,255,0.6)' }}>{cell.day}</span>
                                {attCount > 0 && (
                                  <span className="text-[8px] font-semibold px-1 rounded" style={{ background: attCount === members.length ? 'rgba(34,197,94,0.2)' : 'rgba(251,191,36,0.15)', color: attCount === members.length ? '#22c55e' : '#fbbf24' }}>{attCount}/{members.length}</span>
                                )}
                              </div>
                              {total > 0 && (
                                <div className="mt-0.5">
                                  <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: achieved === total ? '#22c55e' : achieved > 0 ? '#f59e0b' : '#ef4444' }} />
                                    <span className="text-[9px] font-semibold" style={{ color: achieved === total ? '#22c55e' : achieved > 0 ? '#f59e0b' : '#ef4444' }}>{achieved}/{total}</span>
                                  </div>
                                  {dayObjs.slice(0, 2).map((o: any, oi: number) => (
                                    <p key={oi} className="text-[8px] truncate mt-0.5 leading-tight" style={{ color: o.achieved ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.35)' }}>{o.title}</p>
                                  ))}
                                  {dayObjs.length > 2 && <p className="text-[8px]" style={{ color: 'rgba(255,255,255,0.25)' }}>+{dayObjs.length - 2} más</p>}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Expanded day view */}
                    {expandedObjDay && (() => {
                      const dayObjs = objsByDay[expandedObjDay] || [];
                      const dayLabel = (() => {
                        const d = new Date(expandedObjDay + 'T12:00:00');
                        return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
                      })();

                      return (
                        <div className="rounded-xl p-4" style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.15)' }}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" style={{ color: '#38bdf8' }} />
                              <h4 className="text-sm font-bold capitalize" style={{ color: '#38bdf8' }}>{dayLabel}</h4>
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>{dayObjs.length} objetivo{dayObjs.length !== 1 ? 's' : ''}</span>
                            </div>
                            {canCreateObj && (
                              <button
                                onClick={() => { setObjFormDate(expandedObjDay); setEditObjId(null); setObjFormTitle(''); setObjFormDesc(''); setObjFormMats([]); setShowObjForm(true); }}
                                className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg font-semibold transition-all hover:scale-105"
                                style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}
                              >
                                <Plus className="h-3 w-3" /> Agregar objetivo
                              </button>
                            )}
                          </div>

                          {/* Daily attendance (always visible) */}
                          {(() => {
                            const dayAtt = dailyAttMap[expandedObjDay] || {};
                            const presentCount = members.filter((m: any) => dayAtt[m.userId] === true).length;
                            const allPresent = members.length > 0 && members.every((m: any) => dayAtt[m.userId] === true);
                            return (
                              <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.1)' }}>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <UserCheck className="h-3.5 w-3.5" style={{ color: '#22c55e' }} />
                                    <span className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>Asistencia del día ({presentCount}/{members.length})</span>
                                  </div>
                                  {canCreateObj && members.length > 0 && (
                                    <button
                                      onClick={() => {
                                        members.forEach((m: any) => {
                                          if (allPresent || !dayAtt[m.userId]) {
                                            toggleDailyAttMut.mutate({ cpId: objCpId, date: expandedObjDay, userId: m.userId, present: !allPresent });
                                          }
                                        });
                                      }}
                                      className="text-[9px] px-2.5 py-1 rounded-lg font-semibold"
                                      style={{ background: allPresent ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.12)', color: allPresent ? '#ef4444' : '#22c55e', border: `1px solid ${allPresent ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.25)'}` }}
                                    >
                                      {allPresent ? 'Desmarcar todos' : 'Marcar todos'}
                                    </button>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {members.map((m: any) => {
                                    const isPresent = dayAtt[m.userId] === true;
                                    return (
                                      <button
                                        key={m.userId}
                                        onClick={() => canCreateObj && toggleDailyAttMut.mutate({ cpId: objCpId, date: expandedObjDay, userId: m.userId, present: !isPresent })}
                                        className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg font-medium transition-all"
                                        style={{
                                          background: isPresent ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.08)',
                                          color: isPresent ? '#22c55e' : '#ef4444',
                                          border: `1px solid ${isPresent ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}`,
                                          cursor: canCreateObj ? 'pointer' : 'default',
                                        }}
                                      >
                                        {isPresent ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                        {m.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {dayObjs.length === 0 && (
                            <p className="text-xs text-center py-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Sin objetivos para este día</p>
                          )}

                          {dayObjs.map((obj: any) => {
                            const objAtt = attMap[obj.id] || {};
                            const presentCount = members.filter((m: any) => objAtt[m.userId]).length;

                            return (
                              <div key={obj.id} className="rounded-lg p-3 mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <button
                                      onClick={() => canCreateObj && updateObjMut.mutate({ id: obj.id, achieved: !obj.achieved })}
                                      className="mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all"
                                      style={{
                                        background: obj.achieved ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${obj.achieved ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.15)'}`,
                                        cursor: canCreateObj ? 'pointer' : 'default',
                                      }}
                                    >
                                      {obj.achieved && <Check className="h-3 w-3" style={{ color: '#22c55e' }} />}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold" style={{ color: obj.achieved ? '#22c55e' : 'rgba(255,255,255,0.9)', textDecoration: obj.achieved ? 'line-through' : 'none' }}>{obj.title}</p>
                                      {obj.description && <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{obj.description}</p>}
                                    </div>
                                  </div>
                                  {canCreateObj && (
                                    <div className="flex gap-1 shrink-0">
                                      <button onClick={() => { setEditObjId(obj.id); setObjFormDate(obj.date.slice(0, 10)); setObjFormTitle(obj.title); setObjFormDesc(obj.description || ''); setObjFormMats(obj.materials || []); setShowObjForm(true); }} className="p-1 rounded hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.4)' }}><Pencil className="h-3.5 w-3.5" /></button>
                                      <button onClick={() => setConfirmModal({ open: true, title: 'Eliminar objetivo', description: `¿Estás seguro de eliminar "${obj.title}"? Esta acción no se puede deshacer.`, onConfirm: () => deleteObjMut.mutate({ id: obj.id }) })} className="p-1 rounded hover:bg-white/5" style={{ color: '#ef4444' }}><Trash2 className="h-3.5 w-3.5" /></button>
                                    </div>
                                  )}
                                </div>

                                {/* Materials with images */}
                                {obj.materials && obj.materials.length > 0 && (
                                  <div className="mt-2">
                                    <div className="flex flex-wrap gap-1.5 mb-1">
                                      {obj.materials.map((m: any, mi: number) => (
                                        <span key={mi} className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(232,121,249,0.1)', color: '#e879f9', border: '1px solid rgba(232,121,249,0.2)' }}>
                                          {m.imageUrl && <img src={m.imageUrl} alt={m.name} className="h-4 w-4 rounded-sm object-cover" />}
                                          {m.name} ×{m.quantity}
                                        </span>
                                      ))}
                                    </div>
                                    {/* Delivery tracking toggle */}
                                    <button
                                      onClick={() => setExpandedObjDelivery(expandedObjDelivery === obj.id ? null : obj.id)}
                                      className="text-[10px] px-2 py-0.5 rounded font-medium transition-all"
                                      style={{ background: expandedObjDelivery === obj.id ? 'rgba(232,121,249,0.15)' : 'rgba(255,255,255,0.03)', color: expandedObjDelivery === obj.id ? '#e879f9' : 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}
                                    >
                                      <Package className="h-3 w-3 inline mr-1" />
                                      {expandedObjDelivery === obj.id ? 'Ocultar entregas' : 'Ver entregas por miembro'}
                                    </button>
                                    {/* Delivery tracking grid with quantities */}
                                    {expandedObjDelivery === obj.id && (
                                      <div className="mt-2 rounded-lg p-2.5 overflow-x-auto" style={{ background: 'rgba(232,121,249,0.03)', border: '1px solid rgba(232,121,249,0.1)' }}>
                                        <table className="w-full text-xs" style={{ minWidth: 400 }}>
                                          <thead>
                                            <tr>
                                              <th className="text-left py-2 px-2 font-bold text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Miembro</th>
                                              {obj.materials.map((m: any, mi: number) => (
                                                <th key={mi} className="text-center py-2 px-2 font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                  <div className="flex flex-col items-center gap-1">
                                                    {m.imageUrl && <img src={m.imageUrl} alt={m.name} className="h-8 w-8 rounded object-cover transition-transform hover:scale-[2.5] hover:z-50 hover:relative cursor-zoom-in" />}
                                                    <span className="truncate max-w-[90px] text-[11px]">{m.name}</span>
                                                    <span className="text-[10px]" style={{ color: '#e879f9' }}>c/u: {m.quantity.toLocaleString()}</span>
                                                  </div>
                                                </th>
                                              ))}
                                              <th className="text-center py-2 px-2 font-bold text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Estado</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {members.map((mbr: any) => {
                                              const objDel = deliveryMap[obj.id] || {};
                                              let totalOwed = 0;
                                              const matDetails: { owed: number; delivered: number; required: number }[] = obj.materials.map((m: any, mi: number) => {
                                                const del = (objDel[mi] || {})[mbr.userId];
                                                const delivered = del ? del.quantity : 0;
                                                const required = m.quantity;
                                                const owed = Math.max(0, required - delivered);
                                                totalOwed += owed;
                                                return { owed, delivered, required };
                                              });
                                              return (
                                                <tr key={mbr.userId} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                  <td className="py-2.5 px-2 font-semibold text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>{mbr.name}</td>
                                                  {obj.materials.map((_: any, mi: number) => {
                                                    const det = matDetails[mi];
                                                    const isFull = det.delivered >= det.required;
                                                    return (
                                                      <td key={mi} className="text-center py-2.5 px-2">
                                                        {canCreateObj ? (
                                                          isFull ? (
                                                            <button
                                                              onClick={() => setConfirmModal({ open: true, title: 'Marcar como deuda', description: `¿Revertir la entrega de ${mbr.name} para este material?`, onConfirm: () => setDeliveryQtyMut.mutate({ objectiveId: obj.id, userId: mbr.userId, materialIndex: mi, quantity: 0 }) })}
                                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105"
                                                              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                                                            >
                                                              <CircleCheck className="h-4 w-4" /> Entregado
                                                            </button>
                                                          ) : (
                                                            <button
                                                              onClick={() => setDeliveryQtyMut.mutate({ objectiveId: obj.id, userId: mbr.userId, materialIndex: mi, quantity: det.required })}
                                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105"
                                                              style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                                                            >
                                                              <CircleX className="h-4 w-4" /> Debe
                                                            </button>
                                                          )
                                                        ) : (
                                                          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: isFull ? '#22c55e' : '#ef4444' }}>
                                                            {isFull ? <CircleCheck className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}
                                                            {isFull ? 'Entregado' : 'Debe'}
                                                          </span>
                                                        )}
                                                      </td>
                                                    );
                                                  })}
                                                  <td className="text-center py-2.5 px-2">
                                                    {totalOwed > 0 ? (
                                                      <button
                                                        onClick={() => {
                                                          obj.materials.forEach((_: any, mi: number) => {
                                                            const det = matDetails[mi];
                                                            if (det.owed > 0) setDeliveryQtyMut.mutate({ objectiveId: obj.id, userId: mbr.userId, materialIndex: mi, quantity: det.required });
                                                          });
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all hover:scale-105"
                                                        style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                                                      >
                                                        <CircleX className="h-4 w-4" /> Pendiente
                                                      </button>
                                                    ) : (
                                                      <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                                                        <BadgeCheck className="h-4 w-4" /> Completo
                                                      </span>
                                                    )}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Participation removed — daily attendance at day level replaces this */}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Create/Edit objective form modal */}
                    {showObjForm && (
                      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => resetObjForm()}>
                        <div className="w-full max-w-md rounded-2xl p-5" style={{ background: '#1e1e2e', border: '1px solid rgba(56,189,248,0.2)' }} onClick={e => e.stopPropagation()}>
                          <h3 className="text-base font-bold mb-4" style={{ color: '#38bdf8' }}>{editObjId ? 'Editar objetivo' : 'Nuevo objetivo'}</h3>
                          <div className="space-y-3">
                            <div>
                              <label className="text-[10px] font-semibold block mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Fecha</label>
                              <input type="date" value={objFormDate} onChange={e => setObjFormDate(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold block mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Título *</label>
                              <input value={objFormTitle} onChange={e => setObjFormTitle(e.target.value)} placeholder="Ej: Farmear Iron Ore" className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold block mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Descripción</label>
                              <textarea value={objFormDesc} onChange={e => setObjFormDesc(e.target.value)} placeholder="Detalles del objetivo..." rows={2} className="w-full rounded-lg px-3 py-2 text-sm resize-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>Materiales solicitados (c/u por miembro)</label>
                                <button onClick={() => setObjFormMats(prev => [...prev, { name: '', quantity: 1 }])} className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(232,121,249,0.1)', color: '#e879f9' }}>+ Material</button>
                              </div>
                              {objFormMats.map((m, mi) => (
                                <div key={mi} className="flex gap-2 mb-1.5 items-start">
                                  {m.imageUrl && (
                                    <img src={m.imageUrl} alt={m.name} className="h-9 w-9 rounded-lg object-cover shrink-0 border" style={{ borderColor: 'rgba(232,121,249,0.3)' }} />
                                  )}
                                  <div className="flex-1 relative" style={{ zIndex: 50 - mi }}>
                                    <CatalogTypeahead
                                      value={m.name}
                                      onChange={v => setObjFormMats(prev => prev.map((p, i) => i === mi ? { ...p, name: v, imageUrl: v !== p.name ? undefined : p.imageUrl } : p))}
                                      onSelect={item => setObjFormMats(prev => prev.map((p, i) => i === mi ? { ...p, name: item.name, imageUrl: item.imageUrl || undefined, catalogId: item.id } : p))}
                                      catalog={catalog}
                                      placeholder="Buscar material del catálogo..."
                                    />
                                  </div>
                                  <input type="number" min={1} value={m.quantity} onChange={e => setObjFormMats(prev => prev.map((p, i) => i === mi ? { ...p, quantity: Number(e.target.value) || 1 } : p))} className="w-20 rounded px-2 py-1 text-xs text-center shrink-0" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', height: 36 }} />
                                  <button onClick={() => setObjFormMats(prev => prev.filter((_, i) => i !== mi))} className="p-1 rounded hover:bg-white/5 shrink-0 mt-1.5" style={{ color: '#ef4444' }}><X className="h-3 w-3" /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => resetObjForm()} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
                            <button
                              onClick={() => {
                                if (!objFormTitle.trim() || !objFormDate) return;
                                const mats = objFormMats.filter(m => m.name.trim());
                                if (editObjId) {
                                  updateObjMut.mutate({ id: editObjId, title: objFormTitle, description: objFormDesc, materials: mats });
                                } else {
                                  createObjMut.mutate({ cpId: objCpId, date: objFormDate, title: objFormTitle, description: objFormDesc, materials: mats });
                                }
                                resetObjForm();
                              }}
                              className="px-4 py-2 rounded-lg text-xs font-semibold"
                              style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.3), rgba(34,211,238,0.3))', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.4)' }}
                            >
                              {editObjId ? 'Guardar cambios' : 'Crear objetivo'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Monthly Report */}
                    {showObjReport && allObjs.length > 0 && (
                      <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
                        <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: '#a855f7' }}>
                          <Flag className="h-4 w-4" /> Informe mensual — {monthNames[month]} {year}
                        </h4>

                        {/* Objectives summary */}
                        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <p className="text-[10px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Objetivos del mes</p>
                          <div className="flex gap-4">
                            <div className="text-center">
                              <p className="text-xl font-bold" style={{ color: '#38bdf8' }}>{allObjs.length}</p>
                              <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Total</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xl font-bold" style={{ color: '#22c55e' }}>{allObjs.filter((o: any) => o.achieved).length}</p>
                              <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Logrados</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xl font-bold" style={{ color: '#f59e0b' }}>{allObjs.filter((o: any) => !o.achieved).length}</p>
                              <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Pendientes</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xl font-bold" style={{ color: allObjs.filter((o: any) => o.achieved).length === allObjs.length ? '#22c55e' : '#38bdf8' }}>
                                {allObjs.length > 0 ? Math.round((allObjs.filter((o: any) => o.achieved).length / allObjs.length) * 100) : 0}%
                              </p>
                              <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Cumplimiento</p>
                            </div>
                          </div>
                        </div>

                        {/* Participation ranking (based on daily attendance) */}
                        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <p className="text-[10px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Participación por miembro (asistencia diaria)</p>
                          <div className="space-y-1.5">
                            {(() => {
                              const daysWithAtt = Object.keys(dailyAttMap).length;
                              const totalDays = Math.max(daysWithAtt, allObjs.length > 0 ? [...new Set(allObjs.map((o: any) => (o.date || '').slice(0, 10)))].length : 0, 1);
                              const ranked = members.map((m: any) => {
                                const attended = Object.values(dailyAttMap).filter((dayData: any) => dayData[m.userId] === true).length;
                                const pct = totalDays > 0 ? Math.round((attended / totalDays) * 100) : 0;
                                return { ...m, attended, pct, totalDays };
                              }).sort((a: any, b: any) => b.pct - a.pct);
                              return ranked.map((m: any, ri: number) => (
                                <div key={m.userId} className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold w-5 text-center" style={{ color: ri === 0 ? '#fbbf24' : ri === 1 ? '#94a3b8' : ri === 2 ? '#cd7f32' : 'rgba(255,255,255,0.3)' }}>
                                    {ri < 3 ? ['🥇','🥈','🥉'][ri] : `${ri+1}.`}
                                  </span>
                                  <span className="text-[11px] font-medium w-28 truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{m.name}</span>
                                  <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, background: m.pct >= 80 ? '#22c55e' : m.pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                                  </div>
                                  <span className="text-[10px] font-bold w-20 text-right" style={{ color: m.pct >= 80 ? '#22c55e' : m.pct >= 50 ? '#f59e0b' : '#ef4444' }}>{m.attended}/{m.totalDays} días ({m.pct}%)</span>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>

                        {/* Materials summary */}
                        {(() => {
                          const matSummary: Record<string, { name: string; imageUrl?: string; required: number; delivered: number }> = {};
                          allObjs.forEach((obj: any) => {
                            (obj.materials || []).forEach((m: any, mi: number) => {
                              const key = m.name;
                              if (!matSummary[key]) matSummary[key] = { name: m.name, imageUrl: m.imageUrl, required: 0, delivered: 0 };
                              matSummary[key].required += m.quantity * members.length;
                              const objDel = deliveryMap[obj.id] || {};
                              members.forEach((mbr: any) => {
                                const del = (objDel[mi] || {})[mbr.userId];
                                matSummary[key].delivered += del ? del.quantity : 0;
                              });
                            });
                          });
                          const matList = Object.values(matSummary);
                          if (matList.length === 0) return null;
                          return (
                            <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <p className="text-[10px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Materiales del mes (todos los miembros)</p>
                              <div className="space-y-2">
                                {matList.map((mat, i) => {
                                  const pct = mat.required > 0 ? Math.round((mat.delivered / mat.required) * 100) : 0;
                                  const remaining = Math.max(0, mat.required - mat.delivered);
                                  return (
                                    <div key={i} className="flex items-center gap-2">
                                      {mat.imageUrl && <img src={mat.imageUrl} alt={mat.name} className="h-5 w-5 rounded-sm object-cover shrink-0" />}
                                      <span className="text-[11px] font-medium w-28 truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{mat.name}</span>
                                      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                                      </div>
                                      <div className="text-right shrink-0">
                                        <span className="text-[10px] font-bold" style={{ color: pct >= 100 ? '#22c55e' : '#ef4444' }}>
                                          {mat.delivered.toLocaleString()}/{mat.required.toLocaleString()}
                                        </span>
                                        {remaining > 0 && <p className="text-[8px]" style={{ color: '#ef4444' }}>faltan {remaining.toLocaleString()}</p>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Per-member material debt breakdown */}
                        {(() => {
                          const memberDebts: { name: string; userId: number; debts: { matName: string; imageUrl?: string; owed: number }[] }[] = [];
                          members.forEach((mbr: any) => {
                            const debts: { matName: string; imageUrl?: string; owed: number }[] = [];
                            allObjs.forEach((obj: any) => {
                              (obj.materials || []).forEach((m: any, mi: number) => {
                                const objDel = deliveryMap[obj.id] || {};
                                const del = (objDel[mi] || {})[mbr.userId];
                                const delivered = del ? del.quantity : 0;
                                const owed = Math.max(0, m.quantity - delivered);
                                if (owed > 0) {
                                  const existing = debts.find(d => d.matName === m.name);
                                  if (existing) existing.owed += owed;
                                  else debts.push({ matName: m.name, imageUrl: m.imageUrl, owed });
                                }
                              });
                            });
                            if (debts.length > 0) memberDebts.push({ name: mbr.name, userId: mbr.userId, debts });
                          });
                          if (memberDebts.length === 0) return (
                            <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
                              <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>Todos los miembros han entregado sus materiales</p>
                            </div>
                          );
                          return (
                            <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.1)' }}>
                              <p className="text-sm font-bold mb-3" style={{ color: '#ef4444' }}>Deuda de materiales por miembro</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm" style={{ minWidth: 450 }}>
                                  <thead>
                                    <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                                      <th className="text-left py-2.5 px-3 font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>Miembro</th>
                                      <th className="text-left py-2.5 px-3 font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>Material</th>
                                      <th className="text-right py-2.5 px-3 font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>Cantidad</th>
                                      {canCreateObj && <th className="text-center py-2.5 px-3 font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>Acción</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {memberDebts.map((md, mdi) => (
                                      md.debts.map((d, di) => (
                                        <tr key={`${md.userId}-${di}`} style={{ borderTop: di === 0 && mdi > 0 ? '2px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.05)' }}>
                                          {di === 0 && (
                                            <td rowSpan={md.debts.length} className="py-3 px-3 font-bold align-top text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
                                              {md.name}
                                            </td>
                                          )}
                                          <td className="py-3 px-3">
                                            <div className="flex items-center gap-2">
                                              {d.imageUrl && <img src={d.imageUrl} alt={d.matName} className="h-7 w-7 rounded object-cover transition-transform hover:scale-[2.5] hover:z-50 hover:relative cursor-zoom-in" />}
                                              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>{d.matName}</span>
                                            </div>
                                          </td>
                                          <td className="py-3 px-3 text-right font-bold text-sm" style={{ color: '#ef4444' }}>{d.owed.toLocaleString()}</td>
                                          {canCreateObj && (
                                            <td className="py-3 px-3 text-center">
                                              <button
                                                onClick={() => setConfirmModal({ open: true, title: 'Registrar entrega', description: `¿Marcar ${d.matName} (${d.owed.toLocaleString()}) como entregado por ${md.name} en todos los días del mes?`, onConfirm: () => payAllDebtMut.mutate({ cpId: objCpId, userId: md.userId, materialName: d.matName, monthStart: objMonth }) })}
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all hover:scale-105"
                                                style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                                              >
                                                <CreditCard className="h-4 w-4" /> Registrar entrega
                                              </button>
                                            </td>
                                          )}
                                        </tr>
                                      ))
                                    ))}
                                  </tbody>
                                </table>
                                {canCreateObj && memberDebts.length > 1 && (
                                  <div className="mt-3 pt-3 flex justify-end" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <button
                                      onClick={() => setConfirmModal({ open: true, title: 'Saldar toda la deuda', description: `¿Marcar TODOS los materiales pendientes de TODOS los miembros como entregados? Esto afectará a ${memberDebts.length} miembros.`, onConfirm: () => memberDebts.forEach(md => md.debts.forEach(debt => payAllDebtMut.mutate({ cpId: objCpId, userId: md.userId, materialName: debt.matName, monthStart: objMonth }))) })}
                                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
                                      style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}
                                    >
                                      <BadgeCheck className="h-5 w-5" /> Saldar toda la deuda
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ═══ Confirmation Modal ═══ */}
      <AlertDialog open={confirmModal.open} onOpenChange={(open) => !open && setConfirmModal(prev => ({ ...prev, open: false }))}>
        <AlertDialogContent style={{ background: '#1e1e2e', border: '1px solid rgba(56,189,248,0.2)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold" style={{ color: '#38bdf8' }}>{confirmModal.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{confirmModal.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirmModal.onConfirm(); setConfirmModal(prev => ({ ...prev, open: false })); }} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'rgba(56,189,248,0.2)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ TAB: CONFIG ═══ */}
      {tab === 'config' && (
        <div className="space-y-5">
          {/* Config sub-tabs */}
          <div className="flex gap-2">
            <button onClick={() => setConfigSubTab('clans')} className="px-4 py-2 rounded-lg text-xs font-semibold transition-all" style={{ background: configSubTab === 'clans' ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.03)', color: configSubTab === 'clans' ? '#fbbf24' : 'rgba(255,255,255,0.5)', border: configSubTab === 'clans' ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(255,255,255,0.06)' }}>
              <Users className="inline h-3.5 w-3.5 mr-1.5" />Clanes & CPs
            </button>
            {isSA && (
              <button onClick={() => setConfigSubTab('recipes')} className="px-4 py-2 rounded-lg text-xs font-semibold transition-all" style={{ background: configSubTab === 'recipes' ? 'rgba(192,132,252,0.15)' : 'rgba(255,255,255,0.03)', color: configSubTab === 'recipes' ? '#c084fc' : 'rgba(255,255,255,0.5)', border: configSubTab === 'recipes' ? '1px solid rgba(192,132,252,0.25)' : '1px solid rgba(255,255,255,0.06)' }}>
                <Hammer className="inline h-3.5 w-3.5 mr-1.5" />Recetas
              </button>
            )}
          </div>

          {/* SA visibility toggle */}
          {isSA && configSubTab === 'clans' && (
            <div className="card-glass rounded-xl p-3 flex items-center justify-between" style={{ border: '1px solid rgba(251,191,36,0.15)' }}>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: '#fbbf24' }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>Visibilidad entre CPs</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{crossCpVisible ? 'Todas las CPs pueden ver las bodegas de todos' : 'Cada CP solo puede ver su propia bodega'}</p>
                </div>
              </div>
              <button
                onClick={() => updateSettingsMut.mutate({ crossCpVisibility: !crossCpVisible })}
                className="relative w-12 h-6 rounded-full transition-all"
                style={{ background: crossCpVisible ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.1)', border: `1px solid ${crossCpVisible ? 'rgba(45,212,191,0.5)' : 'rgba(255,255,255,0.15)'}` }}
              >
                <div className="absolute top-0.5 h-4 w-4 rounded-full transition-all" style={{ background: crossCpVisible ? '#2dd4bf' : 'rgba(255,255,255,0.4)', left: crossCpVisible ? '26px' : '3px' }} />
              </button>
            </div>
          )}

          {/* Objetivos visibility toggle (SA only) */}
          {isSA && configSubTab === 'clans' && (
            <div className="card-glass rounded-xl p-3 flex items-center justify-between" style={{ border: '1px solid rgba(56,189,248,0.15)' }}>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4" style={{ color: '#38bdf8' }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>Objetivos visible entre CPs</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{crossCpObjVisible ? 'Las CPs pueden ver los objetivos de otros (solo lectura)' : 'Cada CP solo ve sus propios objetivos'}</p>
                </div>
              </div>
              <button
                onClick={() => updateSettingsMut.mutate({ crossCpObjectivesVisibility: !crossCpObjVisible })}
                className="relative w-12 h-6 rounded-full transition-all"
                style={{ background: crossCpObjVisible ? 'rgba(56,189,248,0.3)' : 'rgba(255,255,255,0.1)', border: `1px solid ${crossCpObjVisible ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.15)'}` }}
              >
                <div className="absolute top-0.5 h-4 w-4 rounded-full transition-all" style={{ background: crossCpObjVisible ? '#38bdf8' : 'rgba(255,255,255,0.4)', left: crossCpObjVisible ? '26px' : '3px' }} />
              </button>
            </div>
          )}

          {configSubTab === 'clans' && (
            isSA
              ? <RaidClansAndCps />
              : <RaidClansAndCps readOnly allowSecondaryChars={(roleLc === 'admin' || ledCpIds.length > 0)} />
          )}

          {configSubTab === 'recipes' && isSA && (
            <div className="space-y-5">
              {/* Recipe Registration Panel */}
              <div className="card-glass rounded-2xl p-5 relative" style={{ zIndex: 20 }}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                      <Hammer className="h-5 w-5" style={{ color: '#c084fc' }} />
                      Registro de Recetas
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Define el ítem final y los materiales necesarios. Los materiales pueden tener <strong style={{ color: 'rgba(255,255,255,0.7)' }}>sub-materiales</strong>.
                    </p>
                  </div>
                </div>

                {/* Recipe item final */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      Nombre del ítem final <span style={{ color: '#f87171' }}>*</span>
                    </label>
                    <input value={recipeName} onChange={e => setRecipeName(e.target.value)} className="w-full rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', height: 36 }} placeholder="Lance, Majestic Plate Armor..." />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>Categoría</label>
                    <FancySelect<string>
                      value={recipeCategory || null}
                      onChange={(v) => setRecipeCategory(v)}
                      accent="purple"
                      size="sm"
                      placeholder="— Seleccionar —"
                      options={CATEGORIES.map((c: string) => ({
                        value: c,
                        label: categoryMeta[c as ItemCategory]?.label || c,
                        emoji: categoryMeta[c as ItemCategory]?.emoji || '📦',
                      }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>URL Wiki</label>
                    <input value={recipeWiki} onChange={e => setRecipeWiki(e.target.value)} className="w-full rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', height: 36 }} placeholder="https://wikipedia1.mw2.wiki/..." />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>URL Imagen</label>
                    <input value={recipeImg} onChange={e => setRecipeImg(e.target.value)} className="w-full rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', height: 36 }} placeholder="https://..." />
                  </div>
                </div>

                {/* Materials */}
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Materiales <span style={{ color: '#f87171' }}>*</span> ({recipeMaterials.filter(m => m.name.trim()).length})
                  </label>
                  <button type="button" onClick={addMaterialRow} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all" style={{ background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.25)', color: '#c084fc' }}>
                    <Plus className="h-3 w-3" /> Añadir material
                  </button>
                </div>

                {renderRecipeMaterialsTree()}

                {/* Submit button */}
                <button
                  type="button"
                  onClick={handleCreateRecipe}
                  disabled={createRecipeMut.isPending}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all mt-4"
                  style={{
                    background: 'linear-gradient(135deg, rgba(192,132,252,0.2), rgba(168,85,247,0.2))',
                    border: '1px solid rgba(192,132,252,0.35)',
                    color: '#c084fc',
                  }}
                >
                  {createRecipeMut.isPending ? <><Loader2 className="inline h-4 w-4 mr-2 animate-spin" /> Creando...</> : <><Hammer className="inline h-4 w-4 mr-2" /> Crear Receta</>}
                </button>
              </div>

              {/* Existing Recipes List */}
              <div className="card-glass rounded-2xl p-5">
                <h3 className="text-sm font-bold mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>Recetas Registradas ({(recipes as any[]).length})</h3>
                {(recipes as any[]).length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay recetas registradas</p>
                ) : (
                  <div className="space-y-2">
                    {(recipes as any[]).map((recipe: any) => (
                      <div key={recipe.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-3">
                          {recipe.imageUrl && <img src={recipe.imageUrl} className="h-8 w-8 rounded-lg object-cover" alt="" />}
                          <div>
                            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>{recipe.name}</p>
                            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{recipe.category || 'Sin categoría'} · {recipe.materials?.length || 0} materiales</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditRecipe(recipe)}
                            className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'rgba(96,165,250,0.7)', border: '1px solid rgba(96,165,250,0.2)' }} title="Editar receta"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmAction({ title: 'Eliminar receta', message: 'Se eliminará permanentemente. No se puede deshacer.', label: 'Eliminar', color: '#ef4444', action: () => { deleteRecipeMut.mutate({ id: Number(recipe.id) }); setConfirmAction(null); }, itemName: recipe.name })}
                            className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'rgba(255,120,120,0.7)', border: '1px solid rgba(239,68,68,0.2)' }} title="Eliminar receta"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Generic Confirmation Modal */}
      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmLabel={confirmAction?.label || 'Confirmar'}
        confirmColor={confirmAction?.color || '#34d399'}
        onConfirm={() => confirmAction?.action()}
        onCancel={() => setConfirmAction(null)}
        itemName={confirmAction?.itemName}
        itemDetail={confirmAction?.itemDetail}
        itemImage={confirmAction?.itemImage}
      />

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
            <div className="flex justify-between gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {/* Prestar a CP button — opens loan modal */}
              {withdrawItem?.cpId && (warehouseCps as any[]).length > 1 && canWriteSelected && (
                <button
                  onClick={() => {
                    setLoanItem(withdrawItem);
                    setLoanQty(withdrawQty || '1');
                    setLoanReason(withdrawReason);
                    setLoanToCpId(null);
                    setWithdrawItem(null);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Prestar a CP
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setWithdrawItem(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
                <button onClick={handleWithdraw} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>Descontar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" style={{ background: '#1a1a2e', border: '1px solid rgba(96,165,250,0.2)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                {historyItem.imageUrl ? (
                  <img src={historyItem.imageUrl} className="h-9 w-9 rounded-lg object-cover" alt="" style={{ border: '1px solid rgba(96,165,250,0.2)' }} />
                ) : (
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>📦</div>
                )}
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Historial</h3>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{historyItem.name}</p>
                </div>
              </div>
              <button onClick={() => setHistoryItem(null)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3" style={{ scrollbarWidth: 'thin' }}>
              {(() => {
                const itemHistory = (warehouseHistory as any[]).filter((h: any) => Number(h.itemId) === Number(historyItem.id));
                if (itemHistory.length === 0) return <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>Sin registros de historial</p>;
                return (
                  <div className="space-y-2">
                    {itemHistory.map((h: any) => {
                      const typeColor = h.type === 'withdraw' ? '#fbbf24' : h.type === 'loan_out' ? '#60a5fa' : h.type === 'loan_return' ? '#22c55e' : '#ef4444';
                      const typeBg = h.type === 'withdraw' ? 'rgba(251,191,36,0.06)' : h.type === 'loan_out' ? 'rgba(96,165,250,0.06)' : h.type === 'loan_return' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)';
                      const typeBorder = h.type === 'withdraw' ? 'rgba(251,191,36,0.15)' : h.type === 'loan_out' ? 'rgba(96,165,250,0.15)' : h.type === 'loan_return' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
                      const typeLabel = h.type === 'withdraw' ? '⬇ Descuento' : h.type === 'loan_out' ? '↗ Préstamo' : h.type === 'loan_return' ? '↩ Devolución' : '🗑 Eliminación';
                      return (
                        <div key={h.id} className="rounded-xl p-3" style={{ background: typeBg, border: `1px solid ${typeBorder}` }}>
                          <div className="flex items-start gap-3">
                            {historyItem.imageUrl ? (
                              <img src={historyItem.imageUrl} className="h-8 w-8 rounded object-cover shrink-0 mt-0.5" alt="" />
                            ) : (
                              <div className="h-8 w-8 rounded shrink-0 mt-0.5 flex items-center justify-center text-xs" style={{ background: 'rgba(255,255,255,0.05)' }}>📦</div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `${typeColor}15`, border: `1px solid ${typeColor}40`, color: typeColor }}>
                                  {typeLabel}
                                </span>
                                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                  {new Date(h.date).toLocaleDateString('es-CL')} {new Date(h.date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                                <span className="font-mono font-bold" style={{ color: typeColor }}>{h.type === 'loan_return' ? '+' : '-'}{h.quantity}</span>
                                <span>·</span>
                                <span className="flex-1 truncate">{h.reason}</span>
                                {isSA && (
                                  <button
                                    onClick={() => setConfirmAction({ title: 'Eliminar entrada de historial', message: 'Se eliminará permanentemente esta entrada. No deja rastro.', label: 'Eliminar', color: '#ef4444', action: () => { deleteHistoryMut.mutate({ id: Number(h.id) }); setConfirmAction(null); }, itemName: typeLabel, itemDetail: `${h.reason} — ${h.actor}` })}
                                    className="shrink-0 p-1 rounded hover:bg-white/5" style={{ color: 'rgba(255,120,120,0.6)' }} title="Eliminar entrada"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                Por: {h.actor} {h.type === 'withdraw' ? `· Stock restante: ${h.remainingStock}` : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <div className="flex justify-end px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setHistoryItem(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Loan Creation Modal */}
      {loanItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(96,165,250,0.2)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                <ArrowRightLeft className="h-4 w-4" style={{ color: '#60a5fa' }} />
                Prestar: {loanItem.name}
              </h3>
              <button onClick={() => setLoanItem(null)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Stock actual: <span className="font-bold" style={{ color: '#34d399' }}>{Number(loanItem.quantity).toLocaleString()}</span></p>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>CP destino *</label>
                <select
                  value={loanToCpId ?? ''}
                  onChange={e => setLoanToCpId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
                >
                  <option value="">Seleccionar CP...</option>
                  {(warehouseCps as any[]).filter((cp: any) => Number(cp.id) !== Number(loanItem.cpId)).map((cp: any) => (
                    <option key={cp.id} value={cp.id}>{cp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Cantidad *</label>
                <input type="number" min="1" max={loanItem.quantity} value={loanQty} onChange={e => setLoanQty(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Motivo (opcional)</label>
                <input value={loanReason} onChange={e => setLoanReason(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Descripción del préstamo..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setLoanItem(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button
                onClick={() => {
                  if (!loanToCpId) { toast.error('Selecciona una CP destino'); return; }
                  createLoanMut.mutate({ itemId: Number(loanItem.id), quantity: Number(loanQty) || 1, toCpId: loanToCpId, reason: loanReason.trim() || undefined });
                  setLoanItem(null); setLoanQty('1'); setLoanToCpId(null); setLoanReason('');
                }}
                disabled={!loanToCpId}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(96,165,250,0.2)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', opacity: loanToCpId ? 1 : 0.4 }}
              >
                Prestar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loans List Modal */}
      {loansModalCpId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" style={{ background: '#1a1a2e', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                <ArrowRightLeft className="h-4 w-4" style={{ color: '#f59e0b' }} />
                Préstamos enviados
                {pendingSentLoans.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>{pendingSentLoans.length} pendientes</span>
                )}
              </h3>
              <button onClick={() => setLoansModalCpId(null)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2" style={{ maxHeight: '60vh' }}>
              {sentLoans.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay préstamos registrados</p>
              ) : (
                sentLoans.map((loan: any) => {
                  const elapsed = Date.now() - new Date(loan.lentAt).getTime();
                  const days = Math.floor(elapsed / 86400000);
                  const hours = Math.floor((elapsed % 86400000) / 3600000);
                  const mins = Math.floor((elapsed % 3600000) / 60000);
                  const elapsedStr = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  return (
                    <div key={loan.id} className="rounded-xl p-3" style={{
                      background: loan.returned ? 'rgba(34,197,94,0.04)' : 'rgba(245,158,11,0.04)',
                      border: `1px solid ${loan.returned ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)'}`,
                    }}>
                      <div className="flex items-start gap-3">
                        {loan.itemImageUrl ? (
                          <img src={loan.itemImageUrl} className="h-10 w-10 rounded-lg object-cover shrink-0" alt="" style={{ border: `1px solid ${loan.returned ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}` }} />
                        ) : (
                          <div className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center text-sm" style={{ background: 'rgba(255,255,255,0.05)' }}>📦</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className="text-sm font-bold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{loan.itemName}</p>
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ml-2" style={{
                              background: loan.returned ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                              color: loan.returned ? '#22c55e' : '#f59e0b',
                            }}>
                              {loan.returned ? 'DEVUELTO' : 'PENDIENTE'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            <span>→ <span style={{ color: loan.returned ? 'rgba(34,197,94,0.7)' : 'rgba(245,158,11,0.8)' }}>{loan.toCpName}</span></span>
                            <span>·</span>
                            <span className="font-mono font-bold" style={{ color: loan.returned ? '#22c55e' : '#f59e0b' }}>{loan.quantity}×</span>
                            <span>·</span>
                            <span>Por: {loan.lentBy}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            <span>📅 {new Date(loan.lentAt).toLocaleDateString('es-CL')} {new Date(loan.lentAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                            {!loan.returned && (
                              <>
                                <span>·</span>
                                <span className="font-semibold" style={{ color: days > 3 ? '#ef4444' : days > 1 ? '#f59e0b' : '#22c55e' }}>⏱ {elapsedStr}</span>
                              </>
                            )}
                            {loan.reason && <><span>·</span><span>{loan.reason}</span></>}
                          </div>
                          {loan.returned && loan.returnedAt && (
                            <p className="text-xs mt-1" style={{ color: 'rgba(34,197,94,0.5)' }}>
                              ✓ Devuelto: {new Date(loan.returnedAt).toLocaleDateString('es-CL')} {new Date(loan.returnedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                              {loan.returnedBy && ` · Por: ${loan.returnedBy}`}
                            </p>
                          )}
                          {!loan.returned && canWriteSelected && (
                            <div className="mt-2">
                              <button
                                onClick={() => setConfirmAction({
                                  title: 'Confirmar devolución',
                                  message: `¿Confirmar que ${loan.toCpName} devolvió ${loan.quantity}× ${loan.itemName}? Se restaurará el stock.`,
                                  label: 'Confirmar devolución',
                                  color: '#22c55e',
                                  action: () => { returnLoanMut.mutate({ loanId: Number(loan.id) }); setConfirmAction(null); },
                                  itemName: loan.itemName,
                                  itemDetail: `Préstamo a ${loan.toCpName}`,
                                  itemImage: loan.itemImageUrl || null,
                                })}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                                style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                              >
                                Marcar devuelto
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex justify-end px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setLoansModalCpId(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete with Reason Modal */}
      {deleteReasonItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Eliminar: {deleteReasonItem.name}</h3>
              <button onClick={() => setDeleteReasonItem(null)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs" style={{ color: 'rgba(239,68,68,0.7)' }}>Esta acción eliminará el material de forma permanente. No se puede deshacer.</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Stock actual: <span className="font-bold" style={{ color: '#34d399' }}>{Number(deleteReasonItem.quantity).toLocaleString()}</span></p>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Motivo de eliminación *</label>
                <input value={deleteReason} onChange={e => setDeleteReason(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Material obsoleto, error de registro, etc." />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setDeleteReasonItem(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button onClick={() => { if (!deleteReason.trim()) { toast.error('Debe indicar un motivo'); return; } deleteItemMut.mutate({ id: Number(deleteReasonItem.id), reason: deleteReason.trim() }); setDeleteReasonItem(null); setDeleteReason(''); }} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal (SA only) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: '#1a1a2e', border: '1px solid rgba(96,165,250,0.2)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                {editingItem.imageUrl ? (
                  <img src={editingItem.imageUrl} className="h-9 w-9 rounded-lg object-cover" alt="" style={{ border: '1px solid rgba(96,165,250,0.2)' }} />
                ) : (
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>📦</div>
                )}
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Editar Item</h3>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{editingItem.name}</p>
                </div>
              </div>
              <button onClick={() => setEditingItem(null)}><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Categoría</label>
                <select
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
                >
                  <option value="">Seleccionar categoría</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{categoryMeta[c]?.emoji} {categoryMeta[c]?.label || c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Cantidad</label>
                <input
                  type="number"
                  min="0"
                  value={editQuantity}
                  onChange={e => setEditQuantity(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setEditingItem(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button
                onClick={() => {
                  const updates: any = {};
                  if (editCategory && editCategory !== editingItem.category) updates.category = editCategory;
                  const qty = parseInt(editQuantity, 10);
                  if (!isNaN(qty) && qty !== Number(editingItem.quantity)) updates.quantity = qty;
                  if (Object.keys(updates).length === 0) { toast.error('No hay cambios'); return; }
                  updateItemMut.mutate({ id: Number(editingItem.id), ...updates });
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(96,165,250,0.2)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Old recipe modal removed — now inline in Crafteo tab */}

      {/* Create Project Modal */}
      {projectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="rounded-2xl w-full max-w-lg mx-4 p-5 max-h-[90vh] overflow-y-auto" style={{ background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))', border: '1px solid rgba(52,211,153,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', scrollbarWidth: 'thin' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Hammer className="h-5 w-5" style={{ color: '#34d399' }} />
                  <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>Nuevo Proyecto</h3>
                </div>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Selecciona una receta y asigna a un personaje/cuenta.</p>
              </div>
              <button onClick={() => setProjectOpen(false)} className="rounded-lg p-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Seleccionar Receta *</label>
                <FancySelect<string>
                  value={projectRecipeId || null}
                  onChange={setProjectRecipeId}
                  accent="turquoise"
                  size="md"
                  placeholder="-- Seleccionar receta --"
                  options={(recipes as any[]).map((r: any) => ({
                    value: String(r.id),
                    label: `${r.name} (${r.materials?.length || 0} materiales)`,
                    emoji: '\uD83D\uDCDC',
                  }))}
                />
              </div>
              {/* Character selection — only CP members when CP selected */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Asignar a Personaje / Cuenta * {selectedCpId ? <span className="normal-case" style={{ color: 'rgba(232,121,249,0.7)' }}>(miembros de CP)</span> : ''}</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <input value={projectCharSearch} onChange={e => setProjectCharSearch(e.target.value)} className="w-full rounded-lg pl-9 pr-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Buscar personaje..." />
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                  {((selectedCpId ? cpMembersChars : allCharacters) as any[]).filter((c: any) => !projectCharSearch || String(c.name).toLowerCase().includes(projectCharSearch.toLowerCase())).map((c: any, ci: number) => {
                    const isSelected = projectCharSelected === c.name;
                    return (
                      <button key={ci} onClick={() => setProjectCharSelected(c.name)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all" style={{ background: isSelected ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isSelected ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.05)'}` }}>
                        <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0" style={{ background: isSelected ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)' }}>
                          <User className="h-3.5 w-3.5" style={{ color: isSelected ? '#34d399' : 'rgba(255,255,255,0.4)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: isSelected ? '#34d399' : 'rgba(255,255,255,0.8)' }}>{c.name}</p>
                          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{c.type === 'principal' ? 'Principal' : 'Secundario'}</p>
                        </div>
                        {isSelected && <CheckCircle className="h-4 w-4 shrink-0" style={{ color: '#34d399' }} />}
                      </button>
                    );
                  })}
                  {((selectedCpId ? cpMembersChars : allCharacters) as any[]).filter((c: any) => !projectCharSearch || String(c.name).toLowerCase().includes(projectCharSearch.toLowerCase())).length === 0 && (
                    <p className="text-xs text-center py-3" style={{ color: 'rgba(255,255,255,0.3)' }}>No se encontraron personajes</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Notas (opcional)</label>
                <input value={projectNotes} onChange={e => setProjectNotes(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Para armar a Juan, etc." />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={projectPriority} onChange={e => setProjectPriority(e.target.checked)} className="accent-amber-400 h-4 w-4 rounded" />
                <Star className="h-4 w-4" style={{ color: projectPriority ? '#fbbf24' : 'rgba(255,255,255,0.3)' }} />
                <span className="text-xs font-semibold" style={{ color: projectPriority ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>Marcar como prioridad</span>
              </label>
              {/* Preview selected recipe */}
              {projectRecipeId && (() => {
                const selRecipe = (recipes as any[]).find((r: any) => String(r.id) === projectRecipeId);
                if (!selRecipe) return null;
                return (
                  <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.12)' }}>
                    <button type="button" onClick={() => setProjectPreviewOpen(!projectPreviewOpen)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors">
                      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(52,211,153,0.6)' }}>Vista previa de materiales ({selRecipe.materials?.length || 0})</span>
                      {projectPreviewOpen ? <ChevronUp className="h-3.5 w-3.5" style={{ color: 'rgba(52,211,153,0.4)' }} /> : <ChevronDown className="h-3.5 w-3.5" style={{ color: 'rgba(52,211,153,0.4)' }} />}
                    </button>
                    {projectPreviewOpen && (
                    <div className="space-y-1 px-3 pb-3">
                      {(selRecipe.materials || []).map((m: any, mi: number) => {
                        const stock = (warehouseItems as any[]).find((w: any) => String(w.nameLower || w.name || '').toLowerCase() === String(m.nameLower || m.name || '').toLowerCase());
                        const have = stock?.quantity || 0;
                        const need = m.quantity || 0;
                        return (
                          <div key={mi} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              {m.imageUrl && <img src={m.imageUrl} alt="" className="h-5 w-5 rounded object-cover" />}
                              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{m.name}</span>
                            </div>
                            <span style={{ color: have >= need ? '#34d399' : '#f87171' }}>{have}/{need}</span>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setProjectOpen(false)} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}>Cancelar</button>
              <button onClick={handleCreateProject} disabled={!projectRecipeId || !projectCharSelected} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: projectRecipeId && projectCharSelected ? 'linear-gradient(90deg, rgba(52,211,153,0.8), rgba(45,212,191,0.8))' : 'rgba(255,255,255,0.04)', border: `1px solid ${projectRecipeId && projectCharSelected ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`, color: projectRecipeId && projectCharSelected ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                <CheckCircle className="h-4 w-4" /> Crear Proyecto
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirm Project Completion Modal — character already assigned, just confirm & deduct */}
      {completeProjectModal && (() => {
        const proj = (projects as any[]).find((p: any) => Number(p.id) === Number(completeProjectModal.id));
        const charName = proj?.assignedCharacter || 'Sin asignar';
        return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setCompleteProjectModal(null)}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: 'linear-gradient(180deg, rgba(24,24,40,0.98), rgba(18,18,30,0.98))', border: '1px solid rgba(52,211,153,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(52,211,153,0.12)' }}>
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" style={{ color: '#34d399' }} />
                  <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>Confirmar Crear Item</h3>
                </div>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Proyecto: <strong>{completeProjectModal.name}</strong></p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Entregado a: <strong style={{ color: '#6ee7b7' }}>{charName}</strong></p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Los materiales se descontaran automaticamente de la bodega.</p>
              </div>
              <button onClick={() => setCompleteProjectModal(null)} className="rounded-lg p-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-2 px-5 py-5">
              <button onClick={() => setCompleteProjectModal(null)} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}>Cancelar</button>
              <button
                onClick={() => {
                  completeProjectMut.mutate({ id: completeProjectModal.id, assignedCharacter: charName });
                  setCompleteProjectModal(null);
                }}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(90deg, rgba(52,211,153,0.8), rgba(45,212,191,0.8))', border: '1px solid rgba(52,211,153,0.5)', color: '#fff' }}
              >
                <CheckCircle className="h-4 w-4" /> Confirmar y Crear
              </button>
            </div>
          </div>
        </div>
        );
      })()}
      {/* Edit Assignment Modal for Completed Projects */}
      {editAssignmentModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setEditAssignmentModal(null)}>
          <div className="rounded-2xl w-full max-w-md mx-4" style={{ background: 'linear-gradient(180deg, rgba(24,24,40,0.98), rgba(18,18,30,0.98))', border: '1px solid rgba(96,165,250,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(96,165,250,0.12)' }}>
              <div>
                <div className="flex items-center gap-2">
                  <Pencil className="h-5 w-5" style={{ color: '#60a5fa' }} />
                  <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>Editar Asignación</h3>
                </div>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Proyecto: <strong>{editAssignmentModal.name}</strong></p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Actual: <strong style={{ color: '#6ee7b7' }}>{editAssignmentModal.current || 'Sin asignar'}</strong></p>
              </div>
              <button onClick={() => setEditAssignmentModal(null)} className="rounded-lg p-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-4">
              <label className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Seleccionar nuevo personaje / cuenta *</label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <input value={editCharSearch} onChange={e => setEditCharSearch(e.target.value)} className="w-full rounded-lg pl-9 pr-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} placeholder="Buscar personaje..." autoFocus />
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                {(allCharacters as any[]).filter((c: any) => !editCharSearch || String(c.name).toLowerCase().includes(editCharSearch.toLowerCase())).map((c: any, ci: number) => {
                  const isSelected = editCharSelected === c.name;
                  return (
                    <button key={ci} onClick={() => setEditCharSelected(c.name)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all" style={{ background: isSelected ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isSelected ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.05)'}` }}>
                      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ background: isSelected ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.06)' }}>
                        <User className="h-4 w-4" style={{ color: isSelected ? '#60a5fa' : 'rgba(255,255,255,0.4)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: isSelected ? '#60a5fa' : 'rgba(255,255,255,0.8)' }}>{c.name}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{c.type === 'principal' ? 'Personaje principal' : 'Personaje secundario'}</p>
                      </div>
                      {isSelected && <CheckCircle className="h-5 w-5 shrink-0" style={{ color: '#60a5fa' }} />}
                    </button>
                  );
                })}
                {(allCharacters as any[]).filter((c: any) => !editCharSearch || String(c.name).toLowerCase().includes(editCharSearch.toLowerCase())).length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>No se encontraron personajes</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setEditAssignmentModal(null)} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}>Cancelar</button>
              <button
                disabled={!editCharSelected || editCharSelected === editAssignmentModal.current}
                onClick={() => {
                  if (!editCharSelected) return;
                  editAssignmentMut.mutate({ id: editAssignmentModal.id, assignedCharacter: editCharSelected });
                  setEditAssignmentModal(null);
                }}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: editCharSelected && editCharSelected !== editAssignmentModal.current ? 'linear-gradient(90deg, rgba(96,165,250,0.8), rgba(59,130,246,0.8))' : 'rgba(255,255,255,0.04)', border: `1px solid ${editCharSelected && editCharSelected !== editAssignmentModal.current ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`, color: editCharSelected && editCharSelected !== editAssignmentModal.current ? '#fff' : 'rgba(255,255,255,0.4)' }}
              >
                <CheckCircle className="h-4 w-4" /> Guardar Cambio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Recipe Modal */}
      {editRecipe && (() => {
        const palette = [
          { color: '#2dd4bf', bg: 'rgba(45,212,191,0.06)', border: 'rgba(45,212,191,0.25)', light: 'rgba(45,212,191,0.12)' },
          { color: '#a855f7', bg: 'rgba(168,85,247,0.06)', border: 'rgba(168,85,247,0.25)', light: 'rgba(168,85,247,0.12)' },
          { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', light: 'rgba(245,158,11,0.12)' },
          { color: '#ec4899', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.25)', light: 'rgba(236,72,153,0.12)' },
          { color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.25)', light: 'rgba(59,130,246,0.12)' },
        ];
        const getLv = (d: number) => palette[d % palette.length];
        const renderEditNodes = (nodes: MaterialNode[], path: number[], depth: number): React.ReactNode => {
          const lv = getLv(depth);
          const isRoot = depth === 0;
          return (
            <div className={isRoot ? 'space-y-3' : 'space-y-2'}>
              {nodes.map((node, idx) => {
                const cp = [...path, idx];
                const imgSrc = node.imageUrl || (catalog as any[]).find((c: any) => String(c.name || '').toLowerCase() === node.name.trim().toLowerCase())?.imageUrl || '';
                const subCount = node.subMaterials.length;
                if (isRoot) {
                  return (
                    <div key={idx} className="rounded-xl" style={{ border: `1px solid ${lv.border}`, background: 'rgba(255,255,255,0.015)' }}>
                      <div className="flex items-center justify-between px-3 py-2" style={{ background: lv.bg, borderBottom: `1px solid ${lv.border}` }}>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-5 rounded-full" style={{ background: lv.color }} />
                          {imgSrc && <img src={imgSrc} alt="" className="h-6 w-6 rounded object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                          <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>Material #{idx + 1}{node.name ? ` — ${node.name}` : ''}</span>
                          {subCount > 0 && !node.expanded && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: lv.light, color: lv.color }}>{subCount} sub</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => setEditRecipeMaterials(prev => updateNodeAt(prev, cp, n => ({ ...n, expanded: !n.expanded, subMaterials: !n.expanded && n.subMaterials.length === 0 ? [emptyNode()] : n.subMaterials })))} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all" style={{ background: node.expanded ? lv.light : 'rgba(255,255,255,0.03)', color: node.expanded ? lv.color : 'rgba(255,255,255,0.4)', border: `1px solid ${node.expanded ? lv.border : 'rgba(255,255,255,0.08)'}` }}>
                            {node.expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            Sub-materiales
                          </button>
                          {nodes.length > 1 && (
                            <button type="button" onClick={() => setConfirmAction({ title: 'Eliminar material', message: `¿Eliminar "${node.name || `Material #${idx + 1}`}" y todos sus sub-materiales?`, label: 'Eliminar', color: '#ef4444', action: () => { setEditRecipeMaterials(prev => removeNodeAt(prev, cp)); setConfirmAction(null); }, itemName: node.name || `Material #${idx + 1}` })} className="rounded-lg px-2 py-1 text-[10px] flex items-center gap-1" style={{ background: 'rgba(255,120,120,0.05)', border: '1px solid rgba(255,120,120,0.15)', color: 'rgba(255,120,120,0.7)' }}>
                              <Trash2 className="h-3 w-3" /> quitar
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3">
                        <input value={node.name} onChange={e => setEditRecipeMaterials(prev => updateNodeAt(prev, cp, n => ({ ...n, name: e.target.value })))} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} placeholder="Nombre material..." />
                        <input type="number" min="1" value={node.quantity} onChange={e => setEditRecipeMaterials(prev => updateNodeAt(prev, cp, n => ({ ...n, quantity: e.target.value })))} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} placeholder="Cant." />
                        <input value={node.imageUrl} onChange={e => setEditRecipeMaterials(prev => updateNodeAt(prev, cp, n => ({ ...n, imageUrl: e.target.value })))} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} placeholder="URL imagen..." />
                      </div>
                      {node.subMaterials.length > 0 && (
                        <div className="px-3 pb-2">
                          <button type="button" onClick={() => setEditRecipeMaterials(prev => updateNodeAt(prev, cp, n => ({ ...n, isCraftable: !n.isCraftable })))} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg font-semibold transition-all" style={{ background: node.isCraftable ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${node.isCraftable ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)'}`, color: node.isCraftable ? '#60a5fa' : 'rgba(255,255,255,0.4)' }}>
                            ⚒ {node.isCraftable ? 'Material padre (crafteable)' : 'Marcar como crafteable'}
                          </button>
                        </div>
                      )}
                      {node.expanded && (
                        <div className="px-2.5 pb-2.5 relative" style={{ paddingLeft: 20 }}>
                          <div className="absolute left-2 top-0 bottom-2 w-0.5 rounded-full" style={{ background: getLv(depth + 1).border }} />
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1" style={{ color: getLv(depth + 1).color }}>
                              <span className="w-1.5 h-0.5 rounded-full inline-block" style={{ background: getLv(depth + 1).color }} />Sub-materiales
                            </p>
                            <button type="button" onClick={() => setEditRecipeMaterials(prev => addNodeAt(prev, cp))} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: getLv(depth + 1).light, color: getLv(depth + 1).color }}>
                              <Plus className="h-2 w-2" /> Añadir
                            </button>
                          </div>
                          {renderEditNodes(node.subMaterials, cp, depth + 1)}
                        </div>
                      )}
                    </div>
                  );
                }
                // Non-root: vertical block layout (not inline flex)
                return (
                  <div key={idx} className="rounded-lg" style={{ background: lv.bg, border: `1px solid ${lv.border}` }}>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      {imgSrc && <img src={imgSrc} alt="" className="h-5 w-5 rounded object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                      <input value={node.name} onChange={e => setEditRecipeMaterials(prev => updateNodeAt(prev, cp, n => ({ ...n, name: e.target.value })))} className="flex-1 rounded px-2 py-1 text-[11px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' }} placeholder="Material..." />
                      <input type="number" min="1" value={node.quantity} onChange={e => setEditRecipeMaterials(prev => updateNodeAt(prev, cp, n => ({ ...n, quantity: e.target.value })))} className="w-14 rounded px-2 py-1 text-[11px] text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' }} />
                      <button type="button" onClick={() => setEditRecipeMaterials(prev => updateNodeAt(prev, cp, n => ({ ...n, isCraftable: !n.isCraftable })))} className="text-[9px] px-1 py-0.5 rounded shrink-0 font-semibold" style={{ background: node.isCraftable ? 'rgba(96,165,250,0.15)' : 'transparent', border: `1px solid ${node.isCraftable ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.1)'}`, color: node.isCraftable ? '#60a5fa' : 'rgba(255,255,255,0.3)' }} title="Marcar como material padre crafteable">
                        ⚒
                      </button>
                      <button type="button" onClick={() => setEditRecipeMaterials(prev => updateNodeAt(prev, cp, n => ({ ...n, expanded: !n.expanded, subMaterials: !n.expanded && n.subMaterials.length === 0 ? [emptyNode()] : n.subMaterials })))} className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0" style={{ background: node.expanded ? lv.light : 'transparent', color: lv.color }}>
                        {node.expanded ? <ChevronUp className="h-3 w-3 inline" /> : <Plus className="h-3 w-3 inline" />}
                      </button>
                      {nodes.length > 1 && (
                        <button type="button" onClick={() => setConfirmAction({ title: 'Eliminar sub-material', message: `¿Eliminar "${node.name || 'sub-material'}"?`, label: 'Eliminar', color: '#ef4444', action: () => { setEditRecipeMaterials(prev => removeNodeAt(prev, cp)); setConfirmAction(null); }, itemName: node.name || 'sub-material' })} className="shrink-0 rounded p-0.5" style={{ color: 'rgba(255,120,120,0.6)' }}><Trash2 className="h-3 w-3" /></button>
                      )}
                    </div>
                    {node.expanded && node.subMaterials.length > 0 && (
                      <div className="px-2 pb-2 relative" style={{ paddingLeft: 16 }}>
                        <div className="absolute left-1.5 top-0 bottom-2 w-0.5 rounded-full" style={{ background: getLv(depth + 1).border }} />
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[9px] uppercase tracking-wider font-bold" style={{ color: getLv(depth + 1).color }}>Sub-materiales</p>
                          <button type="button" onClick={() => setEditRecipeMaterials(prev => addNodeAt(prev, cp))} className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: getLv(depth + 1).light, color: getLv(depth + 1).color }}>
                            <Plus className="h-2 w-2" /> Añadir
                          </button>
                        </div>
                        {renderEditNodes(node.subMaterials, cp, depth + 1)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        };
        const mapEditNodes = (nodes: MaterialNode[]): any[] => nodes.filter(n => n.name.trim()).map(n => ({
          name: n.name.trim(),
          quantity: parseInt(n.quantity) || 1,
          imageUrl: n.imageUrl || undefined,
          isCraftable: n.isCraftable || undefined,
          subMaterials: n.subMaterials?.length ? mapEditNodes(n.subMaterials) : undefined,
        }));
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" style={{ background: '#1a1a2e', border: '1px solid rgba(168,85,247,0.2)' }}>
            <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                <Pencil className="inline h-4 w-4 mr-2" style={{ color: '#a855f7' }} />
                Editar Receta
              </h3>
              <button onClick={() => setEditRecipe(null)} className="p-1 rounded-lg hover:bg-white/5"><X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(168,85,247,0.3) transparent' }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Nombre</label>
                  <input value={editRecipeName} onChange={e => setEditRecipeName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} />
                </div>
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Categoría</label>
                  <select value={editRecipeCategory} onChange={e => setEditRecipeCategory(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}>
                    <option value="">Sin categoría</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{categoryMeta[c]?.emoji} {categoryMeta[c]?.label || c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>URL Imagen</label>
                  <input value={editRecipeImg} onChange={e => setEditRecipeImg(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} placeholder="https://..." />
                </div>
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>URL Wiki</label>
                  <input value={editRecipeWiki} onChange={e => setEditRecipeWiki(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} placeholder="https://..." />
                </div>
              </div>
              {/* Materials editing */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Materiales ({editRecipeMaterials.filter(m => m.name.trim()).length})
                  </label>
                  <button type="button" onClick={() => setEditRecipeMaterials(prev => [...prev, emptyNode()])} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-semibold" style={{ background: 'rgba(45,212,191,0.08)', color: '#2dd4bf', border: '1px solid rgba(45,212,191,0.2)' }}>
                    <Plus className="h-3 w-3" /> Material
                  </button>
                </div>
                {renderEditNodes(editRecipeMaterials, [], 0)}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setEditRecipe(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
              <button
                onClick={() => {
                  const mats = mapEditNodes(editRecipeMaterials);
                  updateRecipeMut.mutate({
                    id: Number(editRecipe.id),
                    name: editRecipeName.trim() || undefined,
                    category: editRecipeCategory || undefined,
                    imageUrl: editRecipeImg || null,
                    wikiUrl: editRecipeWiki || null,
                    materials: mats.length > 0 ? mats : undefined,
                  });
                }}
                disabled={!editRecipeName.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.7), rgba(139,92,246,0.7))', color: '#fff', border: '1px solid rgba(168,85,247,0.3)', opacity: editRecipeName.trim() ? 1 : 0.4 }}
              >
                {updateRecipeMut.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </AppShell>
  );
}

// ─── Warehouse CP Row (expandable, like Raid) ────────────────────────────────

function WarehouseCpRow({ cp, expanded, onToggle, onEdit, onDelete, onRemoveMember, onAddMember, allAppUsers }: {
  cp: any; expanded: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void;
  onRemoveMember: (userId: number) => void; onAddMember: (userId: number) => void; allAppUsers: any[];
}) {
  const membersQ = trpc.warehouse.commandParties.members.useQuery({ cpId: Number(cp.id) }, { enabled: expanded });
  const members = (membersQ.data || []) as any[];
  const confirmedCount = members.length;
  const [addSearch, setAddSearch] = useState('');
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const memberUserIds = new Set(members.map((m: any) => Number(m.id)));
  const availableUsers = allAppUsers.filter((u: any) => !memberUserIds.has(Number(u.id)));
  const filteredAvailable = addSearch.trim()
    ? availableUsers.filter((u: any) => {
        const q = addSearch.toLowerCase();
        return (u.characterName || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
      })
    : availableUsers;

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3 p-3 px-4 cursor-pointer hover:bg-white/[0.02] transition" onClick={onToggle}>
        {expanded
          ? <ChevronDown className="h-5 w-5 shrink-0" style={{ color: '#a78bfa' }} />
          : <ChevronRight className="h-5 w-5 shrink-0" style={{ color: '#a78bfa' }} />
        }
        <Users className="h-5 w-5 shrink-0" style={{ color: '#a78bfa' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{cp.name}</p>
            {cp.leaderName && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                <Crown className="h-3.5 w-3.5" /> {cp.leaderName}
              </span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {cp.memberCount || confirmedCount} miembro(s)
          </p>
        </div>
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="p-2 rounded-lg hover:bg-white/5 transition" style={{ color: '#a78bfa' }} title="Editar CP"><Pencil className="h-5 w-5" /></button>
          <button onClick={onDelete} className="p-2 rounded-lg hover:bg-white/5 transition" style={{ color: '#ef4444' }} title="Eliminar CP"><Trash2 className="h-5 w-5" /></button>
        </div>
      </div>

      {/* Members list */}
      {expanded && (
        <div className="px-4 pb-3" style={{ paddingLeft: '3.25rem' }}>
          {membersQ.isLoading && (
            <p className="text-xs py-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Cargando miembros...</p>
          )}
          {!membersQ.isLoading && members.length === 0 && (
            <p className="text-xs py-2" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay miembros</p>
          )}
          <div>
            {members.map((m: any, idx: number) => (
              <WarehouseMemberRow key={m.id} member={m} isFirst={idx === 0} cp={cp} onRemove={() => onRemoveMember(m.id)} />
            ))}
          </div>

          {/* Add member */}
          <div className="mt-2 relative">
            <input
              value={addSearch}
              onChange={e => { setAddSearch(e.target.value); setShowAddDropdown(true); }}
              onFocus={() => setShowAddDropdown(true)}
              onBlur={() => setTimeout(() => setShowAddDropdown(false), 200)}
              placeholder="Buscar usuario para agregar..."
              className="w-full text-xs py-1.5 px-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', borderRadius: '0.5rem' }}
              onClick={e => e.stopPropagation()}
            />
            {showAddDropdown && addSearch.trim() && filteredAvailable.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg max-h-48 overflow-y-auto" style={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', zIndex: 50 }}>
                {filteredAvailable.slice(0, 10).map((u: any) => (
                  <button
                    key={u.id}
                    onMouseDown={() => { onAddMember(u.id); setAddSearch(''); setShowAddDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 flex items-center gap-2"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full text-white text-[9px] font-bold shrink-0" style={{ background: 'rgba(167,139,250,0.2)' }}>
                      {(u.characterName || u.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <span className="font-medium">{u.characterName || u.name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Warehouse Member Row (expandable with secondary chars, like Raid) ──────

function WarehouseMemberRow({ member: m, isFirst, cp, onRemove }: {
  member: any; isFirst: boolean; cp: any; onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const secondaryChars = (m.secondaryCharacters || []) as any[];

  return (
    <div>
      {!isFirst && <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '0 -0.5rem' }} />}
      <div className="flex items-center justify-between py-2.5 px-1 cursor-pointer hover:bg-white/[0.02] rounded transition" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {(secondaryChars.length > 0)
            ? (expanded ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />)
            : <div className="w-4" />
          }
          <div className="flex h-7 w-7 items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0" style={{ background: m.isLeader ? 'rgba(251,191,36,0.25)' : 'rgba(167,139,250,0.2)' }}>
            {(m.characterName || m.name || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>{m.characterName || m.name}</span>
            {m.classMain && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>{m.classMain}</span>
            )}
            {m.isLeader && <Crown className="h-4 w-4 shrink-0" style={{ color: '#fbbf24' }} />}
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>CONFIRMADO</span>
            {secondaryChars.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>+{secondaryChars.length} alt{secondaryChars.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        {!m.isLeader && (
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={onRemove} className="p-1.5 rounded hover:bg-white/5 transition" title="Quitar de CP" style={{ color: '#ef4444' }}><UserX className="h-5 w-5" /></button>
          </div>
        )}
      </div>

      {/* Expanded: Secondary characters */}
      {expanded && secondaryChars.length > 0 && (
        <div className="ml-12 mb-2 rounded-lg p-2.5" style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.1)' }}>
          {secondaryChars.map((sc: any) => (
            <div key={sc.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2">
                <Swords className="h-3.5 w-3.5 shrink-0" style={{ color: '#a78bfa' }} />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{sc.name}</span>
                {sc.className && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>{sc.className}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
