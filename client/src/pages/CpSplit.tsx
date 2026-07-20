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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()}
        style={{ background: '#141821', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: danger ? 'rgba(248,113,113,0.14)' : 'rgba(123,241,214,0.14)' }}>
            <AlertTriangle className="h-4 w-4" style={{ color: danger ? '#f87171' : '#7bf1d6' }} />
          </div>
          <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>{title}</h3>
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
  title, icon, items, onCreate, onRename, onDelete, placeholder,
}: {
  title: string;
  icon: React.ReactNode;
  items: any[];
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  placeholder: string;
}) {
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [delItem, setDelItem] = useState<{ id: number; name: string } | null>(null);

  return (
    <div style={cardStyle} className="p-4">
      <ConfirmModal
        open={!!delItem}
        title="Eliminar registro"
        message={`¿Seguro que quieres eliminar "${delItem?.name ?? ''}"? Se quitará de las asignaciones de sobrante de los ítems en borrador.`}
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
                  <button onClick={() => { const n = editName.trim(); if (n) onRename(it.id, n); setEditId(null); }}
                    title="Guardar"><Check className="h-3.5 w-3.5" style={{ color: '#34d399' }} /></button>
                  <button onClick={() => setEditId(null)} title="Cancelar"><X className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} /></button>
                </>
              ) : (
                <>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.85)' }}>{it.name}</span>
                  <button onClick={() => { setEditId(it.id); setEditName(it.name); }} title="Renombrar">
                    <Pencil className="h-3 w-3" style={{ color: 'rgba(255,255,255,0.45)' }} /></button>
                  <button onClick={() => setDelItem({ id: it.id, name: it.name })} title="Eliminar">
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
  const isSA = String(user?.role || '').toLowerCase() === 'super_admin';

  const utils = trpc.useUtils();
  const enabled = !!user && isSA;

  const { data: participants = [] } = trpc.cpSplit.participants.list.useQuery(undefined, { enabled });
  const { data: vendors = [] } = trpc.cpSplit.vendors.list.useQuery(undefined, { enabled });
  const { data: items = [] } = trpc.cpSplit.items.list.useQuery(undefined, { enabled });
  const { data: history = [] } = trpc.cpSplit.history.list.useQuery(undefined, { enabled });

  const cpNames = useMemo(() => (participants as any[]).map((c) => String(c.name)), [participants]);

  // ---- registro de ítem ----
  const [itemName, setItemName] = useState('');
  const [itemCat, setItemCat] = useState('');
  const [itemImg, setItemImg] = useState('');
  const [itemQty, setItemQty] = useState<string>('1');

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
    onSuccess: () => { utils.cpSplit.participants.list.invalidate(); invAll(); },
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
    onSuccess: () => { utils.cpSplit.vendors.list.invalidate(); invAll(); },
    onError: (e) => toast.error(e.message),
  });

  const iCreate = trpc.cpSplit.items.create.useMutation({
    onSuccess: () => { invAll(); toast.success('Ítem agregado (borrador). Confírmalo para guardarlo.'); },
    onError: (e) => toast.error(e.message),
  });
  const iUpdate = trpc.cpSplit.items.update.useMutation({
    onSuccess: () => invAll(),
    onError: (e) => toast.error(e.message),
  });
  const iConfirm = trpc.cpSplit.items.confirm.useMutation({
    onSuccess: () => { invAll(); toast.success('Ítem confirmado y guardado.'); },
    onError: (e) => toast.error(e.message),
  });
  const iDelete = trpc.cpSplit.items.delete.useMutation({
    onSuccess: () => { invAll(); toast.success('Ítem eliminado.'); },
    onError: (e) => toast.error(e.message),
  });
  const exportMut = trpc.cpSplit.exportExcel.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const addItem = () => {
    const n = itemName.trim();
    if (!n) { toast.error('Escribe el nombre del ítem.'); return; }
    const qty = Math.floor(Number(itemQty));
    if (!qty || qty < 1) { toast.error('La cantidad debe ser al menos 1.'); return; }
    iCreate.mutate({ name: n, category: itemCat, imageUrl: itemImg, quantity: qty });
    setItemName(''); setItemCat(''); setItemImg(''); setItemQty('1');
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
        </div>

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
            onCreate={(name) => vCreate.mutate({ name })}
            onRename={(id, name) => vRename.mutate({ id, name })}
            onDelete={(id) => vDelete.mutate({ id })}
          />
        </div>

        {/* Registro de ítems */}
        <div style={cardStyle} className="p-4">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Registro de ítems</h3>
          <div className="grid items-end gap-3" style={{ gridTemplateColumns: '2fr 1fr 100px auto' }}>
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
          <p className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {cpNames.length === 0
              ? '⚠️ Registra al menos una CP participante para poder confirmar ítems.'
              : `Reparto entre ${cpNames.length} CP. Lo que no divide se marca "a vender" (o se asigna a una CP).`}
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
  it, cpNames, vendors, onUpdate, onConfirm, onDelete,
}: {
  it: any;
  cpNames: string[];
  vendors: any[];
  onUpdate: (id: number, patch: any) => void;
  onConfirm: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const confirmed = it.status === 'CONFIRMED';
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState<null | 'confirm' | 'delete'>(null);
  const editable = !confirmed || editing;

  const effCpNames: string[] = confirmed && Array.isArray(it.cpNamesSnapshot) ? it.cpNamesSnapshot.map(String) : cpNames;
  const alloc0 = remainderAllocOf(it);
  const { alloc, toSell, remainder } = computeAllocation(it.quantity, effCpNames, alloc0);
  const meta = categoryMeta[it.category] || { emoji: '📦', label: it.category || 'Sin categoría', color: '#7bf1d6' };
  const vendorName = vendors.find((v) => Number(v.id) === Number(it.vendorId))?.name;

  return (
    <div className="rounded-xl p-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${confirmed ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.25)'}` }}>
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
        title="Confirmar ítem"
        danger={false}
        message={`Confirmar "${it.name}" congela las CPs participantes actuales. Podrás seguir editando precio/vendedor y el reparto con el lápiz.`}
        confirmLabel="Confirmar"
        onConfirm={() => { onConfirm(it.id); setModal(null); }}
        onCancel={() => setModal(null)}
      />

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>
          {it.imageUrl
            ? <img src={it.imageUrl} alt="" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-base">{meta.emoji}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{it.name}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{meta.emoji} {meta.label} · {it.quantity} u.</p>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ background: confirmed ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)', color: confirmed ? '#34d399' : '#fbbf24' }}>
          {confirmed ? 'Confirmado' : 'Borrador'}
        </span>
        {!confirmed && (
          <button onClick={() => setModal('confirm')} disabled={effCpNames.length === 0} title="Confirmar y guardar"
            className={`${btnBase} px-2.5 py-1.5`} style={btnGreen}>
            <Check className="h-3.5 w-3.5" /> Confirmar
          </button>
        )}
        {confirmed && (
          <button onClick={() => setEditing((e) => !e)} title={editing ? 'Terminar edición' : 'Editar'}
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
      <div className="mt-3 flex flex-wrap gap-2">
        {effCpNames.length === 0 ? (
          <span className="text-xs" style={{ color: '#fbbf24' }}>Sin CPs participantes.</span>
        ) : effCpNames.map((n: string) => (
          <span key={n} className="rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(123,241,214,0.08)', color: '#7bf1d6' }}>
            {n}: <b>{alloc[n] ?? 0}</b>
          </span>
        ))}
        {toSell > 0 && (
          <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
            <ShoppingCart className="h-3 w-3" /> A vender: <b>{toSell}</b>
          </span>
        )}
      </div>

      {/* Editor del sobrante */}
      {editable && remainder > 0 && (
        <RemainderEditor
          cpNames={effCpNames}
          remainder={remainder}
          value={alloc0}
          onCommit={(remainderAlloc) => onUpdate(it.id, { remainderAlloc })}
        />
      )}

      {/* Precio + vendedor cuando hay unidades a vender */}
      {toSell > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>A vender →</span>
          {editable ? (
            <>
              <PriceInput value={it.price ?? null} disabled={false} onCommit={(price) => onUpdate(it.id, { price })} />
              <select style={{ ...inputStyle, padding: '4px 8px' }} value={it.vendorId ?? ''}
                onChange={(e) => onUpdate(it.id, { vendorId: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">Sin vendedor</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </>
          ) : (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {it.price != null ? `$${formatThousands(it.price)}` : 'Sin precio'} · {vendorName || 'Sin vendedor'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ItemsTable({
  items, cpNames, vendors, onUpdate, onConfirm, onDelete,
}: {
  items: any[];
  cpNames: string[];
  vendors: any[];
  onUpdate: (id: number, patch: any) => void;
  onConfirm: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div style={cardStyle} className="p-8 text-center">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Aún no registras ítems para repartir.</p>
      </div>
    );
  }
  return (
    <div style={cardStyle} className="p-4">
      <h3 className="mb-3 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Ítems a repartir</h3>
      <div className="space-y-3">
        {items.map((it) => (
          <ItemRow key={it.id} it={it} cpNames={cpNames} vendors={vendors}
            onUpdate={onUpdate} onConfirm={onConfirm} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}
