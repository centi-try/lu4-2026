import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Split, Plus, Trash2, Check, Store, Users, Download, Pencil, X, Clock, ShoppingCart,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { ItemTypeahead } from '../components/inventory/ItemTypeahead';
import { useAuth } from '../contexts/AuthContext';
import { categoryMeta } from '../lib/category-meta';
import { trpc } from '../lib/trpc';

type RemainderAction = 'SELL' | 'ASSIGN';

// Mismo reparto que el backend: cada CP recibe floor(cantidad / nCP); el
// sobrante va "a vender" salvo que se asigne a una CP concreta.
function computeAllocation(
  quantity: number,
  cpNames: string[],
  remainderAction: RemainderAction,
  assignedCp: string | null,
) {
  const n = cpNames.length;
  const qty = Math.max(0, Number(quantity) || 0);
  const perCp = n > 0 ? Math.floor(qty / n) : 0;
  const remainder = n > 0 ? qty - perCp * n : qty;
  const alloc: Record<string, number> = {};
  for (const name of cpNames) alloc[name] = perCp;
  let toSell = 0;
  if (remainder > 0) {
    if (remainderAction === 'ASSIGN' && assignedCp && cpNames.includes(assignedCp)) {
      alloc[assignedCp] = (alloc[assignedCp] || 0) + remainder;
    } else {
      toSell = remainder;
    }
  }
  return { perCp, remainder, alloc, toSell };
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

// Precio con estado local: solo escribe al backend al salir del campo (onBlur)
// o con Enter, en vez de una llamada por cada tecla.
function PriceInput({
  value, disabled, onCommit,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (price: number | null) => void;
}) {
  const [local, setLocal] = useState<string>(value != null ? String(value) : '');
  useEffect(() => { setLocal(value != null ? String(value) : ''); }, [value]);

  const commit = () => {
    const trimmed = local.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next === value) return;
    if (next != null && (Number.isNaN(next) || next < 0)) { setLocal(value != null ? String(value) : ''); return; }
    onCommit(next);
  };

  return (
    <input
      type="number" min={0} placeholder="Precio" disabled={disabled}
      style={{ ...inputStyle, width: 130, padding: '4px 8px', opacity: disabled ? 0.7 : 1 }}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
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

  return (
    <div style={cardStyle} className="p-4">
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
                  <button onClick={() => onDelete(it.id)} title="Eliminar">
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
  const [itemQty, setItemQty] = useState<number>(1);

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
    if (!itemQty || itemQty < 1) { toast.error('La cantidad debe ser al menos 1.'); return; }
    iCreate.mutate({ name: n, category: itemCat, imageUrl: itemImg, quantity: Number(itemQty) });
    setItemName(''); setItemCat(''); setItemImg(''); setItemQty(1);
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
              <input style={{ ...inputStyle, width: '100%' }} value={itemCat} onChange={(e) => setItemCat(e.target.value)} placeholder="Categoría" />
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Cantidad</label>
              <input type="number" min={1} style={{ ...inputStyle, width: '100%' }} value={itemQty}
                onChange={(e) => setItemQty(Number(e.target.value))} />
            </div>
            <button onClick={addItem} disabled={iCreate.isPending}
              className="flex h-[34px] items-center gap-1 rounded-lg px-4 text-xs font-semibold disabled:opacity-40"
              style={{ background: 'rgba(123,241,214,0.15)', color: '#7bf1d6' }}>
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
        {items.map((it) => {
          const effCpNames = it.status === 'CONFIRMED' && Array.isArray(it.cpNamesSnapshot)
            ? it.cpNamesSnapshot.map(String) : cpNames;
          const { alloc, toSell, remainder } = computeAllocation(it.quantity, effCpNames, it.remainderAction, it.assignedCp);
          const confirmed = it.status === 'CONFIRMED';
          const meta = categoryMeta[it.category] || { emoji: '📦', label: it.category || 'Sin categoría', color: '#7bf1d6' };
          return (
            <div key={it.id} className="rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${confirmed ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.25)'}` }}>
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
                  <button onClick={() => onConfirm(it.id)} title="Confirmar y guardar"
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                    style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
                    <Check className="h-3.5 w-3.5" /> Confirmar
                  </button>
                )}
                <button onClick={() => onDelete(it.id)} title="Eliminar"
                  className="rounded-lg p-1.5" style={{ background: 'rgba(248,113,113,0.12)' }}>
                  <Trash2 className="h-3.5 w-3.5" style={{ color: '#f87171' }} />
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

              {/* Controles del sobrante (solo borrador) */}
              {!confirmed && remainder > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Sobrante:</span>
                  <select style={{ ...inputStyle, padding: '4px 8px' }} value={it.remainderAction}
                    onChange={(e) => onUpdate(it.id, { remainderAction: e.target.value })}>
                    <option value="SELL">A vender</option>
                    <option value="ASSIGN" disabled={effCpNames.length === 0}>Asignar a una CP</option>
                  </select>
                  {it.remainderAction === 'ASSIGN' && (
                    <select style={{ ...inputStyle, padding: '4px 8px' }} value={it.assignedCp || ''}
                      onChange={(e) => onUpdate(it.id, { assignedCp: e.target.value || null })}>
                      <option value="">Elegir CP…</option>
                      {effCpNames.map((n: string) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                </div>
              ) : null}

              {/* Precio + vendedor cuando hay unidades a vender */}
              {toSell > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>A vender →</span>
                  <PriceInput
                    value={it.price ?? null}
                    disabled={confirmed}
                    onCommit={(price) => onUpdate(it.id, { price })}
                  />
                  <select style={{ ...inputStyle, padding: '4px 8px', opacity: confirmed ? 0.7 : 1 }} disabled={confirmed}
                    value={it.vendorId ?? ''}
                    onChange={(e) => onUpdate(it.id, { vendorId: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">Sin vendedor</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
