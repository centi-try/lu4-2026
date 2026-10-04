import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, CheckCircle2, ChevronDown, Crown, History, ImageOff, Lock, Pencil, RotateCcw, Send, ShieldCheck, Trash2, Undo2, XCircle } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Checkbox } from '../ui/checkbox';
import { Badge, Btn, C, ReasonDialog, ZoomImage, dateLabel, dateTimeLabel, eventStatus, inputCls, recordBadge } from './shared';
import type { EventCp, EventDetailData } from './shared';
import { EventFormDialog } from './EventFormDialog';

const MAX_SIDE = 2560;
const KEEP_ORIGINAL_BYTES = 3 * 1024 * 1024;
const MIN_GOOD_WIDTH = 900;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function preparePhoto(file: File) {
  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const supported = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (scale === 1 && supported && file.size <= KEEP_ORIGINAL_BYTES) {
    bmp.close();
    return { base64: await blobToBase64(file), width };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) throw new Error('No se pudo procesar la foto.');
  return { base64: await blobToBase64(blob), width };
}

export function EventDialog({ eventId, onClose }: { eventId: number | null; onClose: () => void }) {
  const q = trpc.dkp.eventDetail.useQuery({ eventId: eventId ?? 0 }, { enabled: eventId != null });
  const data = q.data;
  return (
    <Dialog open={eventId != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl" style={C.modal}>
        {!data ? (
          <div className="py-16 text-center text-sm" style={{ color: C.muted }}>{q.error?.message ?? 'Cargando…'}</div>
        ) : (
          <EventBody data={data} onDeleted={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EventBody({ data, onDeleted }: { data: EventDetailData; onDeleted: () => void }) {
  const { event: ev, canAdmin } = data;
  const utils = trpc.useUtils();
  const refresh = () => utils.dkp.invalidate();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [word, setWord] = useState('');
  const [reasonFor, setReasonFor] = useState<'cancel' | 'reopen' | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const onError = (e: { message: string }) => toast.error(e.message);

  const close = trpc.dkp.closeEvent.useMutation({ onSuccess: () => { toast.success('Evento cerrado. Los puntos ya están en el historial.'); setClosing(false); }, onError, onSettled: refresh });
  const cancel = trpc.dkp.cancelEvent.useMutation({ onSuccess: () => { toast.success('Evento anulado.'); setReasonFor(null); }, onError, onSettled: refresh });
  const remove = trpc.dkp.deleteEvent.useMutation({ onSuccess: () => { toast.success('Evento eliminado.'); setDeleting(false); onDeleted(); }, onError, onSettled: refresh });
  const reopen = trpc.dkp.reopenEvent.useMutation({ onSuccess: () => { toast.success('Evento reabierto.'); setReasonFor(null); }, onError, onSettled: refresh });

  const cps = useMemo(() => [...data.cps].sort((a, b) => Number(b.isMine) - Number(a.isMine)), [data.cps]);
  const sent = cps.filter((c) => c.record && c.record.status !== 'draft');
  const missing = cps.filter((c) => !c.record || c.record.status === 'draft');
  const st = eventStatus[ev.status];

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <DialogTitle className="text-xl" style={{ color: C.text }}>{ev.name}</DialogTitle>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <DialogDescription>
          {dateLabel(ev.date)} · {ev.points.toLocaleString('es-CL')} pt por cada asistente marcado · {data.submittedCps} de {data.totalCps} CP enviaron su registro
        </DialogDescription>
      </DialogHeader>

      {canAdmin && (
        <div className="flex flex-wrap gap-2 rounded-xl p-3" style={C.soft}>
          <span className="mr-auto flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: C.gold }}>
            <ShieldCheck className="h-4 w-4" /> Admin DKP
          </span>
          <Btn tone="muted" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar evento</Btn>
          {ev.status !== 'cancelled' && <Btn tone="red" onClick={() => setReasonFor('cancel')}><XCircle className="h-4 w-4" /> Anular</Btn>}
          {ev.status !== 'open' && <Btn tone="gold" onClick={() => setReasonFor('reopen')}><RotateCcw className="h-4 w-4" /> Reabrir</Btn>}
          {ev.status === 'cancelled' && <Btn tone="red" solid onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" /> Eliminar evento</Btn>}
          {ev.status === 'open' && <Btn tone="accent" solid onClick={() => { setWord(''); setClosing(true); }}><Lock className="h-4 w-4" /> Cerrar evento</Btn>}
        </div>
      )}

      {ev.status === 'closed' && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: C.muted }}>
          Evento cerrado: los líderes ya no pueden registrar ni modificar.{canAdmin ? ' Como Admin DKP aún puedes corregir (queda registrado).' : ''}
        </p>
      )}
      {ev.status === 'cancelled' && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>
          Evento anulado: no suma puntos ni cuenta para el % del mes.
        </p>
      )}

      {data.hiddenCps > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(123,241,214,0.06)', color: 'rgba(255,255,255,0.7)' }}>
          <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: C.accent }} />
          {cps.length ? 'Solo ves el registro de tu CP.' : 'La evidencia de las CP es privada mientras el evento no esté cerrado.'}
          {' '}Los registros de {cps.length ? 'las demás CP' : 'todas las CP'} se publican cuando un Admin DKP cierre el evento.
        </p>
      )}

      <div className="space-y-3">
        {data.totalCps === 0 && <p className="text-sm" style={{ color: C.muted }}>No hay CPs creadas en "Clanes &amp; CPs".</p>}
        {cps.map((cp) => (
          <RecordPanel key={cp.cpId} cp={cp} data={data} defaultOpen={cp.isMine || canAdmin || cps.length === 1} />
        ))}
      </div>

      <button onClick={() => setShowLog((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.muted }}>
        <History className="h-4 w-4" /> Historial del evento ({ev.log.length})
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLog ? 'rotate-180' : ''}`} />
      </button>
      {showLog && (
        <ol className="space-y-1 rounded-xl p-3 text-xs" style={C.soft}>
          {[...ev.log].reverse().map((l, i) => (
            <li key={i} style={{ color: 'rgba(255,255,255,0.7)' }}>
              <span style={{ color: C.muted }}>{dateTimeLabel(l.at)} · </span><b>{l.by}</b>: {l.detail}
            </li>
          ))}
        </ol>
      )}

      <EventFormDialog open={editing} onOpenChange={setEditing} event={ev} />

      <ReasonDialog open={reasonFor === 'cancel'} onOpenChange={(v) => !v && setReasonFor(null)} tone="red"
        title="¿Anular este evento?" description="No sumará puntos ni contará para el % del mes. Puedes reabrirlo o eliminarlo después."
        confirmLabel="Anular evento" pending={cancel.isPending} onConfirm={(reason) => cancel.mutate({ eventId: ev.id, reason })} />
      <ReasonDialog open={reasonFor === 'reopen'} onOpenChange={(v) => !v && setReasonFor(null)} tone="gold"
        title="¿Reabrir el evento?" description="Mientras esté abierto no cuenta en el historial ni en el %. Los líderes que no enviaron podrán registrar."
        confirmLabel="Reabrir" pending={reopen.isPending} onConfirm={(reason) => reopen.mutate({ eventId: ev.id, reason })} />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent style={C.modal}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.text }}>¿Eliminar "{ev.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el evento anulado con sus registros y fotos, y deja de aparecer en DKP. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Btn tone="red" solid disabled={remove.isPending} onClick={() => remove.mutate({ eventId: ev.id })}><Trash2 className="h-4 w-4" /> Eliminar definitivamente</Btn>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={closing} onOpenChange={setClosing}>
        <AlertDialogContent style={C.modal}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: C.text }}>Cerrar "{ev.name}"</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Al cerrar, ningún líder podrá registrar ni modificar, y los puntos pasan al historial.</p>
                <p><b style={{ color: C.green }}>Suman puntos ({sent.length}):</b> {sent.map((c) => `${c.cpName} (${c.record!.attendees.length})`).join(', ') || 'ninguna'}</p>
                <p><b style={{ color: C.red }}>Quedan en 0 ({missing.length}):</b> {missing.map((c) => c.cpName).join(', ') || 'ninguna'}</p>
                <p>Escribe <b style={{ color: C.text }}>{data.closeWord}</b> para confirmar.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input autoFocus value={word} onChange={(e) => setWord(e.target.value)} placeholder={data.closeWord} className={inputCls} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Btn solid disabled={word.trim().toUpperCase() !== data.closeWord || close.isPending}
              onClick={() => close.mutate({ eventId: ev.id, confirm: word })}>
              <Lock className="h-4 w-4" /> Cerrar evento
            </Btn>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RecordPanel({ cp, data, defaultOpen }: { cp: EventCp; data: EventDetailData; defaultOpen: boolean }) {
  const { event: ev, canAdmin, maxAttendees } = data;
  const r = cp.record;
  const utils = trpc.useUtils();
  const refresh = () => utils.dkp.invalidate();
  const onError = (e: { message: string }) => toast.error(e.message);
  const [open, setOpen] = useState(defaultOpen);
  const savedIds = useMemo(() => (r?.attendees ?? []).map((a) => a.userId), [r]);
  const [checked, setChecked] = useState<number[]>(savedIds);
  const [reason, setReason] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setChecked(savedIds), [savedIds]);

  const dirty = checked.length !== savedIds.length || checked.some((id) => !savedIds.includes(id));
  const correcting = canAdmin && !!r && (ev.status !== 'open' || r.status !== 'draft');
  const reasonOk = !correcting || reason.trim().length >= 3;
  const isLeaderDraft = cp.isMine && ev.status === 'open' && (!r || r.status === 'draft');

  const setPhoto = trpc.dkp.setPhoto.useMutation({ onError, onSettled: refresh });
  const save = trpc.dkp.saveAttendance.useMutation({ onError, onSettled: refresh });
  const submit = trpc.dkp.submitRecord.useMutation({ onSuccess: () => { toast.success('Registro enviado. Ya no puedes modificarlo.'); setConfirmSubmit(false); }, onError, onSettled: refresh });
  const validate = trpc.dkp.validateRecord.useMutation({ onSuccess: () => toast.success(`Registro de ${cp.cpName} validado.`), onError, onSettled: refresh });
  const reopenRecord = trpc.dkp.reopenRecord.useMutation({ onSuccess: () => { toast.success('Registro devuelto al líder.'); setReopening(false); }, onError, onSettled: refresh });

  const key = { eventId: ev.id, cpId: cp.cpId };
  const reasonArg = correcting ? { reason: reason.trim() } : {};

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { base64, width } = await preparePhoto(file);
      await setPhoto.mutateAsync({ ...key, dataBase64: base64 });
      if (width < MIN_GOOD_WIDTH) toast.warning('La foto es pequeña: si no se leen los nombres, súbela en mejor calidad.');
      else toast.success('Foto subida.');
    } catch (e) {
      if (e instanceof Error && !setPhoto.error) toast.error(e.message || 'No se pudo leer la foto.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function saveChecks() {
    await save.mutateAsync({ ...key, userIds: checked, ...reasonArg });
    toast.success(correcting ? 'Corrección guardada.' : 'Asistencia guardada.');
    if (correcting) setReason('');
  }

  function toggle(id: number) {
    setChecked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= maxAttendees ? cur : [...cur, id]));
  }

  const full = checked.length >= maxAttendees;
  return (
    <div className="overflow-hidden rounded-xl" style={{ ...C.soft, borderColor: cp.isMine ? 'rgba(123,241,214,0.35)' : undefined }}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left">
        <span className="font-bold" style={{ color: C.text }}>{cp.cpName}</span>
        {cp.isMine && <Badge tone="accent">Tu CP</Badge>}
        <span className="flex items-center gap-1 text-xs" style={{ color: C.muted }}><Crown className="h-3 w-3" style={{ color: C.gold }} />{cp.leaders.join(', ') || 'Sin líder'}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: C.muted }}>{r?.attendees.length ?? 0}/{maxAttendees}</span>
          {recordBadge(r)}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: C.muted }} />
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t px-4 py-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {isLeaderDraft && (
            <ol className="flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <li><b style={{ color: r?.photoUrl ? C.green : C.accent }}>1.</b> Sube una foto nítida donde se lean los nombres</li>
              <li><b style={{ color: checked.length ? C.green : C.accent }}>2.</b> Marca quiénes asistieron (máx. {maxAttendees})</li>
              <li><b style={{ color: C.accent }}>3.</b> Envía y cierra tu registro</li>
            </ol>
          )}

          {correcting && cp.canEdit && (
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputCls}
              placeholder="Motivo de la corrección (obligatorio para cambiar la asistencia)" />
          )}
          {canAdmin && !cp.isMine && ev.status === 'open' && (!r || r.status === 'draft') && (
            <p className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(123,241,214,0.06)', color: 'rgba(255,255,255,0.7)' }}>
              <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: C.accent }} />
              Esperando al líder: solo él sube la foto y marca la asistencia. Cuando envíe su registro podrás validarlo o corregirlo.
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
            <div className="space-y-2">
              {r?.photoUrl ? (
                <ZoomImage src={r.photoUrl} alt={`Evidencia ${cp.cpName}`} />
              ) : (
                <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-lg text-xs" style={{ background: 'rgba(0,0,0,0.3)', color: C.muted, border: '1px dashed rgba(255,255,255,0.12)' }}>
                  <ImageOff className="h-6 w-6" /> Sin foto de evidencia
                </div>
              )}
              {cp.canPhoto && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                  <Btn tone="accent" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    <Camera className="h-4 w-4" /> {uploading ? 'Subiendo…' : r?.photoUrl ? 'Cambiar foto' : 'Subir foto'}
                  </Btn>
                  <p className="text-[11px]" style={{ color: C.muted }}>1 sola foto, de buena calidad. Desde el celular se ajusta sola.</p>
                </>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs" style={{ color: C.muted }}>
                <span>Personajes principales confirmados</span>
                <span className="font-semibold" style={{ color: full ? C.gold : C.muted }}>{checked.length} de {maxAttendees} marcados</span>
              </div>
              {cp.members.length === 0 && <p className="text-sm" style={{ color: C.muted }}>Esta CP no tiene miembros confirmados.</p>}
              <div className="grid gap-1.5 sm:grid-cols-2">
                {cp.members.map((m) => {
                  const on = checked.includes(m.userId);
                  const disabled = !cp.canEdit || (!on && full);
                  return (
                    <label key={m.userId} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${disabled ? '' : 'cursor-pointer hover:bg-white/5'}`}
                      style={{ background: on ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.02)', opacity: disabled && !on ? 0.5 : 1 }}>
                      <Checkbox checked={on} disabled={disabled} onCheckedChange={() => toggle(m.userId)} />
                      <span className="flex-1 truncate" style={{ color: C.text }}>{m.name}</span>
                      {m.former ? <Badge tone="muted">ya no está</Badge> : m.className && <span className="text-[11px]" style={{ color: C.muted }}>{m.className}</span>}
                    </label>
                  );
                })}
              </div>
              {full && cp.canEdit && <p className="text-[11px]" style={{ color: C.gold }}>Llegaste al máximo de {maxAttendees}. Desmarca a alguien para marcar a otro.</p>}

              <div className="flex flex-wrap gap-2 pt-1">
                {cp.canEdit && dirty && (
                  <Btn tone="accent" disabled={save.isPending || !reasonOk} onClick={saveChecks}>
                    <CheckCircle2 className="h-4 w-4" /> {correcting ? 'Guardar corrección' : 'Guardar asistencia'}
                  </Btn>
                )}
                {cp.canEdit && ev.status === 'open' && (!r || r.status === 'draft') && (
                  <Btn solid disabled={!r?.photoUrl || dirty} title={!r?.photoUrl ? 'Sube la foto primero' : dirty ? 'Guarda los cambios primero' : ''}
                    onClick={() => setConfirmSubmit(true)}>
                    <Send className="h-4 w-4" /> Enviar y cerrar registro
                  </Btn>
                )}
                {canAdmin && r?.status === 'submitted' && (
                  <Btn tone="green" disabled={validate.isPending || dirty} onClick={() => validate.mutate(key)}>
                    <ShieldCheck className="h-4 w-4" /> Validar
                  </Btn>
                )}
                {canAdmin && ev.status === 'open' && r && r.status !== 'draft' && (
                  <Btn tone="gold" onClick={() => setReopening(true)}><Undo2 className="h-4 w-4" /> Devolver al líder</Btn>
                )}
              </div>
              {!cp.canEdit && cp.isMine && r && r.status !== 'draft' && (
                <p className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
                  <Lock className="h-3.5 w-3.5" /> Enviaste este registro{r.submittedAt ? ` el ${dateTimeLabel(r.submittedAt)}` : ''}. Si hay un error, pídele a un Admin DKP que lo corrija.
                </p>
              )}
            </div>
          </div>

          {r && r.corrections.length > 0 && (
            <div className="space-y-1 rounded-lg p-3 text-xs" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <p className="font-semibold" style={{ color: C.gold }}>Correcciones</p>
              {r.corrections.map((c, i) => (
                <p key={i} style={{ color: 'rgba(255,255,255,0.7)' }}>
                  <span style={{ color: C.muted }}>{dateTimeLabel(c.at)} · </span><b>{c.by}</b>: {c.reason}
                  {(c.before.length > 0 || c.after.length > 0) && <span style={{ color: C.muted }}> ({c.before.length} → {c.after.length} asistentes)</span>}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent style={C.modal}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar el registro de {cp.cpName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Marcaste {checked.length} asistente{checked.length === 1 ? '' : 's'}. Los que no marcaste quedan en 0. Después de enviarlo ya no podrás modificarlo; solo un Admin DKP podrá corregirlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <Btn solid disabled={submit.isPending} onClick={() => submit.mutate(key)}><Send className="h-4 w-4" /> Enviar y cerrar</Btn>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReasonDialog open={reopening} onOpenChange={setReopening} tone="gold"
        title={`¿Devolver el registro a ${cp.cpName}?`} description="El líder podrá volver a editarlo y deberá enviarlo de nuevo."
        confirmLabel="Devolver" pending={reopenRecord.isPending} onConfirm={(reason) => reopenRecord.mutate({ ...key, reason })} />
    </div>
  );
}
