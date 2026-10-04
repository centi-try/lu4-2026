import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, Check, Pencil, Plus, Tags, Trash2, Trophy, X } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Btn, C, inputCls, todayIso } from './shared';

type EditableEvent = { id: number; typeId?: number | null; name: string; date: string; points: number };
type EventType = { id: number; name: string; points: number };

const validPoints = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100 && Number.isInteger(n * 2);
};
const toPoints = (v: string) => Number(v.replace(',', '.'));
const fmt = (n: number) => n.toLocaleString('es-CL');

export function EventFormDialog({ open, onOpenChange, event, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event?: EditableEvent;
  onCreated?: (id: number) => void;
}) {
  const [tab, setTab] = useState('event');
  useEffect(() => { if (open) setTab('event'); }, [open]);
  const typesQ = trpc.dkp.eventTypes.useQuery(undefined, { enabled: open });
  const types = typesQ.data ?? [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg" style={C.modal}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: C.text }}>{event ? 'Editar evento' : 'Nuevo evento DKP'}</AlertDialogTitle>
          <AlertDialogDescription>
            {event ? 'Si cambias el tipo, se recalcula el saldo de todas las CP de este evento.' : 'Al crearlo queda abierto y cada líder de CP podrá subir su foto y marcar asistentes.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <TabsTrigger value="event"><CalendarPlus className="h-4 w-4" /> {event ? 'Evento' : 'Crear evento'}</TabsTrigger>
            <TabsTrigger value="types"><Tags className="h-4 w-4" /> Tipos de evento ({types.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="event" className="pt-2">
            <EventTab open={open} event={event} types={types} onDone={(id) => { onOpenChange(false); if (id) onCreated?.(id); }}
              onManageTypes={() => setTab('types')} />
          </TabsContent>
          <TabsContent value="types" className="pt-2">
            <TypesTab types={types} />
          </TabsContent>
        </Tabs>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EventTab({ open, event, types, onDone, onManageTypes }: {
  open: boolean;
  event?: EditableEvent;
  types: EventType[];
  onDone: (createdId?: number) => void;
  onManageTypes: () => void;
}) {
  const utils = trpc.useUtils();
  const [typeId, setTypeId] = useState<number | null>(null);
  const [date, setDate] = useState(todayIso());
  useEffect(() => {
    if (!open) return;
    setTypeId(event?.typeId ?? null);
    setDate(event?.date ?? todayIso());
  }, [open, event]);

  const onError = (e: { message: string }) => toast.error(e.message);
  const create = trpc.dkp.createEvent.useMutation({
    onSuccess: ({ id }) => { toast.success('Evento creado. Los líderes ya pueden registrar.'); onDone(id); },
    onError, onSettled: () => utils.dkp.invalidate(),
  });
  const update = trpc.dkp.updateEvent.useMutation({
    onSuccess: () => { toast.success('Evento actualizado.'); onDone(); },
    onError, onSettled: () => utils.dkp.invalidate(),
  });

  const archivedType = event?.typeId && !types.some((t) => t.id === event.typeId) ? event : null;
  const chosen = types.find((t) => t.id === typeId) ?? (archivedType && typeId === archivedType.typeId ? { name: archivedType.name, points: archivedType.points } : null);
  const valid = typeId != null && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const pending = create.isPending || update.isPending;
  function submit() {
    if (typeId == null) return;
    if (event) update.mutate({ eventId: event.id, typeId, date });
    else create.mutate({ typeId, date });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1 text-xs" style={{ color: C.muted }}>
        <div className="flex items-center justify-between">
          <span>Evento o causa</span>
          <button onClick={onManageTypes} className="font-semibold hover:underline" style={{ color: C.accent }}>Agregar o editar tipos</button>
        </div>
        <Select value={typeId == null ? '' : String(typeId)} onValueChange={(v) => setTypeId(Number(v))}>
          <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/[0.04] text-sm text-white/90 hover:border-amber-300/40 focus-visible:ring-amber-300/30">
            <SelectValue placeholder={types.length ? 'Elige el evento o causa' : 'Aún no hay tipos: créalos en "Tipos de evento"'} />
          </SelectTrigger>
          <SelectContent className="max-h-80 rounded-xl border-white/10 text-white/90 shadow-2xl" style={{ background: '#1e1e2e' }}>
            {types.map((t) => (
              <SelectItem key={t.id} value={String(t.id)} className="rounded-lg py-2.5 focus:bg-amber-300/10 focus:text-white">
                <Trophy className="h-4 w-4 text-amber-300" />
                <span className="flex-1 truncate">{t.name}</span>
                <span className="ml-3 rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">{fmt(t.points)} pt</span>
              </SelectItem>
            ))}
            {archivedType && (
              <SelectItem value={String(archivedType.typeId)} className="rounded-lg py-2.5 focus:bg-white/10 focus:text-white">
                <Trophy className="h-4 w-4 text-white/40" />
                <span className="flex-1 truncate">{archivedType.name} (tipo ya no disponible)</span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </label>
      {chosen && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(251,191,36,0.08)', color: 'rgba(255,255,255,0.7)' }}>
          Cada asistente marcado suma <b style={{ color: C.gold }}>{fmt(chosen.points)} pt</b> a su CP.
        </p>
      )}
      <AlertDialogFooter className="pt-2">
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <Btn solid disabled={!valid || pending} onClick={submit}>{event ? 'Guardar' : 'Crear evento'}</Btn>
      </AlertDialogFooter>
    </div>
  );
}

function TypesTab({ types }: { types: EventType[] }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState('');
  const [points, setPoints] = useState('1');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPoints, setEditPoints] = useState('');
  const [removing, setRemoving] = useState<number | null>(null);
  const onError = (e: { message: string }) => toast.error(e.message);
  const save = trpc.dkp.saveEventType.useMutation({ onError, onSettled: () => utils.dkp.invalidate() });
  const archive = trpc.dkp.archiveEventType.useMutation({
    onSuccess: () => { toast.success('Tipo eliminado. Los eventos ya creados no cambian.'); setRemoving(null); },
    onError, onSettled: () => utils.dkp.invalidate(),
  });

  const canAdd = name.trim().length >= 2 && validPoints(points) && !save.isPending;
  async function add() {
    if (!canAdd) return;
    await save.mutateAsync({ name: name.trim(), points: toPoints(points) });
    toast.success(`Tipo "${name.trim()}" agregado.`);
    setName('');
    setPoints('1');
  }
  async function saveEdit() {
    if (editId == null) return;
    await save.mutateAsync({ id: editId, name: editName.trim(), points: toPoints(editPoints) });
    toast.success('Tipo actualizado. Los eventos ya creados mantienen sus puntos.');
    setEditId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 rounded-xl p-3" style={C.soft}>
        <label className="block flex-1 space-y-1 text-xs" style={{ color: C.muted }}>
          Nuevo evento o causa
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej: Boss épico Antharas" className={inputCls}
            onKeyDown={(e) => { if (e.key === 'Enter') void add().catch(() => {}); }} />
        </label>
        <label className="block w-24 space-y-1 text-xs" style={{ color: C.muted }}>
          Pt/asistente
          <input type="number" min={0} max={100} step={0.5} value={points} onChange={(e) => setPoints(e.target.value)} className={inputCls} />
        </label>
        <Btn solid disabled={!canAdd} onClick={() => void add().catch(() => {})} aria-label="Agregar tipo">
          <Plus className="h-4 w-4" />
        </Btn>
      </div>
      {points.trim() !== '' && !validPoints(points) && <p className="text-[11px]" style={{ color: C.red }}>Usa enteros o medios puntos, por ejemplo 1, 1,5 o 2.</p>}

      {types.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: C.muted }}>Aún no hay tipos. Agrega el primero arriba.</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {types.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: removing === t.id ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.04)' }}>
              {editId === t.id ? (
                <>
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} className={`${inputCls} flex-1`} />
                  <input type="number" min={0} max={100} step={0.5} value={editPoints} onChange={(e) => setEditPoints(e.target.value)} className={`${inputCls} !w-20`} />
                  <button onClick={() => void saveEdit().catch(() => {})} disabled={editName.trim().length < 2 || !validPoints(editPoints) || save.isPending}
                    className="rounded-md p-1.5 hover:bg-white/10 disabled:opacity-40" aria-label="Guardar"><Check className="h-4 w-4" style={{ color: C.green }} /></button>
                  <button onClick={() => setEditId(null)} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Cancelar"><X className="h-4 w-4" style={{ color: C.muted }} /></button>
                </>
              ) : removing === t.id ? (
                <>
                  <span className="flex-1 truncate text-sm" style={{ color: '#fca5a5' }}>¿Eliminar "{t.name}"?</span>
                  <Btn tone="red" solid className="!px-2.5 !py-1 text-xs" disabled={archive.isPending} onClick={() => archive.mutate({ id: t.id })}>Sí, eliminar</Btn>
                  <Btn tone="muted" className="!px-2.5 !py-1 text-xs" onClick={() => setRemoving(null)}>No</Btn>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm" style={{ color: C.text }}>{t.name}</span>
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: C.gold, background: 'rgba(251,191,36,0.12)' }}>{fmt(t.points)} pt</span>
                  <button onClick={() => { setRemoving(null); setEditId(t.id); setEditName(t.name); setEditPoints(String(t.points)); }}
                    className="rounded-md p-1.5 hover:bg-white/10" aria-label={`Editar ${t.name}`}><Pencil className="h-3.5 w-3.5" style={{ color: C.muted }} /></button>
                  <button onClick={() => { setEditId(null); setRemoving(t.id); }}
                    className="rounded-md p-1.5 hover:bg-white/10" aria-label={`Eliminar ${t.name}`}><Trash2 className="h-3.5 w-3.5" style={{ color: C.red }} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px]" style={{ color: C.muted }}>Acepta enteros o medios puntos (0,5). Los puntos se copian al crear el evento: cambiarlos aquí no altera eventos ya creados.</p>
    </div>
  );
}
