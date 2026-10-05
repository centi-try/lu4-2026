import { useState } from 'react';
import { toast } from 'sonner';
import { Gavel, Gift, ListOrdered, Pencil, ShoppingCart, SlidersHorizontal, Swords, Trash2, Users, Wallet } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Bar, Btn, C, ReasonDialog, dateLabel, fmtPts, inputCls, monthLabel, pctColor, todayIso } from './shared';
import type { CpDetailData } from './shared';

type LedgerType = 'purchase' | 'delivery' | 'adjust';
type EditEntry = { id: number; type: LedgerType; itemName: string | null; comment: string; points: number; date: string; auction: boolean };
const kindIcon = { event: Swords, auction: Gavel, purchase: ShoppingCart, delivery: Gift, adjust: SlidersHorizontal };

const toEdit = (h: CpDetailData['history'][number]): EditEntry | null =>
  h.ledger ? { ...h.ledger, points: h.points, date: h.date, auction: h.kind === 'auction' } : null;

export function CpDetail({ cpId, month, canAdmin, onOpenEvent }: { cpId: number; month: string; canAdmin: boolean; onOpenEvent: (id: number) => void }) {
  const q = trpc.dkp.cpDetail.useQuery({ cpId, month });
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EditEntry | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const del = trpc.dkp.deleteLedger.useMutation({
    onSuccess: () => { toast.success('Movimiento eliminado.'); setDeleting(null); },
    onError: (e) => toast.error(e.message),
    onSettled: () => utils.dkp.invalidate(),
  });

  if (!q.data) return <div className="py-10 text-center text-sm" style={{ color: C.muted }}>{q.error?.message ?? 'Cargando…'}</div>;
  const d = q.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={C.soft}>
          <Wallet className="h-4 w-4" style={{ color: C.gold }} />
          <span className="text-xs" style={{ color: C.muted }}>Saldo de la CP</span>
          <span className="font-bold" style={{ color: C.gold }}>{d.balance.toLocaleString('es-CL')} pt</span>
        </div>
        <span className="text-xs" style={{ color: C.muted }}>Movimiento de {monthLabel(month)}: <b style={{ color: d.monthPoints < 0 ? C.red : C.text }}>{fmtPts(d.monthPoints)}</b></span>
        {canAdmin && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Btn tone="gold" className="h-10 w-44" onClick={() => setAdding(true)}><Gift className="h-4 w-4" /> Ítem entregado</Btn>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl p-4" style={C.soft}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: C.text }}><ListOrdered className="h-4 w-4" style={{ color: C.accent }} /> Historial de participación</h3>
          {d.history.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: C.muted }}>Sin eventos cerrados ni movimientos en {monthLabel(month)}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: C.muted }}>
                    <th className="pb-2 pr-3 font-semibold">Fecha</th>
                    <th className="pb-2 pr-3 font-semibold">Evento / causa</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Puntos</th>
                    <th className="pb-2 font-semibold">Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {d.history.map((h) => {
                    const Icon = kindIcon[h.kind];
                    return (
                      <tr key={h.key} className="border-t align-top" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <td className="whitespace-nowrap py-2 pr-3 text-xs" style={{ color: C.muted }}>{dateLabel(h.date)}</td>
                        <td className="py-2 pr-3">
                          {h.eventId ? (
                            <button onClick={() => onOpenEvent(h.eventId!)} className="flex items-center gap-1.5 text-left hover:underline" style={{ color: C.text }}>
                              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: C.accent }} />{h.title}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1.5" style={{ color: C.text }}><Icon className="h-3.5 w-3.5 shrink-0" style={{ color: C.gold }} />{h.title}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right font-bold" style={{ color: h.points > 0 ? C.green : h.points < 0 ? C.red : C.muted }}>{fmtPts(h.points)}</td>
                        <td className="py-2 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                          <span className="flex items-start gap-2">
                            <span className="flex-1">{h.comment}</span>
                            {canAdmin && h.ledger && (
                              <>
                                <button onClick={() => setEditing(toEdit(h))} title="Editar movimiento" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:brightness-125" style={{ background: 'rgba(123,241,214,0.12)' }}>
                                  <Pencil className="h-3.5 w-3.5" style={{ color: C.accent }} />
                                </button>
                                <button onClick={() => setDeleting(h.ledger!.id)} title="Eliminar movimiento" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:brightness-125" style={{ background: 'rgba(248,113,113,0.12)' }}>
                                  <Trash2 className="h-3.5 w-3.5" style={{ color: C.red }} />
                                </button>
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl p-4" style={C.soft}>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold" style={{ color: C.text }}><Users className="h-4 w-4" style={{ color: C.accent }} /> Integrantes ({d.members.length})</h3>
          <p className="mb-3 text-[11px]" style={{ color: C.muted }}>% del mes = asistencias ÷ eventos cerrados (desde que entró a la CP).</p>
          {d.members.length === 0 && <p className="text-sm" style={{ color: C.muted }}>Sin miembros confirmados.</p>}
          <ul className="space-y-2.5">
            {d.members.map((m) => (
              <li key={m.userId} className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate" style={{ color: C.text }}>{m.name}</span>
                  {m.className && <span className="text-[11px]" style={{ color: C.muted }}>{m.className}</span>}
                  <span className="w-12 text-right text-[11px]" style={{ color: C.muted }}>{m.attended}/{m.eligible}</span>
                  <span className="w-11 text-right font-bold" style={{ color: pctColor(m.percent) }}>{m.percent == null ? '—' : `${m.percent}%`}</span>
                </div>
                <Bar value={m.percent} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      {(adding || editing) && (
        <LedgerDialog entry={editing} onClose={() => { setAdding(false); setEditing(null); }} cpId={cpId} cpName={d.cp.name} balance={d.balance} />
      )}
      <ReasonDialog open={deleting != null} onOpenChange={(v) => !v && setDeleting(null)} tone="red"
        title="¿Eliminar este movimiento?" description="Se devuelve el efecto en el saldo de la CP. Queda registrado en la auditoría."
        confirmLabel="Eliminar" pending={del.isPending} onConfirm={(reason) => deleting != null && del.mutate({ id: deleting, reason })} />
    </div>
  );
}

const ledgerTitle = (e: EditEntry | null) =>
  !e ? 'Ítem entregado' : e.auction ? 'Editar subasta ganada' : e.type === 'purchase' ? 'Editar compra' : e.type === 'delivery' ? 'Editar entrega' : 'Editar ajuste';

function LedgerDialog({ entry, onClose, cpId, cpName, balance }: { entry: EditEntry | null; onClose: () => void; cpId: number; cpName: string; balance: number }) {
  const utils = trpc.useUtils();
  const spend = !entry || entry.type !== 'adjust';
  const [itemName, setItemName] = useState(entry?.itemName ?? '');
  const [points, setPoints] = useState(entry ? String(spend ? -entry.points : entry.points) : '');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const opts = {
    onSuccess: (r: { balance: number }) => { toast.success(`Guardado. Saldo de ${cpName}: ${r.balance.toLocaleString('es-CL')} pt.`); onClose(); },
    onError: (e: { message: string }) => toast.error(e.message),
    onSettled: () => utils.dkp.invalidate(),
  };
  const add = trpc.dkp.addLedger.useMutation(opts);
  const update = trpc.dkp.updateLedger.useMutation(opts);
  const available = entry ? balance - entry.points : balance;
  const pts = Number(points.replace(',', '.'));
  const over = spend && pts > available;
  const valid = Number.isFinite(pts) && Number.isInteger(pts * 2) && (spend ? pts > 0 : pts !== 0)
    && comment.trim().length >= 2 && (!spend || itemName.trim().length > 0) && !over;
  const pending = add.isPending || update.isPending;
  function save() {
    const base = { points: pts, itemName: itemName.trim() || undefined, comment: comment.trim(), date };
    if (entry) update.mutate({ id: entry.id, ...base });
    else add.mutate({ cpId, type: 'delivery', ...base });
  }

  return (
    <AlertDialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent style={C.modal}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: C.text }}>{ledgerTitle(entry)} · {cpName}</AlertDialogTitle>
          <AlertDialogDescription>
            {spend ? 'Los puntos se descuentan del saldo de la CP.' : 'Suma (positivo) o resta (negativo) puntos al saldo.'}{' '}
            Saldo {entry ? 'sin este movimiento' : 'actual'}: <b style={{ color: C.gold }}>{available.toLocaleString('es-CL')} pt</b>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          {spend && (
            <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
              Ítem
              <input autoFocus value={itemName} onChange={(e) => setItemName(e.target.value)} maxLength={120} placeholder="Ej: Blue Soul Crystal - Stage 12" className={inputCls} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
              {spend ? 'Puntos a descontar' : 'Puntos (+ o −)'}
              <input type="number" step={0.5} min={spend ? 0.5 : undefined} value={points} onChange={(e) => setPoints(e.target.value)} className={inputCls} />
            </label>
            <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
              Fecha
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
          </div>
          {over && <p className="text-xs" style={{ color: C.red }}>Saldo insuficiente: {cpName} tiene {available.toLocaleString('es-CL')} pt.</p>}
          <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
            Comentario
            <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="Ej: acordado en la reunión del clan" className={inputCls} />
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Btn solid tone="gold" disabled={!valid || pending} onClick={save}>{entry ? 'Guardar cambios' : 'Registrar'}</Btn>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
