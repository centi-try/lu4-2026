import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../../server/routers';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';

type Out = inferRouterOutputs<AppRouter>['dkp'];
export type Overview = Out['overview'];
export type OverviewCp = Overview['cps'][number];
export type OverviewEvent = Overview['events'][number];
export type CpDetailData = Out['cpDetail'];
export type EventDetailData = Out['eventDetail'];
export type EventCp = EventDetailData['cps'][number];

export const C = {
  panel: { background: 'rgba(10,14,22,0.85)', border: '1px solid rgba(255,255,255,0.08)' } as CSSProperties,
  soft: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' } as CSSProperties,
  muted: 'rgba(255,255,255,0.45)',
  text: 'rgba(255,255,255,0.9)',
  accent: '#7bf1d6',
  gold: '#fbbf24',
  red: '#f87171',
  green: '#34d399',
};

export const pad = (n: number) => String(n).padStart(2, '0');
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const currentMonth = () => todayIso().slice(0, 7);
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
export const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
export const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtPts = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('es-CL')} pt`;
export const pctColor = (p: number | null) => (p == null ? C.muted : p >= 75 ? C.green : p >= 40 ? C.gold : C.red);

type Tone = 'accent' | 'gold' | 'red' | 'green' | 'muted';
const toneColor: Record<Tone, string> = { accent: C.accent, gold: C.gold, red: C.red, green: C.green, muted: 'rgba(255,255,255,0.55)' };

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const c = toneColor[tone];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: c, background: `${c}1f`, border: `1px solid ${c}40` }}>
      {children}
    </span>
  );
}

export function Btn({ tone = 'accent', solid, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; solid?: boolean }) {
  const c = toneColor[tone];
  return (
    <button {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={solid ? { background: c, color: '#061015' } : { background: `${c}1f`, color: c, border: `1px solid ${c}33` }} />
  );
}

export const eventStatus = {
  open: { label: 'Abierto', tone: 'green' as Tone },
  closed: { label: 'Cerrado', tone: 'muted' as Tone },
  cancelled: { label: 'Anulado', tone: 'red' as Tone },
};

export function recordBadge(r: { status: string; submittedBy?: string | null; validatedBy?: string | null } | null) {
  if (!r || r.status === 'draft') return <Badge tone="gold">{r ? 'Borrador sin enviar' : 'Sin registro'}</Badge>;
  if (r.status === 'validated') return <Badge tone="green">Validado{r.validatedBy ? ` por ${r.validatedBy}` : ''}</Badge>;
  return <Badge tone="accent">Enviado{r.submittedBy ? ` por ${r.submittedBy}` : ''} · por revisar</Badge>;
}

export function PctRing({ value, size = 64 }: { value: number | null; size?: number }) {
  const color = pctColor(value);
  const deg = Math.round(((value ?? 0) / 100) * 360);
  return (
    <div className="relative shrink-0 rounded-full" style={{ width: size, height: size, background: `conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.08) ${deg}deg)` }}>
      <div className="absolute inset-[5px] flex items-center justify-center rounded-full text-sm font-bold" style={{ background: '#0a0e16', color }}>
        {value == null ? '—' : `${value}%`}
      </div>
    </div>
  );
}

export function Bar({ value }: { value: number | null }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${value ?? 0}%`, background: pctColor(value) }} />
    </div>
  );
}

export const inputCls = 'input-dark w-full rounded-lg px-3 py-2 text-sm';

export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, tone = 'accent', pending, onConfirm }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: Tone;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) setReason(''); onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300}
          placeholder="Motivo (queda registrado)" className={inputCls} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Btn tone={tone} solid disabled={reason.trim().length < 3 || pending} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Btn>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
