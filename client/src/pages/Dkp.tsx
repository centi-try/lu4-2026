import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Coins, Crown, Plus, Trophy, Users, Wallet } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { trpc } from '../lib/trpc';
import { CpDetail } from '../components/dkp/CpDetail';
import { EventDialog } from '../components/dkp/EventDialog';
import { EventFormDialog } from '../components/dkp/EventFormDialog';
import { Badge, Btn, C, PctRing, currentMonth, dateLabel, eventStatus, monthLabel, shiftMonth } from '../components/dkp/shared';
import type { Overview, OverviewCp, OverviewEvent } from '../components/dkp/shared';

export default function Dkp() {
  const [month, setMonth] = useState(currentMonth());
  const [openCp, setOpenCp] = useState<number | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const q = trpc.dkp.overview.useQuery({ month }, { refetchInterval: 30_000 });
  const data = q.data;

  useEffect(() => {
    if (openCp != null) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openCp]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(251,191,36,0.12)' }}>
            <Trophy className="h-5 w-5" style={{ color: C.gold }} />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: C.text }}>DKP</h1>
            <p className="text-xs" style={{ color: C.muted }}>Puntos por asistencia de cada CP. El % de participación se mide por mes.</p>
          </div>
          <div className="flex items-center gap-1 rounded-xl px-1 py-1" style={C.soft}>
            <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded-lg p-1.5 hover:bg-white/5" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" style={{ color: C.muted }} /></button>
            <span className="min-w-[130px] text-center text-sm font-semibold capitalize" style={{ color: C.text }}>{monthLabel(month)}</span>
            <button onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= currentMonth()} className="rounded-lg p-1.5 hover:bg-white/5 disabled:opacity-30" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" style={{ color: C.muted }} /></button>
          </div>
          {data?.canAdmin && <Btn solid onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo evento</Btn>}
        </div>

        {data && <PointsInfo types={data.eventTypes} canAdmin={data.canAdmin} onManage={() => setCreating(true)} />}

        {!data ? (
          <div className="py-16 text-center text-sm" style={{ color: C.muted }}>{q.error?.message ?? 'Cargando…'}</div>
        ) : (
          <>
            <EventsStrip data={data} onOpen={setEventId} />

            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>Command Parties</h2>
              {data.cps.length === 0 ? (
                <p className="rounded-xl p-6 text-center text-sm" style={{ ...C.panel, color: C.muted }}>Aún no hay CPs. Se crean en "Clanes &amp; CPs".</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {data.cps.map((cp) => (
                    <CpCard key={cp.id} cp={cp} active={openCp === cp.id} onClick={() => setOpenCp((cur) => (cur === cp.id ? null : cp.id))} />
                  ))}
                </div>
              )}
            </section>

            {openCp != null && data.cps.some((c) => c.id === openCp) && (
              <div ref={detailRef} className="scroll-mt-4 space-y-3 rounded-2xl p-5" style={{ ...C.panel, borderColor: 'rgba(123,241,214,0.25)' }}>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold" style={{ color: C.text }}>{data.cps.find((c) => c.id === openCp)!.name}</h2>
                  <button onClick={() => setOpenCp(null)} className="ml-auto text-xs hover:underline" style={{ color: C.muted }}>Cerrar detalle</button>
                </div>
                <CpDetail cpId={openCp} month={month} canAdmin={data.canAdmin} onOpenEvent={setEventId} />
              </div>
            )}
          </>
        )}
      </div>

      <EventDialog eventId={eventId} onClose={() => setEventId(null)} />
      <EventFormDialog open={creating} onOpenChange={setCreating} onCreated={setEventId} />
    </AppShell>
  );
}

function PointsInfo({ types, canAdmin, onManage }: { types: Overview['eventTypes']; canAdmin: boolean; onManage: () => void }) {
  if (types.length === 0 && !canAdmin) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5" style={C.soft}>
      <span className="mr-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
        <Coins className="h-3.5 w-3.5" style={{ color: C.gold }} /> Puntos por evento
      </span>
      {types.length === 0 ? (
        <button onClick={onManage} className="text-xs hover:underline" style={{ color: C.accent }}>Aún no hay tipos de evento: agrégalos en "Nuevo evento" → "Tipos de evento"</button>
      ) : (
        types.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <span style={{ color: C.text }}>{t.name}</span>
            <b style={{ color: C.gold }}>{t.points} pt</b>
          </span>
        ))
      )}
      <span className="ml-auto text-[11px]" style={{ color: C.muted }}>por cada asistente marcado</span>
    </div>
  );
}

function CpCard({ cp, active, onClick }: { cp: OverviewCp; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex flex-col gap-3 rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5"
      style={{ ...C.panel, borderColor: active ? 'rgba(123,241,214,0.5)' : cp.isMine ? 'rgba(123,241,214,0.25)' : 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-start gap-3">
        <PctRing value={cp.percent} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-base font-bold" style={{ color: C.text }}>{cp.name}</span>
            {cp.isMine && <Badge tone="accent">Tu CP</Badge>}
          </div>
          {cp.clanName && <p className="text-[11px]" style={{ color: C.muted }}>{cp.clanName}</p>}
          <p className="flex items-center gap-1 truncate text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <Crown className="h-3 w-3 shrink-0" style={{ color: C.gold }} /> {cp.leaders.join(', ') || 'Sin líder'}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${active ? 'rotate-180' : ''}`} style={{ color: C.muted }} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat icon={<CalendarDays className="h-3.5 w-3.5" />} label="Participó" value={cp.closedEvents ? `${cp.participated}/${cp.closedEvents}` : '—'} />
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Miembros" value={String(cp.memberCount)} />
        <Stat icon={<Wallet className="h-3.5 w-3.5" />} label="Saldo" value={`${cp.balance.toLocaleString('es-CL')} pt`} gold />
      </div>
    </button>
  );
}

function Stat({ icon, label, value, gold }: { icon: React.ReactNode; label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>{icon}{label}</div>
      <div className="text-sm font-bold" style={{ color: gold ? C.gold : C.text }}>{value}</div>
    </div>
  );
}

function EventsStrip({ data, onOpen }: { data: Overview; onOpen: (id: number) => void }) {
  const myCps = new Set(data.cps.filter((c) => c.isMine).map((c) => c.id));
  const open = data.events.filter((e) => e.status === 'open');
  const past = data.events.filter((e) => e.status !== 'open');
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>Eventos</h2>
      {open.length === 0 && past.length === 0 && (
        <p className="rounded-xl p-5 text-center text-sm" style={{ ...C.panel, color: C.muted }}>
          No hay eventos en {monthLabel(data.month)}.{data.canAdmin ? ' Crea uno con "Nuevo evento".' : ''}
        </p>
      )}
      {open.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {open.map((ev) => <EventCard key={ev.id} ev={ev} myCps={myCps} onOpen={onOpen} highlight />)}
        </div>
      )}
      {past.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {past.map((ev) => <EventCard key={ev.id} ev={ev} myCps={myCps} onOpen={onOpen} />)}
        </div>
      )}
    </section>
  );
}

function EventCard({ ev, myCps, onOpen, highlight }: { ev: OverviewEvent; myCps: Set<number>; onOpen: (id: number) => void; highlight?: boolean }) {
  const sent = ev.records.filter((r) => r.status && r.status !== 'draft').length;
  const myPending = ev.status === 'open' && ev.records.some((r) => myCps.has(r.cpId) && (!r.status || r.status === 'draft'));
  const st = eventStatus[ev.status];
  if (!highlight) {
    return (
      <button onClick={() => onOpen(ev.id)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-white/5" style={C.soft}>
        <span style={{ color: C.muted }}>{dateLabel(ev.date)}</span>
        <span className={`font-semibold ${ev.status === 'cancelled' ? 'line-through' : ''}`} style={{ color: C.text }}>{ev.name}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </button>
    );
  }
  return (
    <button onClick={() => onOpen(ev.id)} className="flex flex-col gap-2 rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5"
      style={{ ...C.panel, borderColor: myPending ? 'rgba(251,191,36,0.5)' : 'rgba(52,211,153,0.3)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: C.green }} />
        <span className="font-bold" style={{ color: C.text }}>{ev.name}</span>
        <Badge tone="green">{st.label}</Badge>
        <span className="ml-auto text-xs" style={{ color: C.muted }}>{dateLabel(ev.date)} · {ev.points} pt/asistente</span>
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
        {sent} de {ev.records.length} CP enviaron su registro
        {myPending && <span className="ml-auto font-semibold" style={{ color: C.gold }}>Tu CP aún no registra → Registrar asistencia</span>}
      </div>
    </button>
  );
}
