import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Split, Plus, Trash2, Check, Store, Users, Download, Pencil, X, Clock, ShoppingCart, AlertTriangle,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { ItemTypeahead } from '../components/inventory/ItemTypeahead';
import { useAuth } from '../contexts/AuthContext';
import { categoryMeta } from '../lib/category-meta';
import { formatThousands, parseThousands, reformatWhileTyping } from '../lib/number-format';
import { trpc } from '../lib/trpc';

type RemainderAlloc = Record<string, number>;

// Mismo reparto que el backend: cada CP recibe floor(cantidad / nCP). El
// sobrante se reparte entre las CPs según remainderAlloc (unidades EXTRA por
// CP); lo que no se asigne queda "a vender".
function computeAllocation(
  quantity: number,
  cpNames: string[],
  remainderAlloc: RemainderAlloc,
) {
  const n = cpNames.length;
  const qty = Math.max(0, Number(quantity) || 0);
  const perCp = n > 0 ? Math.floor(qty / n) : 0;
  const remainder = n > 0 ? qty - perCp * n : qty;
  const alloc: Record<string, number> = {};
  for (const name of cpNames) alloc[name] = perCp;
  let assigned = 0;
  if (remainder > 0 && remainderAlloc) {
    for (const name of cpNames) {
      if (assigned >= remainder) break;
      const want = Math.max(0, Math.floor(Number(remainderAlloc[name]) || 0));
      const give = Math.min(want, remainder - assigned);
      if (give > 0) { alloc[name] += give; assigned += give; }
    }
  }
  const toSell = remainder - assigned;
  return { perCp, remainder, alloc, toSell };
}

// Tolera ítems antiguos con el modelo remainderAction/assignedCp.
function remainderAllocOf(it: any): RemainderAlloc {
  if (it && it.remainderAlloc && typeof it.remainderAlloc === 'object') return it.remainderAlloc as RemainderAlloc;
  if (it && it.remainderAction === 'ASSIGN' && it.assignedCp) return { [String(it.assignedCp)]: Number.MAX_SAFE_INTEGER };
  return {};
}

// Precio con descuento (redondeado), igual que el backend.
function discountedPrice(normal: number, pct: number): number {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  return Math.round((Number(normal) || 0) * (1 - p / 100));
}

// Vista de un ítem: reparto, unidades disponibles a vender y ventas. Espeja la
// lógica del backend (borrador = en vivo; entregado = reparto congelado).
function cpViewOf(it: any, cpNamesLive: string[]) {
  const sales: any[] = Array.isArray(it.sales) ? it.sales : [];
  const soldUnits = sales.reduce((s, x) => s + (Number(x?.units) || 0), 0);
  const confirmed = it.status === 'CONFIRMED';
  const cps = confirmed && Array.isArray(it.cpNamesSnapshot) ? it.cpNamesSnapshot.map(String) : cpNamesLive;
  // Ítem SIN dividir: registrado con su cantidad pero sin reparto ni "a vender".
  if (it.divide === false) {
    const alloc: Record<string, number> = {};
    for (const n of cps) alloc[n] = 0;
    return { cps, alloc, available: 0, remainder: 0, soldUnits, sales, confirmed };
  }
  if (confirmed && it.deliveredAlloc && typeof it.deliveredAlloc === 'object') {
    const alloc: Record<string, number> = {};
    for (const n of cps) alloc[n] = Number(it.deliveredAlloc[n]) || 0;
    return { cps, alloc, available: Math.max(0, Number(it.sellRemaining) || 0), remainder: 0, soldUnits, sales, confirmed };
  }
  const { alloc, toSell, remainder } = computeAllocation(it.quantity, cps, remainderAllocOf(it));
  return { cps, alloc, available: toSell, remainder, soldUnits, sales, confirmed };
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.9)',
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
};

// Botones estandarizados de la página (misma estética en todo el módulo).
const btnBase = 'flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40';
const btnTeal: React.CSSProperties = { background: 'rgba(123,241,214,0.15)', color: '#7bf1d6' };
const btnGreen: React.CSSProperties = { background: 'rgba(52,211,153,0.15)', color: '#34d399' };
const btnRed: React.CSSProperties = { background: 'rgba(248,113,113,0.12)', color: '#f87171' };
const btnGhost: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' };

// Precio con estado local y separador de miles (puntos). Solo escribe al backend
// al salir del campo (onBlur) o con Enter — no una llamada por cada tecla.
function PriceInput({
  value, disabled, onCommit,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (price: number | null) => void;
}) {
  const [local, setLocal] = useState<string>(formatThousands(value));
  useEffect(() => { setLocal(formatThousands(value)); }, [value]);

  const commit = () => {
    const next = parseThousands(local);
    if (next === value) return;
    onCommit(next);
  };

  return (
    <input
      type="text" inputMode="numeric" placeholder="Precio" disabled={disabled}
      style={{ ...inputStyle, width: 130, padding: '4px 8px', opacity: disabled ? 0.7 : 1 }}
      value={local}
      onChange={(e) => setLocal(reformatWhileTyping(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

// % descuento por ítem con estado local; commit onBlur/Enter.
function DiscountInput({
  value, disabled, onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (pct: number) => void;
}) {
  const [local, setLocal] = useState<string>(String(value ?? 20));
  useEffect(() => { setLocal(String(value ?? 20)); }, [value]);
  const commit = () => {
    const n = Math.min(100, Math.max(0, Math.floor(Number(local) || 0)));
    setLocal(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="text" inputMode="numeric" disabled={disabled} title="% descuento"
      style={{ ...inputStyle, width: 56, padding: '4px 8px', textAlign: 'center', opacity: disabled ? 0.7 : 1 }}
      value={local}
      onChange={(e) => setLocal(e.target.value.replace(/\D/g, '').slice(0, 3))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

// Modal de confirmación reutilizable (reemplaza los toasts/acciones directas
// en las acciones destructivas del módulo).
function ConfirmModal({
  open, title, message, confirmLabel = 'Confirmar', danger = true, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()}
        style={{ background: '#141821', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: danger ? 'rgba(248,113,113,0.14)' : 'rgba(123,241,214,0.14)' }}>
            <AlertTriangle className="h-4 w-4" style={{ color: danger ? '#f87171' : '#7bf1d6' }} />
          </div>
          <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>{title}</h3>
          <button onClick={onCancel} title="Cerrar" className="ml-auto rounded-lg p-1"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className={`${btnBase} px-3 py-2`} style={btnGhost}>Cancelar</button>
          <button onClick={onConfirm} className={`${btnBase} px-3 py-2`} style={danger ? btnRed : btnGreen}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function NameManager({
  title, icon, items, onCreate, onRename, onDelete, placeholder, deleteTitle, getDeleteMessage,
}: {
  title: string;
  icon: React.ReactNode;
  items: any[];
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  placeholder: string;
  deleteTitle?: string;
  getDeleteMessage?: (id: number, name: string) => string;
}) {
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [delItem, setDelItem] = useState<{ id: number; name: string } | null>(null);

  const defaultMsg = `¿Seguro que quieres eliminar "${delItem?.name ?? ''}"? Se quitará de las asignaciones de sobrante de los ítems en borrador.`;
  const delMsg = delItem
    ? (getDeleteMessage ? getDeleteMessage(delItem.id, delItem.name) : defaultMsg)
    : '';

  return (
    <div style={cardStyle} className="p-4">
      <ConfirmModal
        open={!!delItem}
        title={deleteTitle ?? 'Eliminar registro'}
        message={delMsg}
        confirmLabel="Eliminar"
        onConfirm={() => { if (delItem) onDelete(delItem.id); setDelItem(null); }}
        onCancel={() => setDelItem(null)}
      />
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{title}</h3>
        <span className="ml-auto text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{items.length}</span>
      </div>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (!n) return; onCreate(n); setName(''); }}
      >
        <input style={{ ...inputStyle, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={60} />
        <button type="submit" className="flex items-center gap-1 rounded-lg px-3 text-xs font-semibold"
          style={{ background: 'rgba(123,241,214,0.15)', color: '#7bf1d6' }}>
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </form>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Aún no hay registros.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {editId === it.id ? (
                <>
                  <input style={{ ...inputStyle, padding: '2px 6px', width: 120 }} value={editName}
                    onChange={(e) => setEditName(e.target.value)} autoFocus maxLength={60} />
                  <button type="button" onClick={() => { const n = editName.trim(); if (n) onRename(it.id, n); setEditId(null); }}
                    title="Guardar"><Check className="h-3.5 w-3.5" style={{ color: '#34d399' }} /></button>
                  <button type="button" onClick={() => setEditId(null)} title="Cancelar"><X className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} /></button>
                </>
              ) : (
                <>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.85)' }}>{it.name}</span>
                  <button type="button" onClick={() => { setEditId(it.id); setEditName(it.name); }} title="Renombrar">
                    <Pencil className="h-3 w-3" style={{ color: 'rgba(255,255,255,0.45)' }} /></button>
                  <button type="button" onClick={() => setDelItem({ id: it.id, name: it.name })} title="Eliminar">
                    <Trash2 className="h-3 w-3" style={{ color: '#f87171' }} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CpSplit() {
  const { user } = useAuth();
  // Acceso al módulo: Super Admin o usuario con el toggle `cpAccess`.
  const roleLc = String(user?.role || '').toLowerCase();
  const isSA = roleLc === 'super_admin' || (user as any)?.cpAccess === true;

  const utils = trpc.useUtils();
  const enabled = !!user && isSA;

  const { data: participants = [] } = trpc.cpSplit.participants.list.useQuery(undefined, { enabled });
  const { data: vendors = [] } = trpc.cpSplit.vendors.list.useQuery(undefined, { enabled });
  const { data: items = [] } = trpc.cpSplit.items.list.useQuery(undefined, { enabled });
  const { data: history = [] } = trpc.cpSplit.history.list.useQuery(undefined, { enabled });

  const cpNames = useMemo(() => (participants as any[]).map((c) => String(c.name)), [participants]);

  // Cuántos ítems tiene asignado cada vendedor (para el aviso al eliminar).
  const vendorItemCount = useMemo(() => {
    const m: Record<number, number> = {};
    for (const it of items as any[]) {
      if (it?.vendorId != null) {
        const k = Number(it.vendorId);
        m[k] = (m[k] || 0) + 1;
      }
    }
    return m;
  }, [items]);

  // ---- registro de ítem ----
  const [itemName, setItemName] = useState('');
  const [itemCat, setItemCat] = useState('');
  const [itemImg, setItemImg] = useState('');
  const [itemQty, setItemQty] = useState<string>('1');
  const [itemDisc, setItemDisc] = useState<string>('20');
  const [itemDivide, setItemDivide] = useState<boolean>(true);

  const invAll = () => {
    utils.cpSplit.items.list.invalidate();
    utils.cpSplit.history.list.invalidate();
  };

  const pCreate = trpc.cpSplit.participants.create.useMutation({
    onSuccess: () => { utils.cpSplit.participants.list.invalidate(); utils.cpSplit.history.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const pRename = trpc.cpSplit.participants.rename.useMutation({
    onSuccess: () => { utils.cpSplit.participants.list.invalidate(); invAll(); },
    onError: (e) => toast.error(e.message),
  });
  const pDelete = trpc.cpSplit.participants.delete.useMutation({
    onSuccess: () => { utils.cpSplit.participants.list.invalidate(); invAll(); toast.success('CP eliminada.'); },
    onError: (e) => toast.error(e.message),
  });

  const vCreate = trpc.cpSplit.vendors.create.useMutation({
    onSuccess: () => { utils.cpSplit.vendors.list.invalidate(); utils.cpSplit.history.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const vRename = trpc.cpSplit.vendors.rename.useMutation({
    onSuccess: () => { utils.cpSplit.vendors.list.invalidate(); invAll(); },
    onError: (e) => toast.error(e.message),
  });
  const vDelete = trpc.cpSplit.vendors.delete.useMutation({
    onSuccess: () => { utils.cpSplit.vendors.list.invalidate(); invAll(); toast.success('Vendedor eliminado.'); },
    onError: (e) => toast.error(e.message),
  });

  const iCreate = trpc.cpSplit.items.create.useMutation({
    onSuccess: (res: any) => {
      invAll();
      if (res?._merged) {
        const pend = res._toSell > 0
          ? ` · Faltan ${res._toSell} u. por enviar${res._vendorName ? ` a ${res._vendorName}` : ' (sin vendedor)'}`
          : '';
        toast.success(`Se agrupó con "${res.name}" (total ${res.quantity} u.) y se re-repartió.${pend}`);
      } else {
        toast.success('Ítem agregado (borrador). Entrégalo para repartir y bloquear el lote.');
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const iUpdate = trpc.cpSplit.items.update.useMutation({
    onSuccess: () => invAll(),
    onError: (e) => toast.error(e.message),
  });
  const iConfirm = trpc.cpSplit.items.confirm.useMutation({
    onSuccess: () => { invAll(); toast.success('Lote entregado y bloqueado. Reparto fijo.'); },
    onError: (e) => toast.error(e.message),
  });
  const iDelete = trpc.cpSplit.items.delete.useMutation({
    onSuccess: () => { invAll(); toast.success('Ítem eliminado.'); },
    onError: (e) => toast.error(e.message),
  });
  const iSell = trpc.cpSplit.items.sell.useMutation({
    onSuccess: () => { invAll(); toast.success('Venta registrada. Adena dividida entre las CPs.'); },
    onError: (e) => toast.error(e.message),
  });
  const iRevertSale = trpc.cpSplit.items.revertSale.useMutation({
    onSuccess: () => { invAll(); toast.success('Venta revertida. Unidades devueltas.'); },
    onError: (e) => toast.error(e.message),
  });
  const exportMut = trpc.cpSplit.exportExcel.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const resetAll = trpc.cpSplit.resetAll.useMutation({
    onSuccess: () => {
      utils.cpSplit.items.list.invalidate();
      utils.cpSplit.participants.list.invalidate();
      utils.cpSplit.vendors.list.invalidate();
      utils.cpSplit.history.list.invalidate();
      toast.success('Módulo reiniciado. Todo quedó en cero.');
    },
    onError: (e) => toast.error(e.message),
  });
  const [resetOpen, setResetOpen] = useState(false);

  const addItem = () => {
    const n = itemName.trim();
    if (!n) { toast.error('Escribe el nombre del ítem.'); return; }
    const qty = Math.floor(Number(itemQty));
    if (!qty || qty < 1) { toast.error('La cantidad debe ser al menos 1.'); return; }
    const disc = Math.min(100, Math.max(0, Math.floor(Number(itemDisc) || 0)));
    iCreate.mutate({ name: n, category: itemCat, imageUrl: itemImg, quantity: qty, discountPercent: disc, divide: itemDivide });
    setItemName(''); setItemCat(''); setItemImg(''); setItemQty('1'); setItemDisc('20');
  };

  const downloadExcel = async () => {
    try {
      const res = await exportMut.mutateAsync({ onlyConfirmed: false });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel generado.');
    } catch { /* onError ya notifica */ }
  };

  if (!isSA) {
    return (
      <AppShell>
        <div className="p-8">
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>Acceso restringido al Super Admin.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5 p-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(123,241,214,0.12)' }}>
            <Split className="h-5 w-5" style={{ color: '#7bf1d6' }} />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>Reparticiones CP</h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Reparto equitativo de ítems entre Command Parties. Independiente del inventario.
            </p>
          </div>
          <button onClick={downloadExcel} disabled={exportMut.isPending || items.length === 0}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
            <Download className="h-4 w-4" /> {exportMut.isPending ? 'Generando…' : 'Descargar Excel'}
          </button>
          <button onClick={() => setResetOpen(true)} disabled={resetAll.isPending}
            title="Borra ítems, CPs, vendedores e historial"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
            <Trash2 className="h-4 w-4" /> Reiniciar todo
          </button>
        </div>
        <ConfirmModal
          open={resetOpen}
          title="Reiniciar Reparticiones CP"
          message="Esto deja el módulo en cero: borra TODOS los ítems, las CPs participantes, los vendedores y el historial. No se puede deshacer. ¿Continuar?"
          confirmLabel="Reiniciar todo"
          onConfirm={() => { resetAll.mutate(); setResetOpen(false); }}
          onCancel={() => setResetOpen(false)}
        />

        {/* CPs + Vendedores */}
        <div className="grid gap-4 md:grid-cols-2">
          <NameManager
            title="CPs participantes" icon={<Users className="h-4 w-4" style={{ color: '#7bf1d6' }} />}
            items={participants as any[]} placeholder="Nombre de la CP (ej. CP Norte)"
            onCreate={(name) => pCreate.mutate({ name })}
            onRename={(id, name) => pRename.mutate({ id, name })}
            onDelete={(id) => pDelete.mutate({ id })}
          />
          <NameManager
            title="Vendedores" icon={<Store className="h-4 w-4" style={{ color: '#e879f9' }} />}
            items={vendors as any[]} placeholder="Nombre del vendedor"
            deleteTitle="Eliminar vendedor"
            getDeleteMessage={(id, name) => {
              const c = vendorItemCount[Number(id)] || 0;
              return c > 0
                ? `El vendedor "${name}" tiene ${c} ítem(s) asignado(s). Al eliminarlo, esos ítems quedarán sin vendedor (podrás reasignarlos). ¿Continuar?`
                : `El vendedor "${name}" no tiene ítems asignados. ¿Eliminarlo?`;
            }}
            onCreate={(name) => vCreate.mutate({ name })}
            onRename={(id, name) => vRename.mutate({ id, name })}
            onDelete={(id) => vDelete.mutate({ id })}
          />
        </div>

        {/* Registro de ítems */}
        <div style={cardStyle} className="p-4">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Registro de ítems</h3>
          <div className="grid items-end gap-3" style={{ gridTemplateColumns: '2fr 1fr 90px 110px auto' }}>
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Ítem</label>
              <ItemTypeahead
                value={itemName}
                onChange={setItemName}
                onSelect={(it: any) => {
                  setItemName(it.name || '');
                  setItemCat(it.category || '');
                  setItemImg(it.imageUrl || it.image?.publicUrl || '');
                }}
                placeholder="Nombre del ítem con autocompletado…"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Categoría</label>
              <input style={{ ...inputStyle, width: '100%', opacity: 0.8, cursor: 'not-allowed' }} value={itemCat}
                readOnly title="Se recupera automáticamente del catálogo" placeholder="Desde el catálogo" />
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Cantidad</label>
              <input type="number" min={1} step={1} style={{ ...inputStyle, width: '100%' }} value={itemQty}
                onChange={(e) => setItemQty(e.target.value.replace(/\D/g, ''))}
                onBlur={() => { if (!itemQty || Number(itemQty) < 1) setItemQty('1'); }} />
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>% descuento</label>
              <input type="number" min={0} max={100} step={1} style={{ ...inputStyle, width: '100%' }} value={itemDisc}
                title="Descuento a aplicar al vender (por defecto 20%). Editable por ítem."
                onChange={(e) => setItemDisc(e.target.value.replace(/\D/g, '').slice(0, 3))}
                onBlur={() => { const n = Math.min(100, Math.max(0, Number(itemDisc) || 0)); setItemDisc(String(n)); }} />
            </div>
            <button onClick={addItem} disabled={iCreate.isPending}
              className={`${btnBase} h-[34px] px-4`} style={btnTeal}>
              <Plus className="h-4 w-4" /> Agregar
            </button>
          </div>
          {itemImg && (
            <div className="mt-2 flex items-center gap-2">
              <img src={itemImg} alt="" className="h-8 w-8 rounded object-cover" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Imagen recuperada del catálogo</span>
            </div>
          )}
          <label className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.7)', cursor: 'pointer', width: 'fit-content' }}
            title="Activo: reparte el ítem entre las CPs. Desactivado: queda registrado con su cantidad pero NO se reparte (A vender = 0).">
            <input type="checkbox" checked={itemDivide} onChange={(e) => setItemDivide(e.target.checked)} />
            Dividir entre CPs {itemDivide ? '(activo)' : '(desactivado — solo registrar, no repartir)'}
          </label>
          <p className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {cpNames.length === 0
              ? '⚠️ Registra al menos una CP participante para poder confirmar ítems.'
              : itemDivide
                ? `Reparto entre ${cpNames.length} CP. Lo que no divide se marca "a vender" (o se asigna a una CP).`
                : 'Sin dividir: el ítem queda registrado con su cantidad, sin reparto entre CPs y sin unidades a vender.'}
          </p>
        </div>

        {/* Tabla de ítems */}
        <ItemsTable
          items={items as any[]}
          cpNames={cpNames}
          vendors={vendors as any[]}
          onUpdate={(id, patch) => iUpdate.mutate({ id, ...patch })}
          onConfirm={(id) => iConfirm.mutate({ id })}
          onDelete={(id) => iDelete.mutate({ id })}
          onSell={(id, units, applyDiscount) => iSell.mutate({ id, units, applyDiscount })}
          onRevertSale={(id, saleId) => iRevertSale.mutate({ id, saleId })}
        />

        {/* Historial */}
        <div style={cardStyle} className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: '#fbbf24' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Historial</h3>
            <span className="ml-auto text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{(history as any[]).length}</span>
          </div>
          {(history as any[]).length === 0 ? (
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Sin actividad todavía.</p>
          ) : (
            <div className="space-y-1.5" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {(history as any[]).map((h) => (
                <div key={h.id} className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="shrink-0 rounded px-1.5 py-0.5 font-mono" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', fontSize: 10 }}>
                    {String(h.action || '').replace(/_/g, ' ')}
                  </span>
                  <span className="flex-1" style={{ color: 'rgba(255,255,255,0.75)' }}>{h.detail}</span>
                  <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {new Date(h.createdAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// Editor del sobrante: permite repartir las unidades sobrantes entre las CPs a
// gusto (una cantidad por CP) o dejarlas todas "a vender". Commit onBlur para no
// disparar una escritura al backend por cada tecla.
function RemainderEditor({
  cpNames, remainder, value, onCommit,
}: {
  cpNames: string[];
  remainder: number;
  value: RemainderAlloc;
  onCommit: (alloc: RemainderAlloc) => void;
}) {
  const hasSplit = cpNames.some((n) => (Number(value?.[n]) || 0) > 0);
  const [mode, setMode] = useState<'SELL' | 'SPLIT'>(hasSplit ? 'SPLIT' : 'SELL');
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const m: Record<string, string> = {};
    for (const n of cpNames) { const v = Math.floor(Number(value?.[n]) || 0); m[n] = v > 0 ? String(v) : ''; }
    setInputs(m);
    setMode(cpNames.some((n) => (Number(value?.[n]) || 0) > 0) ? 'SPLIT' : 'SELL');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), cpNames.join('|')]);

  const sanitize = (raw: Record<string, string>): RemainderAlloc => {
    const out: RemainderAlloc = {};
    let assigned = 0;
    for (const n of cpNames) {
      if (assigned >= remainder) break;
      const want = Math.max(0, Math.floor(Number(raw[n]) || 0));
      const give = Math.min(want, remainder - assigned);
      if (give > 0) { out[n] = give; assigned += give; }
    }
    return out;
  };

  const assigned = cpNames.reduce((s, n) => s + (sanitize(inputs)[n] || 0), 0);
  const left = remainder - assigned;

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Sobrante ({remainder}):</span>
        <select style={{ ...inputStyle, padding: '4px 8px' }} value={mode}
          onChange={(e) => {
            const m = e.target.value as 'SELL' | 'SPLIT';
            setMode(m);
            if (m === 'SELL') { setInputs({}); onCommit({}); }
          }}>
          <option value="SELL">A vender</option>
          <option value="SPLIT" disabled={cpNames.length === 0}>Repartir entre CPs</option>
        </select>
      </div>
      {mode === 'SPLIT' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {cpNames.map((n) => (
            <label key={n} className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {n}
              <input type="text" inputMode="numeric" value={inputs[n] ?? ''}
                style={{ ...inputStyle, width: 52, padding: '3px 6px', textAlign: 'center' }}
                onChange={(e) => setInputs((p) => ({ ...p, [n]: e.target.value.replace(/\D/g, '') }))}
                onBlur={() => { const clean = sanitize(inputs); onCommit(clean); }} />
            </label>
          ))}
          <span className="rounded px-2 py-1 text-xs" style={{ background: left > 0 ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.05)', color: left > 0 ? '#f87171' : 'rgba(255,255,255,0.5)' }}>
            A vender: <b>{left}</b>
          </span>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  it, cpNames, vendors, onUpdate, onConfirm, onDelete, onSell, onRevertSale,
}: {
  it: any;
  cpNames: string[];
  vendors: any[];
  onUpdate: (id: number, patch: any) => void;
  onConfirm: (id: number) => void;
  onDelete: (id: number) => void;
  onSell: (id: number, units: number, applyDiscount: boolean) => void;
  onRevertSale: (id: number, saleId: number) => void;
}) {
  const view = cpViewOf(it, cpNames);
  const { cps: effCpNames, alloc, available, remainder, sales, confirmed } = view;
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState<null | 'confirm' | 'delete'>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [revertSale, setRevertSale] = useState<any | null>(null);
  const [sellUnits, setSellUnits] = useState('');
  const [applyDisc, setApplyDisc] = useState(false);

  const alloc0 = remainderAllocOf(it);
  const meta = categoryMeta[it.category] || { emoji: '📦', label: it.category || 'Sin categoría', color: '#7bf1d6' };
  const vendorName = vendors.find((v) => Number(v.id) === Number(it.vendorId))?.name;
  const editable = !confirmed || editing; // borrador: siempre; entregado: al pulsar Editar.

  const normalPrice = it.price != null ? Number(it.price) : null;
  const pct = Math.min(100, Math.max(0, Number(it.discountPercent) || 0));
  const withDisc = normalPrice != null ? discountedPrice(normalPrice, pct) : null;
  const hasPrice = normalPrice != null && normalPrice > 0;

  const borderColor = confirmed ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.25)';

  // Vista previa de la venta en curso (modal).
  const sellQ = Math.max(0, Math.min(available, Math.floor(Number(sellUnits) || 0)));
  const effPrice = applyDisc && withDisc != null ? withDisc : (normalPrice ?? 0);
  const sellTotal = effPrice * sellQ;
  const nCp = effCpNames.length;
  const perCp = nCp > 0 ? Math.floor(sellTotal / nCp) : 0;

  const openSell = () => { setSellUnits(String(available)); setApplyDisc(pct > 0); setSellOpen(true); };
  const doSell = () => {
    const u = Math.floor(Number(sellUnits) || 0);
    if (u < 1 || u > available) { toast.error(`Indica entre 1 y ${available} unidades.`); return; }
    onSell(it.id, u, applyDisc);
    setSellOpen(false);
  };

  return (
    <div className="rounded-xl p-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${borderColor}` }}>
      <ConfirmModal
        open={modal === 'delete'}
        title="Eliminar ítem"
        message={`¿Eliminar "${it.name}" de la repartición? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => { onDelete(it.id); setModal(null); }}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal === 'confirm'}
        title="Entregar ítem"
        danger={false}
        message={`Entregar "${it.name}" reparte las unidades entre las CPs de inmediato y bloquea el lote (el reparto queda fijo y no se vuelve a agrupar).${available > 0 ? ' Las unidades "A vender" siguen en tu poder: podrás cambiar su precio/vendedor y venderlas.' : ''}`}
        confirmLabel="Entregar"
        onConfirm={() => { onConfirm(it.id); setModal(null); }}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={!!revertSale}
        title="Revertir venta"
        message={revertSale ? `¿Revertir la venta de ${revertSale.units} u. de "${it.name}"? Sus unidades vuelven a estar a la venta.` : ''}
        confirmLabel="Revertir"
        onConfirm={() => { if (revertSale) onRevertSale(it.id, revertSale.id); setRevertSale(null); }}
        onCancel={() => setRevertSale(null)}
      />

      {/* Modal de venta con unidades parciales + toggle descuento */}
      {sellOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()}
            style={{ background: '#141821', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(123,241,214,0.14)' }}>
                <ShoppingCart className="h-4 w-4" style={{ color: '#7bf1d6' }} />
              </div>
              <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>Registrar venta</h3>
              <button onClick={() => setSellOpen(false)} title="Cerrar" className="ml-auto rounded-lg p-1"
                style={{ color: 'rgba(255,255,255,0.5)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              "{it.name}" — {available} u. a vender. Indica cuántas se vendieron; el resto sigue a la venta.
            </p>
            <label className="mb-1 block text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Unidades vendidas (máx {available})</label>
            <input type="text" inputMode="numeric" autoFocus
              style={{ ...inputStyle, width: '100%' }} value={sellUnits}
              onChange={(e) => setSellUnits(e.target.value.replace(/\D/g, ''))} />
            {pct > 0 && withDisc != null && (
              <label className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                <input type="checkbox" checked={applyDisc} onChange={(e) => setApplyDisc(e.target.checked)} />
                Aplicar {pct}% de descuento (precio ${formatThousands(withDisc)} c/u)
              </label>
            )}
            <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)' }}>
              Precio usado: <b>${formatThousands(effPrice)}</b> · Total: <b>${formatThousands(sellTotal)}</b> →{' '}
              <b>${formatThousands(perCp)}</b> por CP entre {nCp} CP{nCp === 1 ? '' : 's'}
              {sellTotal - perCp * nCp > 0 ? ` (sobran $${formatThousands(sellTotal - perCp * nCp)})` : ''}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSellOpen(false)} className={`${btnBase} px-3 py-2`} style={btnGhost}>Cancelar</button>
              <button onClick={doSell} className={`${btnBase} px-3 py-2`} style={btnTeal}>Vender</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>
          {it.imageUrl
            ? <img src={it.imageUrl} alt="" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-base">{meta.emoji}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{it.name}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {meta.emoji} {meta.label} · {it.quantity} u.
            {it.createdAt ? ` · ${new Date(it.createdAt).toLocaleDateString('es-CL')}` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ background: confirmed ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)', color: confirmed ? '#34d399' : '#fbbf24' }}>
          {confirmed ? 'Entregado' : 'Borrador'}
        </span>
        {!confirmed && (
          <button onClick={() => setModal('confirm')} disabled={effCpNames.length === 0} title="Entregar y bloquear el lote"
            className={`${btnBase} px-2.5 py-1.5`} style={btnGreen}>
            <Check className="h-3.5 w-3.5" /> Entregar
          </button>
        )}
        {available > 0 && (
          <button onClick={openSell} disabled={!hasPrice || nCp === 0} title={hasPrice ? 'Registrar venta' : 'Asigna un precio primero'}
            className={`${btnBase} px-2.5 py-1.5`} style={btnTeal}>
            <ShoppingCart className="h-3.5 w-3.5" /> Vendido
          </button>
        )}
        {confirmed && available > 0 && (
          <button onClick={() => setEditing((e) => !e)} title={editing ? 'Terminar edición' : 'Editar precio/descuento/vendedor'}
            className={`${btnBase} px-2.5 py-1.5`} style={editing ? btnGreen : btnGhost}>
            {editing ? <><Check className="h-3.5 w-3.5" /> Listo</> : <><Pencil className="h-3.5 w-3.5" /> Editar</>}
          </button>
        )}
        <button onClick={() => setModal('delete')} title="Eliminar"
          className={`${btnBase} p-1.5`} style={btnRed}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Reparto */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {it.divide === false ? (
          <>
            <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(148,163,184,0.15)', color: 'rgba(255,255,255,0.7)' }}>
              Sin dividir · {it.quantity} u. registradas · A vender: <b>0</b>
            </span>
            {!confirmed && (
              <button onClick={() => onUpdate(it.id, { divide: true })} title="Activar la división entre CPs"
                className={`${btnBase} px-2 py-1`} style={btnGhost}>
                <Split className="h-3 w-3" /> Dividir entre CPs
              </button>
            )}
          </>
        ) : effCpNames.length === 0 ? (
          <span className="text-xs" style={{ color: '#fbbf24' }}>Sin CPs participantes.</span>
        ) : effCpNames.map((n: string) => (
          <span key={n} className="rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(123,241,214,0.08)', color: '#7bf1d6' }}>
            {n}: <b>{alloc[n] ?? 0}</b>
          </span>
        ))}
        {available > 0 && (
          <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
            <ShoppingCart className="h-3 w-3" /> A vender: <b>{available}</b>
          </span>
        )}
        {view.soldUnits > 0 && (
          <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>
            Vendidas: <b>{view.soldUnits}</b>
          </span>
        )}
        {!confirmed && it.divide !== false && view.soldUnits === 0 && (
          <button onClick={() => onUpdate(it.id, { divide: false })} title="Registrar sin repartir entre CPs (A vender = 0)"
            className={`${btnBase} px-2 py-1`} style={btnGhost}>
            No dividir
          </button>
        )}
      </div>

      {/* Editor del sobrante — solo en borrador: al entregar, el reparto queda fijo. */}
      {!confirmed && remainder > 0 && (
        <RemainderEditor
          cpNames={effCpNames}
          remainder={remainder}
          value={alloc0}
          onCommit={(remainderAlloc) => onUpdate(it.id, { remainderAlloc })}
        />
      )}

      {/* Precio (normal + con descuento) + vendedor cuando hay unidades a vender */}
      {available > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>A vender →</span>
          {editable ? (
            <>
              <PriceInput value={it.price ?? null} disabled={false} onCommit={(price) => onUpdate(it.id, { price })} />
              <label className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                desc.
                <DiscountInput value={pct} disabled={false} onCommit={(p) => onUpdate(it.id, { discountPercent: p })} />%
              </label>
              <select style={{ ...inputStyle, padding: '4px 8px' }} value={it.vendorId ?? ''}
                onChange={(e) => onUpdate(it.id, { vendorId: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">Sin vendedor</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </>
          ) : (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {hasPrice ? `$${formatThousands(normalPrice)}` : 'Sin precio'} · {vendorName || 'Sin vendedor'}
            </span>
          )}
          {hasPrice && (
            <span className="rounded px-2 py-1 text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)' }}>
              Normal <b>${formatThousands(normalPrice)}</b> · con {pct}% desc. <b>${formatThousands(withDisc)}</b>
            </span>
          )}
        </div>
      )}

      {/* Historial de ventas del ítem */}
      {sales.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {sales.map((s: any) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(96,165,250,0.06)', color: 'rgba(255,255,255,0.75)' }}>
              <span className="flex-1">
                {s.units} u. a <b>${formatThousands(s.effectivePrice)}</b>
                {s.discountApplied ? ` (${s.discountPercent}% desc.)` : ''} = <b>${formatThousands(s.total)}</b> →{' '}
                <b>${formatThousands(s.adenaPerCp)}</b>/CP entre {(s.cpNames || []).length} CP
                {s.adenaRemainder > 0 ? ` (sobran $${formatThousands(s.adenaRemainder)})` : ''}
                {s.vendorName ? ` · ${s.vendorName}` : ''}
                {s.soldAt ? ` · ${new Date(s.soldAt).toLocaleDateString('es-CL')}` : ''}
              </span>
              <button onClick={() => setRevertSale(s)} title="Revertir esta venta" className={`${btnBase} px-2 py-1`} style={btnGhost}>
                <X className="h-3 w-3" /> Revertir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemsTable({
  items, cpNames, vendors, onUpdate, onConfirm, onDelete, onSell, onRevertSale,
}: {
  items: any[];
  cpNames: string[];
  vendors: any[];
  onUpdate: (id: number, patch: any) => void;
  onConfirm: (id: number) => void;
  onDelete: (id: number) => void;
  onSell: (id: number, units: number, applyDiscount: boolean) => void;
  onRevertSale: (id: number, saleId: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div style={cardStyle} className="p-8 text-center">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Aún no registras ítems para repartir.</p>
      </div>
    );
  }
  // Borradores arriba, entregados al final; dentro de cada grupo, el más
  // reciente primero y los más antiguos van quedando abajo.
  const sorted = [...items].sort((a, b) => {
    const ra = a.status === 'CONFIRMED' ? 1 : 0;
    const rb = b.status === 'CONFIRMED' ? 1 : 0;
    if (ra !== rb) return ra - rb;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  return (
    <div style={cardStyle} className="p-4">
      <h3 className="mb-3 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Ítems a repartir</h3>
      <div className="space-y-3">
        {sorted.map((it) => (
          <ItemRow key={it.id} it={it} cpNames={cpNames} vendors={vendors}
            onUpdate={onUpdate} onConfirm={onConfirm} onDelete={onDelete}
            onSell={onSell} onRevertSale={onRevertSale} />
        ))}
      </div>
    </div>
  );
}
