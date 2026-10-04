import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronLeft, ChevronRight, Crown, Gavel, Hourglass, Package, Plus, Search, Trash2, Trophy, Wallet, XCircle } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge, Btn, C, ReasonDialog, dateTimeLabel, inputCls } from './shared';
import type { Auction, AuctionsData } from './shared';

const pts = (n: number) => `${n.toLocaleString('es-CL')} pt`;
const DURATIONS = [
  { label: '30 min', ms: 30 * 60_000 },
  { label: '1 h', ms: 3600_000 },
  { label: '3 h', ms: 3 * 3600_000 },
  { label: '12 h', ms: 12 * 3600_000 },
  { label: '24 h', ms: 24 * 3600_000 },
  { label: '3 días', ms: 72 * 3600_000 },
];
const PAGE = 10;

function countdown(ms: number) {
  if (ms <= 0) return 'Cerrando…';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Reloj sincronizado con la hora del servidor. */
function useServerNow(serverNow?: string) {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (serverNow) setOffset(Date.parse(serverNow) - Date.now()); }, [serverNow]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now + offset;
}

export function AuctionsTab() {
  const utils = trpc.useUtils();
  const q = trpc.dkp.auctions.useQuery(undefined, { refetchInterval: 5_000 });
  const data = q.data;
  const now = useServerNow(data?.now);
  const [creating, setCreating] = useState(false);
  const expired = data?.open.some((a) => Date.parse(a.endsAt) <= now) ?? false;
  useEffect(() => { if (expired) void utils.dkp.auctions.invalidate(); }, [expired, utils]);

  if (!data) return <div className="py-16 text-center text-sm" style={{ color: C.muted }}>{q.error?.message ?? 'Cargando…'}</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-xs" style={{ color: C.muted }}>
          Solo los líderes de CP pujan con el saldo de su CP (mínimo 1 pt). Al vencer el tiempo, la subasta se cierra sola y la puja más alta gana.
        </p>
        {data.canAdmin && <Btn solid onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nueva subasta</Btn>}
      </div>

      {data.myCps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.myCps.map((cp) => (
            <div key={cp.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ ...C.soft, borderColor: 'rgba(251,191,36,0.25)' }}>
              <Wallet className="h-4 w-4" style={{ color: C.gold }} />
              <span className="text-sm font-semibold" style={{ color: C.text }}>{cp.name}</span>
              <span className="text-xs" style={{ color: C.muted }}>Disponible para pujar</span>
              <b style={{ color: C.gold }}>{pts(cp.available)}</b>
              {cp.committed > 0 && <span className="text-[11px]" style={{ color: C.muted }}>({pts(cp.committed)} comprometidos de {pts(cp.balance)})</span>}
            </div>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: C.green }} /> En curso ({data.open.length})
        </h2>
        {data.open.length === 0 ? (
          <p className="rounded-xl p-6 text-center text-sm" style={{ ...C.panel, color: C.muted }}>
            No hay subastas abiertas.{data.canAdmin ? ' Crea una con "Nueva subasta".' : ''}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.open.map((a) => <AuctionCard key={a.id} a={a} data={data} now={now} />)}
          </div>
        )}
      </section>

      <FinishedList data={data} />

      <CreateAuctionDialog open={creating} onOpenChange={setCreating} itemTypes={data.itemTypes} />
    </div>
  );
}

function AuctionCard({ a, data, now }: { a: Auction; data: AuctionsData; now: number }) {
  const utils = trpc.useUtils();
  const left = Date.parse(a.endsAt) - now;
  const min = (a.topBid?.amount ?? 0) + 1;
  const [cpId, setCpId] = useState<number | null>(data.myCps[0]?.id ?? null);
  const [amount, setAmount] = useState('');
  const [showBids, setShowBids] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const onError = (e: { message: string }) => toast.error(e.message);
  const bid = trpc.dkp.placeBid.useMutation({
    onSuccess: () => { toast.success('Puja registrada.'); setAmount(''); },
    onError, onSettled: () => utils.dkp.invalidate(),
  });
  const cancel = trpc.dkp.cancelAuction.useMutation({
    onSuccess: () => { toast.success('Subasta anulada.'); setCancelling(false); },
    onError, onSettled: () => utils.dkp.invalidate(),
  });
  const myCp = data.myCps.find((c) => c.id === cpId);
  const leading = !!a.topBid && data.myCps.some((c) => c.id === a.topBid!.cpId);
  const available = myCp ? myCp.available + (a.topBid?.cpId === myCp.id ? a.topBid.amount : 0) : 0;
  const n = Number(amount);
  const valid = myCp && Number.isInteger(n) && n >= min && n <= available && left > 0;
  const urgent = left > 0 && left < 5 * 60_000;

  return (
    <div className="flex flex-col gap-3 rounded-2xl p-4" style={{ ...C.panel, borderColor: leading ? 'rgba(52,211,153,0.45)' : 'rgba(251,191,36,0.25)' }}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(251,191,36,0.12)' }}>
          <Package className="h-5 w-5" style={{ color: C.gold }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold" style={{ color: C.text }}>{a.itemName}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="gold">{a.itemType}</Badge>
            <span className="text-[11px]" style={{ color: C.muted }}>#{a.id} · por {a.createdBy}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider" style={{ color: C.muted }}><Hourglass className="h-3 w-3" /> Cierra en</div>
          <div className="font-mono text-sm font-bold" style={{ color: urgent ? C.red : C.text }}>{countdown(left)}</div>
          <div className="text-[10px]" style={{ color: C.muted }}>{dateTimeLabel(a.endsAt)}</div>
        </div>
      </div>
      {a.notes && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{a.notes}</p>}

      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={C.soft}>
        <Trophy className="h-4 w-4" style={{ color: a.topBid ? C.gold : C.muted }} />
        {a.topBid ? (
          <div className="min-w-0 flex-1">
            <div className="text-[11px]" style={{ color: C.muted }}>Puja más alta</div>
            <div className="truncate text-sm" style={{ color: C.text }}><b>{a.topBid.cpName}</b> <span style={{ color: C.muted }}>· {a.topBid.by}</span></div>
          </div>
        ) : (
          <span className="flex-1 text-sm" style={{ color: C.muted }}>Sin pujas todavía · mínimo 1 pt</span>
        )}
        {a.topBid && <span className="text-lg font-bold" style={{ color: C.gold }}>{pts(a.topBid.amount)}</span>}
      </div>
      {leading && <p className="text-xs font-semibold" style={{ color: C.green }}>Tu CP va ganando esta subasta.</p>}

      {data.myCps.length > 0 && left > 0 && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            {data.myCps.length > 1 && (
              <select value={cpId ?? ''} onChange={(e) => setCpId(Number(e.target.value))} className={`${inputCls} !w-28`}>
                {data.myCps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <input type="number" min={min} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Mín. ${min} pt`} className={`${inputCls} flex-1`}
              onKeyDown={(e) => { if (e.key === 'Enter' && valid) bid.mutate({ auctionId: a.id, cpId: cpId!, amount: n }); }} />
            <Btn solid tone="gold" disabled={!valid || bid.isPending} onClick={() => bid.mutate({ auctionId: a.id, cpId: cpId!, amount: n })}>
              <Gavel className="h-4 w-4" /> Pujar
            </Btn>
          </div>
          <p className="text-[11px]" style={{ color: amount && n > available ? C.red : C.muted }}>
            {amount && n > available ? `Saldo insuficiente: ${myCp?.name} puede pujar hasta ${pts(available)}.` : `Puedes pujar de ${pts(min)} hasta ${pts(available)}.`}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => setShowBids((v) => !v)} disabled={!a.bidCount} className="flex items-center gap-1 text-xs font-semibold disabled:opacity-50" style={{ color: C.muted }}>
          Pujas ({a.bidCount}) <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBids ? 'rotate-180' : ''}`} />
        </button>
        {data.canAdmin && <Btn tone="red" className="ml-auto !px-2.5 !py-1 text-xs" onClick={() => setCancelling(true)}><XCircle className="h-3.5 w-3.5" /> Anular</Btn>}
      </div>
      {showBids && <BidList a={a} />}

      <ReasonDialog open={cancelling} onOpenChange={setCancelling} tone="red"
        title={`¿Anular la subasta de "${a.itemName}"?`} description="Nadie gana y no se descuentan puntos."
        confirmLabel="Anular subasta" pending={cancel.isPending} onConfirm={(reason) => cancel.mutate({ id: a.id, reason })} />
    </div>
  );
}

function BidList({ a }: { a: Auction }) {
  return (
    <ol className="space-y-1 rounded-xl p-2 text-xs" style={C.soft}>
      {a.bids.map((b, i) => (
        <li key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-1" style={i === 0 ? { background: 'rgba(251,191,36,0.08)' } : undefined}>
          {i === 0 ? <Crown className="h-3.5 w-3.5" style={{ color: C.gold }} /> : <span className="w-3.5" />}
          <b style={{ color: C.text }}>{b.cpName}</b>
          <span className="truncate" style={{ color: C.muted }}>{b.by} · {dateTimeLabel(b.at)}</span>
          <b className="ml-auto" style={{ color: i === 0 ? C.gold : 'rgba(255,255,255,0.7)' }}>{pts(b.amount)}</b>
        </li>
      ))}
      {a.bidCount > a.bids.length && <li className="px-2 pt-1" style={{ color: C.muted }}>y {a.bidCount - a.bids.length} pujas más bajas</li>}
    </ol>
  );
}

function FinishedList({ data }: { data: AuctionsData }) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Auction | null>(null);
  const remove = trpc.dkp.deleteAuction.useMutation({
    onSuccess: () => { toast.success('Subasta eliminada.'); setDeleting(null); },
    onError: (e) => toast.error(e.message), onSettled: () => utils.dkp.invalidate(),
  });
  const term = search.trim().toLowerCase();
  const list = useMemo(() => data.finished.filter((a) => !term || a.itemName.toLowerCase().includes(term) || a.itemType.toLowerCase().includes(term)
    || (a.winner?.cpName.toLowerCase().includes(term) ?? false)), [data.finished, term]);
  useEffect(() => setPage(0), [term]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <section className="space-y-3 rounded-2xl p-4" style={C.panel}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>Finalizadas ({data.finished.length})</h2>
        <label className="ml-auto flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={C.soft}>
          <Search className="h-3.5 w-3.5" style={{ color: C.muted }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ítem o CP" className="w-36 bg-transparent text-xs outline-none" style={{ color: C.text }} />
        </label>
      </div>
      {list.length === 0 ? (
        <p className="py-5 text-center text-sm" style={{ color: C.muted }}>{term ? 'Ninguna subasta coincide.' : 'Aún no hay subastas finalizadas.'}</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl" style={{ ...C.soft, borderColor: 'rgba(255,255,255,0.05)' }}>
          {shown.map((a) => (
            <li key={a.id} style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <button onClick={() => setOpen((v) => (v === a.id ? null : a.id))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="w-28 shrink-0 text-xs" style={{ color: C.muted }}>{dateTimeLabel(a.closedAt ?? a.endsAt)}</span>
                  <span className={`truncate font-semibold ${a.status === 'cancelled' ? 'line-through opacity-70' : ''}`} style={{ color: C.text }}>{a.itemName}</span>
                  <Badge tone="muted">{a.itemType}</Badge>
                  <span className="ml-auto truncate text-xs" style={{ color: a.winner ? C.green : C.muted }}>
                    {a.status === 'cancelled' ? 'Anulada' : a.winner ? `Ganó ${a.winner.cpName}` : 'Desierta (sin pujas)'}
                  </span>
                  {a.winner && <b className="w-16 text-right text-xs" style={{ color: C.gold }}>{pts(a.winner.amount)}</b>}
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open === a.id ? 'rotate-180' : ''}`} style={{ color: C.muted }} />
                </button>
                {data.canAdmin && a.status === 'cancelled' && (
                  <button onClick={() => setDeleting(a)} title="Eliminar subasta" className="opacity-60 hover:opacity-100"><Trash2 className="h-4 w-4" style={{ color: C.red }} /></button>
                )}
              </div>
              {open === a.id && (
                <div className="space-y-2 px-3 pb-3">
                  {a.cancelReason && <p className="text-xs" style={{ color: '#fca5a5' }}>Motivo de anulación: {a.cancelReason}</p>}
                  {a.bidCount ? <BidList a={a} /> : <p className="text-xs" style={{ color: C.muted }}>Nadie pujó.</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs" style={{ color: C.muted }}>
          <span>{page * PAGE + 1}–{Math.min(list.length, (page + 1) * PAGE)} de {list.length}</span>
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} className="rounded-lg p-1.5 hover:bg-white/5 disabled:opacity-30" aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span>{page + 1}/{pages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1} className="rounded-lg p-1.5 hover:bg-white/5 disabled:opacity-30" aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}

      <AlertDialog open={deleting != null} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent style={C.modal}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.text }}>¿Eliminar la subasta de "{deleting?.itemName}"?</AlertDialogTitle>
            <AlertDialogDescription>Está anulada y no afectó saldos. Se borra definitivamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Btn tone="red" solid disabled={remove.isPending} onClick={() => deleting && remove.mutate({ id: deleting.id })}><Trash2 className="h-4 w-4" /> Eliminar</Btn>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

type ItemType = AuctionsData['itemTypes'][number];

function CreateAuctionDialog({ open, onOpenChange, itemTypes }: { open: boolean; onOpenChange: (v: boolean) => void; itemTypes: AuctionsData['itemTypes'] }) {
  const utils = trpc.useUtils();
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState<ItemType | ''>('');
  const [notes, setNotes] = useState('');
  const [endsAt, setEndsAt] = useState('');
  useEffect(() => {
    if (!open) return;
    setItemName('');
    setItemType('');
    setNotes('');
    setEndsAt(localInput(new Date(Date.now() + 3600_000)));
  }, [open]);
  const create = trpc.dkp.createAuction.useMutation({
    onSuccess: () => { toast.success('Subasta abierta. Los líderes ya pueden pujar.'); onOpenChange(false); },
    onError: (e) => toast.error(e.message), onSettled: () => utils.dkp.invalidate(),
  });
  const ends = endsAt ? new Date(endsAt) : null;
  const msLeft = ends ? ends.getTime() - Date.now() : 0;
  const valid = itemName.trim().length >= 2 && itemType !== '' && ends != null && !Number.isNaN(ends.getTime()) && msLeft >= 60_000;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg" style={C.modal}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: C.text }}>Nueva subasta</AlertDialogTitle>
          <AlertDialogDescription>Se cierra sola al llegar la hora. Gana la CP con la puja más alta y se descuenta de su saldo.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
            Ítem
            <input autoFocus value={itemName} onChange={(e) => setItemName(e.target.value)} maxLength={120} placeholder="Ej: Blue Soul Crystal - Stage 12" className={inputCls} />
          </label>
          <div className="space-y-1 text-xs" style={{ color: C.muted }}>
            Tipo
            <Select value={itemType} onValueChange={(v) => setItemType(v as ItemType)}>
              <SelectTrigger className="h-10 w-full rounded-lg border-white/10 bg-white/[0.04] text-sm text-white/90 hover:border-amber-300/40">
                <SelectValue placeholder="Elige el tipo de ítem" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-white/10 text-white/90" style={{ background: '#1e1e2e' }}>
                {itemTypes.map((t) => <SelectItem key={t} value={t} className="rounded-lg focus:bg-amber-300/10 focus:text-white">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 text-xs" style={{ color: C.muted }}>
            Cierre de la subasta
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button key={d.label} onClick={() => setEndsAt(localInput(new Date(Date.now() + d.ms)))}
                  className="rounded-lg px-2.5 py-1 font-semibold hover:brightness-125" style={{ background: 'rgba(251,191,36,0.1)', color: C.gold, border: '1px solid rgba(251,191,36,0.2)' }}>
                  {d.label}
                </button>
              ))}
            </div>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} />
            <p style={{ color: msLeft < 60_000 && endsAt ? C.red : C.muted }}>
              {msLeft < 60_000 ? 'Debe cerrar al menos 1 minuto en el futuro.' : `Dura ${countdown(msLeft)}.`}
            </p>
          </div>
          <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
            Nota (opcional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Ej: +0, drop del boss del sábado" className={inputCls} />
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Btn solid tone="gold" disabled={!valid || create.isPending}
            onClick={() => ends && itemType && create.mutate({ itemName: itemName.trim(), itemType, notes: notes.trim() || undefined, endsAt: ends.toISOString() })}>
            <Gavel className="h-4 w-4" /> Abrir subasta
          </Btn>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
