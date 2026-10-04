import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, Check, PenLine, Pencil, Plus, Tags, Trash2, Trophy, X } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '../ui/select';
import { Btn, C, inputCls, todayIso } from './shared';

type EditableEvent = { id: number; typeId?: number | null; name: string; date: string; points: number };
type EventType = { id: number; name: string; points: number };
const CUSTOM = 0;

const validPoints = (v: string) => /^\d+$/.test(v) && Number(v) <= 100;

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
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{event ? 'Editar evento' : 'Nuevo evento DKP'}</AlertDialogTitle>
          <AlertDialogDescription>
            {event ? 'Si cambias los puntos, se recalcula el saldo de todas las CP de este evento.' : 'Al crearlo queda abierto y cada líder de CP podrá subir su foto y marcar asistentes.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <TabsTrigger value="event"><CalendarPlus className="h-4 w-4" /> {event ? 'Evento' : 'Crear evento'}</TabsTrigger>
            <TabsTrigger value="types"><Tags className="h-4 w-4" /> Tipos de evento ({types.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="event" className="pt-2">
            <EventTab open={open} event={event} types={types} onDone={(id) => { onOpenChange(false); if (id) onCreated?.(id); }}
              onManageTypes={() => setTab('types')} />
          </TabsContent>
          <TabsContent value="types" className="pt-2">
            <TypesTab types={types} />
            <AlertDialogFooter className="pt-4">
              <Btn tone="muted" onClick={() => setTab('event')}>Volver al evento</Btn>
            </AlertDialogFooter>
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
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso());
  const [points, setPoints] = useState('1');
  useEffect(() => {
    if (!open) return;
    setTypeId(event ? (event.typeId ?? CUSTOM) : null);
    setName(event?.name ?? '');
    setDate(event?.date ?? todayIso());
    setPoints(String(event?.points ?? 1));
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

  const known = typeId != null && typeId !== CUSTOM && types.some((t) => t.id === typeId);
  const archivedType = event?.typeId && !types.some((t) => t.id === event.typeId) ? event : null;

  function pick(v: number) {
    setTypeId(v);
    const t = types.find((x) => x.id === v);
    if (t) { setName(t.name); setPoints(String(t.points)); }
    else if (v === CUSTOM && !event) setName('');
  }

  const valid = typeId != null && name.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(date) && validPoints(points);
  const pending = create.isPending || update.isPending;
  function submit() {
    const input = { typeId: typeId === CUSTOM ? null : typeId, name: name.trim(), date, points: Number(points) };
    if (event) update.mutate({ eventId: event.id, ...input });
    else create.mutate(input);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1 text-xs" style={{ color: C.muted }}>
        <div className="flex items-center justify-between">
          <span>Evento o causa</span>
          <button onClick={onManageTypes} className="font-semibold hover:underline" style={{ color: C.accent }}>Agregar o editar tipos</button>
        </div>
        <Select value={typeId == null ? '' : String(typeId)} onValueChange={(v) => pick(Number(v))}>
          <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/[0.04] text-sm text-white/90 hover:border-amber-300/40 focus-visible:ring-amber-300/30">
            <SelectValue placeholder={types.length ? 'Elige el evento o causa' : 'Aún no hay tipos: créalos en la otra pestaña'} />
          </SelectTrigger>
          <SelectContent className="max-h-80 rounded-xl border-white/10 bg-[#0d1320] text-white/90 shadow-2xl">
            {types.map((t) => (
              <SelectItem key={t.id} value={String(t.id)} className="rounded-lg py-2.5 focus:bg-amber-300/10 focus:text-white">
                <Trophy className="h-4 w-4 text-amber-300" />
                <span className="flex-1 truncate">{t.name}</span>
                <span className="ml-3 rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">{t.points} pt</span>
              </SelectItem>
            ))}
            {archivedType && (
              <SelectItem value={String(archivedType.typeId)} className="rounded-lg py-2.5 focus:bg-white/10 focus:text-white">
                <Trophy className="h-4 w-4 text-white/40" />
                <span className="flex-1 truncate">{archivedType.name} (tipo ya no disponible)</span>
              </SelectItem>
            )}
            {(types.length > 0 || archivedType) && <SelectSeparator className="bg-white/10" />}
            <SelectItem value={String(CUSTOM)} className="rounded-lg py-2.5 focus:bg-teal-300/10 focus:text-white">
              <PenLine className="h-4 w-4 text-teal-300" />
              <span className="flex-1">Otra causa (escribir a mano)</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {typeId === CUSTOM && (
        <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
          Nombre del evento
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej: Defensa de castillo" className={inputCls} />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </label>
        <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
          Puntos por asistente{known ? ' (del tipo)' : ''}
          <input type="number" min={0} max={100} step={1} value={points} onChange={(e) => setPoints(e.target.value)} className={inputCls} />
        </label>
      </div>
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
  const onError = (e: { message: string }) => toast.error(e.message);
  const save = trpc.dkp.saveEventType.useMutation({ onError, onSettled: () => utils.dkp.invalidate() });
  const archive = trpc.dkp.archiveEventType.useMutation({
    onSuccess: () => toast.success('Tipo quitado. Los eventos ya creados no cambian.'),
    onError, onSettled: () => utils.dkp.invalidate(),
  });

  async function add() {
    await save.mutateAsync({ name: name.trim(), points: Number(points) });
    toast.success(`Tipo "${name.trim()}" agregado.`);
    setName('');
    setPoints('1');
  }
  async function saveEdit() {
    if (editId == null) return;
    await save.mutateAsync({ id: editId, name: editName.trim(), points: Number(editPoints) });
    toast.success('Tipo actualizado. Los eventos ya creados mantienen sus puntos.');
    setEditId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 rounded-xl p-3" style={C.soft}>
        <label className="block flex-1 space-y-1 text-xs" style={{ color: C.muted }}>
          Nuevo evento o causa
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej: Boss épico Antharas" className={inputCls}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 2 && validPoints(points)) void add().catch(() => {}); }} />
        </label>
        <label className="block w-24 space-y-1 text-xs" style={{ color: C.muted }}>
          Pt/asistente
          <input type="number" min={0} max={100} value={points} onChange={(e) => setPoints(e.target.value)} className={inputCls} />
        </label>
        <Btn solid disabled={name.trim().length < 2 || !validPoints(points) || save.isPending} onClick={() => void add().catch(() => {})} aria-label="Agregar tipo">
          <Plus className="h-4 w-4" />
        </Btn>
      </div>

      {types.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: C.muted }}>Aún no hay tipos. Agrega el primero arriba.</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {types.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              {editId === t.id ? (
                <>
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} className={`${inputCls} flex-1`} />
                  <input type="number" min={0} max={100} value={editPoints} onChange={(e) => setEditPoints(e.target.value)} className={`${inputCls} !w-20`} />
                  <button onClick={() => void saveEdit().catch(() => {})} disabled={editName.trim().length < 2 || !validPoints(editPoints) || save.isPending}
                    className="rounded-md p-1.5 hover:bg-white/10 disabled:opacity-40" aria-label="Guardar"><Check className="h-4 w-4" style={{ color: C.green }} /></button>
                  <button onClick={() => setEditId(null)} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Cancelar"><X className="h-4 w-4" style={{ color: C.muted }} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm" style={{ color: C.text }}>{t.name}</span>
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: C.gold, background: 'rgba(251,191,36,0.12)' }}>{t.points} pt</span>
                  <button onClick={() => { setEditId(t.id); setEditName(t.name); setEditPoints(String(t.points)); }}
                    className="rounded-md p-1.5 hover:bg-white/10" aria-label={`Editar ${t.name}`}><Pencil className="h-3.5 w-3.5" style={{ color: C.muted }} /></button>
                  <button onClick={() => archive.mutate({ id: t.id })} disabled={archive.isPending}
                    className="rounded-md p-1.5 hover:bg-white/10" aria-label={`Quitar ${t.name}`}><Trash2 className="h-3.5 w-3.5" style={{ color: C.red }} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px]" style={{ color: C.muted }}>Los puntos del tipo se copian al crear el evento; cambiarlos aquí no altera eventos ya creados.</p>
    </div>
  );
}
