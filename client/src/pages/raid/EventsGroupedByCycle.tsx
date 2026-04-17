import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Archive, Calendar, Clock, PlayCircle } from 'lucide-react';

// ============================================================================
// Helper compartido entre /raids/inventory y /raids/dashboard.
//
// Agrupa la lista de eventos por ciclo:
//  - Eventos del ciclo abierto → se muestran planos en una sección con label
//    "Ciclo actual" (no tiene sentido agruparlos si sigue activo).
//  - Eventos de ciclos cerrados → se agrupan en tarjetas colapsables por ciclo
//    con fecha, hora de inicio y hora de cierre. La tarjeta más reciente
//    arranca expandida por defecto; el resto arranca colapsado.
// ============================================================================

interface Cycle {
  id: number | string;
  label?: string | null;
  status?: 'OPEN' | 'CLOSED' | string;
  startedAt?: string | null;
  closedAt?: string | null;
  totalEvents?: number | null;
  totalRevenue?: number | null;
  totalBosses?: number | null;
}

interface Event {
  id: number | string;
  cycleId?: number | string;
  createdAt?: string;
  [k: string]: any;
}

interface Props {
  events: Event[];
  cycles: Cycle[];
  renderEvent: (event: Event) => React.ReactNode;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export default function EventsGroupedByCycle({ events, cycles, renderEvent }: Props) {
  const grouped = useMemo(() => {
    const cyclesById = new Map<string, Cycle>();
    cycles.forEach((c) => cyclesById.set(String(c.id), c));

    const openCycleId = cycles.find((c) => c.status === 'OPEN')?.id;
    const openEvents: Event[] = [];
    const closedBuckets = new Map<string, Event[]>();
    const orphanEvents: Event[] = [];

    for (const ev of events) {
      const cid = ev.cycleId != null ? String(ev.cycleId) : '';
      if (cid === '') {
        orphanEvents.push(ev);
        continue;
      }
      if (openCycleId != null && cid === String(openCycleId)) {
        openEvents.push(ev);
        continue;
      }
      const cycle = cyclesById.get(cid);
      if (!cycle || cycle.status !== 'CLOSED') {
        // ciclo inexistente o sin cerrar aún pero tampoco el actual
        orphanEvents.push(ev);
        continue;
      }
      if (!closedBuckets.has(cid)) closedBuckets.set(cid, []);
      closedBuckets.get(cid)!.push(ev);
    }

    const closedGroups = Array.from(closedBuckets.entries())
      .map(([cid, evs]) => ({
        cycle: cyclesById.get(cid)!,
        events: evs.slice().sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        ),
      }))
      .sort((a, b) =>
        String(b.cycle.closedAt || '').localeCompare(String(a.cycle.closedAt || ''))
      );

    const currentCycle = openCycleId != null ? cyclesById.get(String(openCycleId)) : null;

    return {
      currentCycle,
      openEvents: openEvents.sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      ),
      closedGroups,
      orphanEvents,
    };
  }, [events, cycles]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Arranca expandida solo la primera tarjeta cerrada (la más reciente).
  const firstClosedId =
    grouped.closedGroups.length > 0 ? String(grouped.closedGroups[0].cycle.id) : null;

  const isExpanded = (cid: string) => {
    if (cid in expanded) return expanded[cid];
    return cid === firstClosedId;
  };

  const toggle = (cid: string) =>
    setExpanded((prev) => ({ ...prev, [cid]: !(prev[cid] ?? cid === firstClosedId) }));

  return (
    <div className="space-y-4">
      {/* Eventos del ciclo abierto */}
      {grouped.openEvents.length > 0 && (
        <div>
          <div
            className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider"
            style={{ color: '#7bf1d6' }}
          >
            <PlayCircle className="h-3.5 w-3.5" />
            <span>Ciclo actual {grouped.currentCycle?.label ? `· ${grouped.currentCycle.label}` : ''}</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>· {grouped.openEvents.length}</span>
          </div>
          <div className="space-y-3">
            {grouped.openEvents.map((ev) => renderEvent(ev))}
          </div>
        </div>
      )}

      {/* Tarjetas por ciclo cerrado */}
      {grouped.closedGroups.map(({ cycle, events: groupEvents }) => {
        const cid = String(cycle.id);
        const open = isExpanded(cid);
        const totalRevenue = Number(cycle.totalRevenue || 0);
        return (
          <div
            key={cid}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(167,139,250,0.2)',
            }}
          >
            <button
              type="button"
              onClick={() => toggle(cid)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/[0.02]"
            >
              <Archive className="h-4 w-4 shrink-0" style={{ color: '#a78bfa' }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {cycle.label || `Ciclo #${cid}`}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: 'rgba(239,68,68,0.15)',
                      color: '#fca5a5',
                      border: '1px solid rgba(239,68,68,0.25)',
                    }}
                  >
                    CERRADO
                  </span>
                </div>
                <div
                  className="mt-0.5 flex items-center gap-3 text-[11px] flex-wrap"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {fmtDate(cycle.startedAt)}
                    {cycle.closedAt && fmtDate(cycle.closedAt) !== fmtDate(cycle.startedAt) && (
                      <> → {fmtDate(cycle.closedAt)}</>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtTime(cycle.startedAt)} → {fmtTime(cycle.closedAt)}
                  </span>
                  <span>· {groupEvents.length} evento{groupEvents.length === 1 ? '' : 's'}</span>
                  {totalRevenue > 0 && (
                    <span style={{ color: '#fbbf24' }}>
                      · {totalRevenue.toLocaleString()} adena
                    </span>
                  )}
                </div>
              </div>
              {open ? (
                <ChevronUp className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }} />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }} />
              )}
            </button>
            {open && (
              <div className="px-3 pb-3 pt-1 space-y-3" style={{
                borderTop: '1px solid rgba(255,255,255,0.04)',
              }}>
                {groupEvents.map((ev) => renderEvent(ev))}
              </div>
            )}
          </div>
        );
      })}

      {/* Eventos huérfanos (sin ciclo) — fallback defensivo */}
      {grouped.orphanEvents.length > 0 && (
        <div>
          <div
            className="text-xs uppercase tracking-wider mb-2"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Sin ciclo asignado · {grouped.orphanEvents.length}
          </div>
          <div className="space-y-3">
            {grouped.orphanEvents.map((ev) => renderEvent(ev))}
          </div>
        </div>
      )}
    </div>
  );
}
