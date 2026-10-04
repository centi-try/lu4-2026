import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Btn, C, inputCls, todayIso } from './shared';

type EditableEvent = { id: number; name: string; date: string; points: number };

export function EventFormDialog({ open, onOpenChange, event, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event?: EditableEvent;
  onCreated?: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso());
  const [points, setPoints] = useState('1');
  useEffect(() => {
    if (!open) return;
    setName(event?.name ?? '');
    setDate(event?.date ?? todayIso());
    setPoints(String(event?.points ?? 1));
  }, [open, event]);

  const onError = (e: { message: string }) => toast.error(e.message);
  const create = trpc.dkp.createEvent.useMutation({
    onSuccess: ({ id }) => { toast.success('Evento creado. Los líderes ya pueden registrar.'); onOpenChange(false); onCreated?.(id); },
    onError, onSettled: () => utils.dkp.invalidate(),
  });
  const update = trpc.dkp.updateEvent.useMutation({
    onSuccess: () => { toast.success('Evento actualizado.'); onOpenChange(false); },
    onError, onSettled: () => utils.dkp.invalidate(),
  });

  const pts = Number(points);
  const valid = name.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(pts) && pts >= 0 && pts <= 100;
  const pending = create.isPending || update.isPending;
  function submit() {
    const input = { name: name.trim(), date, points: pts };
    if (event) update.mutate({ eventId: event.id, ...input });
    else create.mutate(input);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{event ? 'Editar evento' : 'Nuevo evento DKP'}</AlertDialogTitle>
          <AlertDialogDescription>
            {event ? 'Si cambias los puntos, se recalcula el saldo de todas las CP de este evento.' : 'Al crearlo queda abierto y cada líder de CP podrá subir su foto y marcar asistentes.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
            Evento o causa
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej: Boss épico Antharas" className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
              Fecha
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="block space-y-1 text-xs" style={{ color: C.muted }}>
              Puntos por asistente
              <input type="number" min={0} max={100} step={1} value={points} onChange={(e) => setPoints(e.target.value)} className={inputCls} />
            </label>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Btn solid disabled={!valid || pending} onClick={submit}>{event ? 'Guardar' : 'Crear evento'}</Btn>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
