import { useState } from 'react';
import { toast } from 'sonner';
import { Gift, ListOrdered, ShoppingCart, SlidersHorizontal, Swords, Trash2, Users, Wallet } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Bar, Btn, C, ReasonDialog, dateLabel, fmtPts, inputCls, monthLabel, pctColor, todayIso } from './shared';

type LedgerType = 'purchase' | 'delivery' | 'adjust';
const kindIcon = { event: Swords, purchase: ShoppingCart, delivery: Gift, adjust: SlidersHorizontal };

export function CpDetail({ cpId, month, canAdmin, onOpenEvent }: { cpId: number; month: string; canAdmin: boolean; onOpenEvent: (id: number) => void }) {
  const q = trpc.dkp.cpDetail.useQuery({ cpId, month });
  const utils = trpc.useUtils();
  const [ledgerType, setLedgerType] = useState<LedgerType | null>(null);
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
            <Btn tone="gold" onClick={() => setLedgerType('purchase')}><ShoppingCart className="h-4 w-4" /> Compra con DKP</Btn>
            <Btn tone="gold" onClick={() => setLedgerType('delivery')}><Gift className="h-4 w-4" /> Ítem entregado</Btn>
            <Btn tone="muted" onClick={() => setLedgerType('adjust')}><SlidersHorizontal className="h-4 w-4" /> Ajuste</Btn>
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
                            {canAdmin && h.ledgerId && (
                              <button onClick={() => setDeleting(h.ledgerId!)} title="Eliminar movimiento" className="opacity-60 hover:opacity-100">
                                <Trash2 className="h-3.5 w-3.5" style={{ color: C.red }} />
                              </button>
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

      <LedgerDialog type={ledgerType} onClose={() => setLedgerType(null)} cpId={cpId} cpName={d.cp.name} balance={d.balance} />
      <ReasonDialog open={deleting != null} onOpenChange={(v) => !v && setDeleting(null)} tone="red"
        title="¿Eliminar este movimiento?" description="Se devuelve el efecto en el saldo de la CP. Queda registrado en la auditoría."
        confirmLabel="Eliminar" pending={del.isPending} onConfirm={(reason) => deleting != null && del.mutate({ id: deleting, reason })} />
    </div>
  );
}

const ledgerCopy: Record<LedgerType, { title: string; desc: string; item: boolean }> = {
  purchase: { title: 'Compra con DKP', desc: 'La CP compra un ítem con sus puntos. Se descuenta del saldo.', item: true },
  delivery: { title: 'Ítem entregado', desc: 'Se le entregó un ítem a la CP a cambio de puntos. Se descuenta del saldo.', item: true },
  adjust: { title: 'Ajuste manual', desc: 'Suma (número positivo) o resta (negativo) puntos al saldo, por ejemplo un bono o una penalización.', item: false },
};

function LedgerDialog({ type, onClose, cpId, cpName, balance }: { type: LedgerType | null; onClose: () => void; cpId: number; cpName: string; balance: number }) {
  const utils = trpc.useUtils();
  const [itemName, setItemName] = useState('');
  const [points, setPoints] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(todayIso());
  const reset = () => { setItemName(''); setPoints(''); setComment(''); setDate(todayIso()); };
  const add = trpc.dkp.addLedger.useMutation({
    onSuccess: (r) => { toast.success(`Registrado. Saldo de ${cpName}: ${r.balance} pt.`); reset(); onClose(); },
    onError: (e) => toast.error(e.message),
    onSettled: () => utils.dkp.invalidate(),
  });
  if (!type) return null;
  const copy = ledgerCopy[type];
  const pts = Number(points);
  const spend = type !== 'adjust';
  const over = spend && pts > balance;
  const valid = Number.isInteger(pts) && (spend ? pts > 0 : pts !== 0) && comment.trim().length >= 2 && (!copy.item || itemName.trim().length > 0) && !over;

  return (
    <AlertDialog open onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title} · {cpName}</AlertDialogTitle>
          <AlertDialogDescription>{copy.desc} Saldo actual: <b style={{ color: C.gold }}>{balance} pt</b>.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          {copy.item && (
            <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
              Ítem
              <input autoFocus value={itemName} onChange={(e) => setItemName(e.target.value)} maxLength={120} placeholder="Ej: Blue Soul Crystal - Stage 12" className={inputCls} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
              {spend ? 'Puntos a descontar' : 'Puntos (+ o −)'}
              <input type="number" step={1} min={spend ? 1 : undefined} value={points} onChange={(e) => setPoints(e.target.value)} className={inputCls} />
            </label>
            <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
              Fecha
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
          </div>
          {over && <p className="text-xs" style={{ color: C.red }}>Saldo insuficiente: {cpName} tiene {balance} pt.</p>}
          <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
            Comentario
            <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="Ej: acordado en la reunión del clan" className={inputCls} />
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Btn solid tone="gold" disabled={!valid || add.isPending}
            onClick={() => add.mutate({ cpId, type, points: pts, itemName: itemName.trim() || undefined, comment: comment.trim(), date })}>
            Registrar
          </Btn>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
