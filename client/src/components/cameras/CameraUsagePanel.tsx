import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Gauge, Lock, PauseCircle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Checkbox } from '../ui/checkbox';
import { Switch } from '../ui/switch';
import { trpc } from '../../lib/trpc';
import { MAX_BITRATE } from '../../lib/cameraRtc';

export type CameraUsage = {
  month: string;
  bytes: number;
  freeBytes: number;
  warnBytes: number;
  blockBytes: number;
  sharingEnabled: boolean;
  blocked: boolean;
  overLimitUnlocked: boolean;
  unlockedBy: string | null;
};

const GB = 1e9;
const PRICE_PER_GB = 0.05;
// Una persona mirando los 9 recuadros a la tasa máxima.
const FULL_GRID_BYTES_PER_HOUR = (9 * MAX_BITRATE / 8) * 3600;

const fmtGb = (bytes: number) => (bytes / GB).toLocaleString('es-CL', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtHours = (bytes: number) => Math.max(0, Math.floor(bytes / FULL_GRID_BYTES_PER_HOUR)).toLocaleString('es-CL');

function nextMonthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function CameraUsagePanel({ usage, canModerate }: { usage: CameraUsage; canModerate: boolean }) {
  const utils = trpc.useUtils();
  const [confirmPause, setConfirmPause] = useState(false);
  const toggle = trpc.cameras.setSharingEnabled.useMutation({
    onSuccess: (_, v) => toast.success(v.enabled ? 'Compartir pantalla reanudado.' : 'Compartir pantalla pausado para todos.'),
    onError: (e) => toast.error(e.message),
    onSettled: () => utils.cameras.status.invalidate(),
  });

  const pct = Math.min(100, (usage.bytes / usage.freeBytes) * 100);
  const warn = usage.bytes >= usage.warnBytes;
  const color = usage.blocked || usage.bytes >= usage.freeBytes ? '#f87171' : warn ? '#fbbf24' : '#7bf1d6';
  const untilBlock = usage.blockBytes - usage.bytes;

  return (
    <div className="space-y-3 rounded-xl px-4 py-3" style={{ background: 'rgba(10,14,22,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex flex-wrap items-center gap-3">
        <Gauge className="h-4 w-4 shrink-0" style={{ color }} />
        <div className="min-w-[220px] flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span style={{ color: 'rgba(255,255,255,0.9)' }}>
              Consumo de video este mes: <b data-testid="cameras-usage-gb">{fmtGb(usage.bytes)} GB</b> de {fmtGb(usage.freeBytes)} GB gratis
            </span>
            {!usage.blocked && !usage.overLimitUnlocked && (
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>
                ≈ {fmtHours(untilBlock)} h de una persona mirando los 9 recuadros antes del bloqueo
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
          </div>
          <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Se reinicia el {nextMonthLabel(usage.month)}. Aviso a los {fmtGb(usage.warnBytes)} GB y bloqueo a los {fmtGb(usage.blockBytes)} GB.
          </div>
        </div>
        {canModerate && (
          <label className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)' }}>
            <Switch
              checked={usage.sharingEnabled}
              disabled={toggle.isPending}
              onCheckedChange={(on) => (on ? toggle.mutate({ enabled: true }) : setConfirmPause(true))}
              aria-label="Permitir compartir pantalla"
            />
            {usage.sharingEnabled ? 'Compartir activado' : 'Compartir pausado'}
          </label>
        )}
      </div>

      {!usage.sharingEnabled && !usage.blocked && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(96,165,250,0.1)', color: '#93c5fd' }}>
          <PauseCircle className="h-4 w-4 shrink-0" />
          Compartir pantalla está pausado por un administrador para ahorrar consumo. {canModerate ? 'Actívalo con el interruptor cuando lo necesiten.' : ''}
        </div>
      )}
      {warn && !usage.blocked && !usage.overLimitUnlocked && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Quedan {fmtGb(Math.max(0, untilBlock))} GB antes del bloqueo automático ({fmtGb(usage.blockBytes)} GB).
        </div>
      )}
      {usage.overLimitUnlocked && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(248,113,113,0.1)', color: '#fca5a5' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Desbloqueado sobre el límite{usage.unlockedBy ? ` por ${usage.unlockedBy}` : ''}. Lo que pase de {fmtGb(usage.freeBytes)} GB se cobra a la tarjeta (USD {PRICE_PER_GB.toFixed(2)} por GB).
        </div>
      )}

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Pausar compartir pantalla?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cortan todas las pantallas que se están compartiendo ahora y nadie podrá compartir hasta que lo reanudes. Sirve para ahorrar consumo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toggle.mutate({ enabled: false })}>Pausar para todos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CameraBlockedPanel({ usage, canModerate }: { usage: CameraUsage; canModerate: boolean }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const unlock = trpc.cameras.unlockOverLimit.useMutation({
    onSuccess: () => toast.success('Cámaras desbloqueado. El consumo sobre 1.000 GB se cobra a la tarjeta.'),
    onError: (e) => toast.error(e.message),
    onSettled: () => utils.cameras.status.invalidate(),
  });

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl px-6 py-14 text-center" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)' }}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(248,113,113,0.15)' }}>
        <Lock className="h-7 w-7" style={{ color: '#f87171' }} />
      </div>
      <div className="max-w-lg space-y-2">
        <h2 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Cámaras está bloqueado</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Este mes ya se usaron {fmtGb(usage.bytes)} GB de los {fmtGb(usage.freeBytes)} GB gratis. Para no generar cobros, el menú se bloqueó a los {fmtGb(usage.blockBytes)} GB.
          Se desbloquea solo el {nextMonthLabel(usage.month)}.
        </p>
        {!canModerate && (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Si necesitan seguir transmitiendo, pídele a un Admin o Super Admin que lo desbloquee.</p>
        )}
      </div>
      {canModerate && (
        <button onClick={() => { setAccepted(false); setOpen(true); }}
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: 'rgba(248,113,113,0.18)', color: '#fca5a5' }}>
          Desbloquear (con costo)
        </button>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desbloquear Cámaras con costo?</AlertDialogTitle>
            <AlertDialogDescription>
              Ya se usaron {fmtGb(usage.bytes)} GB. Lo que pase de {fmtGb(usage.freeBytes)} GB este mes lo cobra Cloudflare a la tarjeta registrada,
              a USD {PRICE_PER_GB.toFixed(2)} por GB (por ejemplo, 100 GB extra ≈ USD {(100 * PRICE_PER_GB).toFixed(0)}). Queda desbloqueado hasta fin de mes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
            Entiendo que seguir transmitiendo tendrá un costo en la tarjeta.
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!accepted || unlock.isPending} onClick={() => unlock.mutate({ acceptCost: true })}>
              Desbloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
