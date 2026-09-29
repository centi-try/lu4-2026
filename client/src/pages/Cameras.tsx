import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import { Cctv, Crop, Eye, Loader2, Maximize2, MonitorUp, RefreshCw, Square, X, ZoomIn, ZoomOut } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { trpc } from '../lib/trpc';
import { canCrop, cropTrack, GridViewer, MAX_FPS, ScreenPublisher } from '../lib/cameraRtc';
import type { CamerasApi, CropRect } from '../lib/cameraRtc';

const HEARTBEAT_MS = 15_000;
const HIDDEN_PAUSE_MS = 30_000;
const RETRY_MS = 3_000;

const C = {
  panel: { background: 'rgba(10,14,22,0.85)', border: '1px solid rgba(255,255,255,0.08)' } as CSSProperties,
  muted: 'rgba(255,255,255,0.45)',
  text: 'rgba(255,255,255,0.9)',
  accent: '#7bf1d6',
  live: '#f87171',
};

function StreamVideo({ stream, className, style }: { stream: MediaStream; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className={className} style={style} />;
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
}

async function captureScreen(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: MAX_FPS, max: MAX_FPS }, width: { max: 1920 }, height: { max: 1080 } },
      audio: false,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotAllowedError') return null;
    throw e;
  }
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') setVisible(true);
      else timer = setTimeout(() => setVisible(false), HIDDEN_PAUSE_MS);
    };
    document.addEventListener('visibilitychange', onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, []);
  return visible;
}

export default function Cameras() {
  const utils = trpc.useUtils();
  const statusQ = trpc.cameras.status.useQuery(undefined, { refetchInterval: RETRY_MS, retry: 1 });
  const configured = !!statusQ.data?.configured;
  const iceQ = trpc.cameras.iceServers.useQuery(undefined, {
    enabled: configured,
    staleTime: Infinity,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
  const iceServers = iceQ.data as RTCIceServer[] | undefined;
  const claimMut = trpc.cameras.claim.useMutation();
  const releaseMut = trpc.cameras.release.useMutation({ onSettled: () => utils.cameras.status.invalidate() });

  const api: CamerasApi = useMemo(() => ({
    createSession: () => utils.client.cameras.createSession.mutate(),
    publish: (i) => utils.client.cameras.publish.mutate(i),
    subscribe: (i) => utils.client.cameras.subscribe.mutate(i),
    renegotiate: (i) => utils.client.cameras.renegotiate.mutate(i),
    closeTracks: (i) => utils.client.cameras.closeTracks.mutate(i),
  }), [utils]);

  const me = statusQ.data?.me ?? null;
  const slots = statusQ.data?.slots ?? [];
  const mySlot = slots.find((s) => s.ownerId !== null && s.ownerId === me)?.index ?? null;
  const liveCount = slots.filter((s) => s.live).length;
  const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

  // ---------------------------------------------------------------- Mirar
  const visible = usePageVisible();
  const [streams, setStreams] = useState<Map<number, MediaStream>>(new Map());
  const [viewerGen, setViewerGen] = useState(0);
  const viewerRef = useRef<GridViewer | null>(null);
  const watching = configured && !!iceServers && visible;

  useEffect(() => {
    if (!watching || !iceServers) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const viewer = new GridViewer(api, iceServers, setStreams, () => {
      retry = setTimeout(() => setViewerGen((g) => g + 1), RETRY_MS);
    });
    viewerRef.current = viewer;
    return () => {
      clearTimeout(retry);
      viewer.close();
      viewerRef.current = null;
      setStreams(new Map());
    };
  }, [watching, iceServers, api, viewerGen]);

  const desiredKey = slots
    .filter((s) => s.live && s.trackName && s.ownerId !== me)
    .map((s) => `${s.index}:${s.trackName}`)
    .join(',');

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const desired = new Map<number, string>();
    desiredKey.split(',').filter(Boolean).forEach((pair) => {
      const [slot, trackName] = pair.split(':');
      desired.set(Number(slot), trackName);
    });
    let retry: ReturnType<typeof setTimeout> | undefined;
    viewer.sync(desired).catch(() => {
      retry = setTimeout(() => setViewerGen((g) => g + 1), RETRY_MS);
    });
    return () => clearTimeout(retry);
  }, [desiredKey, viewerGen, watching]);

  // ------------------------------------------------------------ Compartir
  const [sharing, setSharing] = useState<'idle' | 'starting' | 'live'>('idle');
  const [sentStream, setSentStream] = useState<MediaStream | null>(null);
  const [cropping, setCropping] = useState(false);
  const [cropped, setCropped] = useState(false);
  const captureRef = useRef<MediaStream | null>(null);
  const cropRef = useRef<{ track: MediaStreamTrack; stop: () => void } | null>(null);
  const publisherRef = useRef<ScreenPublisher | null>(null);
  const slotRef = useRef<number | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const currentTrack = () => cropRef.current?.track ?? captureRef.current?.getVideoTracks()[0] ?? null;

  const teardownLocal = useCallback(() => {
    clearTimeout(reconnectRef.current);
    publisherRef.current?.close();
    publisherRef.current = null;
    cropRef.current?.stop();
    cropRef.current = null;
    captureRef.current?.getTracks().forEach((t) => t.stop());
    captureRef.current = null;
    setSentStream(null);
    setCropped(false);
    setCropping(false);
    setSharing('idle');
  }, []);

  const startPublisher = useCallback(async (slot: number, track: MediaStreamTrack) => {
    if (!iceServers) throw new Error('El video aún no está listo. Espera unos segundos.');
    publisherRef.current?.close();
    const publisher = new ScreenPublisher(api, iceServers, () => {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(() => {
        const t = currentTrack();
        if (publisherRef.current === publisher && t && slotRef.current !== null) {
          startPublisher(slotRef.current, t).catch(() => publisher.close());
        }
      }, RETRY_MS);
    });
    publisherRef.current = publisher;
    await publisher.start(slot, track);
    utils.cameras.status.invalidate();
  }, [api, iceServers, utils]);

  const stopSharing = useCallback(async (release: boolean) => {
    const slot = slotRef.current;
    teardownLocal();
    if (slot === null) return;
    try {
      if (release) {
        slotRef.current = null;
        await utils.client.cameras.release.mutate({ slot });
      } else {
        await utils.client.cameras.unpublish.mutate({ slot });
      }
    } catch {
      /* el servidor libera el recuadro solo si deja de recibir señales */
    }
    utils.cameras.status.invalidate();
  }, [teardownLocal, utils]);

  const shareInto = async (slot: number) => {
    if (!canShare) return;
    let capture: MediaStream | null = null;
    try {
      capture = await captureScreen();
      if (!capture) return;
      const track = capture.getVideoTracks()[0];
      track.contentHint = 'detail';
      setSharing('starting');
      if (mySlot !== slot) await claimMut.mutateAsync({ slot });
      slotRef.current = slot;
      captureRef.current = capture;
      track.addEventListener('ended', () => {
        if (captureRef.current === capture) stopSharing(false);
      });
      setSentStream(new MediaStream([track]));
      await startPublisher(slot, track);
      setSharing('live');
      toast.success('Estás compartiendo. Ya puedes usar tu PC normalmente: no cierres esta pestaña.');
    } catch (e) {
      if (captureRef.current !== capture) capture?.getTracks().forEach((t) => t.stop());
      teardownLocal();
      toast.error(errMsg(e));
      utils.cameras.status.invalidate();
    }
  };

  const changeSource = async () => {
    const slot = slotRef.current;
    if (slot === null || !publisherRef.current) return;
    try {
      const capture = await captureScreen();
      if (!capture) return;
      const track = capture.getVideoTracks()[0];
      track.contentHint = 'detail';
      await publisherRef.current.replaceTrack(track);
      cropRef.current?.stop();
      cropRef.current = null;
      setCropped(false);
      const old = captureRef.current;
      captureRef.current = capture;
      old?.getTracks().forEach((t) => t.stop());
      track.addEventListener('ended', () => {
        if (captureRef.current === capture) stopSharing(false);
      });
      setSentStream(new MediaStream([track]));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const applyCrop = async (rect: CropRect | null) => {
    const raw = captureRef.current?.getVideoTracks()[0];
    const publisher = publisherRef.current;
    setCropping(false);
    if (!raw || !publisher) return;
    try {
      const previous = cropRef.current;
      if (rect) {
        const next = cropTrack(raw, rect);
        await publisher.replaceTrack(next.track);
        cropRef.current = next;
        setSentStream(new MediaStream([next.track]));
        setCropped(true);
      } else {
        await publisher.replaceTrack(raw);
        cropRef.current = null;
        setSentStream(new MediaStream([raw]));
        setCropped(false);
      }
      previous?.stop();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  useEffect(() => {
    if (mySlot === null) return;
    slotRef.current = mySlot;
    const beat = () =>
      utils.client.cameras.heartbeat.mutate({ slot: mySlot }).then((r) => {
        if (!r.owned && slotRef.current === mySlot) {
          slotRef.current = null;
          teardownLocal();
          toast.info('Tu recuadro fue liberado.');
          utils.cameras.status.invalidate();
        }
      }).catch(() => {});
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [mySlot, teardownLocal, utils]);

  useEffect(() => () => {
    const slot = slotRef.current;
    teardownLocal();
    if (slot !== null) utils.client.cameras.release.mutate({ slot }).catch(() => {});
  }, [teardownLocal, utils]);

  useEffect(() => {
    if (sharing === 'idle') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sharing]);

  // --------------------------------------------------------------- Ampliar
  const [zoomSlot, setZoomSlot] = useState<number | null>(null);
  const streamFor = (slot: number) => (slot === mySlot ? sentStream : streams.get(slot) ?? null);

  if (statusQ.error) {
    return (
      <AppShell>
        <div className="p-10 text-center text-sm" style={{ color: C.muted }}>{statusQ.error.message}</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(123,241,214,0.12)' }}>
            <Cctv className="h-5 w-5" style={{ color: C.accent }} />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: C.text }}>Cámaras</h1>
            <p className="text-xs" style={{ color: C.muted }}>
              Elige un recuadro libre y comparte tu pantalla. Haz clic en cualquier recuadro en vivo para ampliarlo.
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: 'rgba(248,113,113,0.12)', color: liveCount ? C.live : C.muted }}>
            <span className={`h-2 w-2 rounded-full ${liveCount ? 'animate-pulse' : ''}`} style={{ background: liveCount ? C.live : C.muted }} />
            {liveCount} de {slots.length || 9} en vivo
          </span>
        </div>

        {statusQ.data && !configured && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
            El servidor de video todavía no está configurado. Avísale al Super Admin.
          </div>
        )}
        {!canShare && (
          <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'rgba(96,165,250,0.1)', color: '#93c5fd' }}>
            Este navegador no permite compartir pantalla (por ejemplo, en celulares). Puedes mirar los recuadros igual.
          </div>
        )}

        {mySlot !== null && sharing !== 'idle' && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-3" style={C.panel}>
            <span className="flex-1 text-xs" style={{ color: C.text }}>
              {sharing === 'starting' ? 'Conectando tu pantalla…' : (
                <>Compartiendo en el <b>recuadro {mySlot + 1}</b>{cropped ? ' (solo la zona recortada)' : ''}. Puedes cambiar de ventana y seguir jugando; no cierres esta pestaña. Si compartes una ventana, no la minimices.</>
              )}
            </span>
            <ToolbarButton onClick={changeSource} disabled={sharing !== 'live'} icon={<RefreshCw className="h-4 w-4" />}>Cambiar qué comparto</ToolbarButton>
            {canCrop() && (
              <ToolbarButton onClick={() => setCropping(true)} disabled={sharing !== 'live'} icon={<Crop className="h-4 w-4" />}>
                {cropped ? 'Cambiar recorte' : 'Recortar zona'}
              </ToolbarButton>
            )}
            {cropped && <ToolbarButton onClick={() => applyCrop(null)} icon={<Maximize2 className="h-4 w-4" />}>Quitar recorte</ToolbarButton>}
            <ToolbarButton onClick={() => stopSharing(true)} tone="danger" icon={<Square className="h-4 w-4" />}>Dejar de compartir</ToolbarButton>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(slots.length ? slots : Array.from({ length: 9 }, (_, index) => ({ index, ownerId: null, ownerName: null, live: false, trackName: null }))).map((s) => {
            const mine = s.index === mySlot;
            const stream = streamFor(s.index);
            const showVideo = !!stream && (mine ? sharing === 'live' : s.live);
            return (
              <div key={s.index} className="group relative aspect-video overflow-hidden rounded-xl"
                style={{
                  background: '#05070b',
                  border: `1px ${s.ownerId === null ? 'dashed' : 'solid'} ${mine ? 'rgba(123,241,214,0.55)' : s.live ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.1)'}`,
                }}>
                {showVideo ? (
                  <button className="absolute inset-0 h-full w-full cursor-zoom-in" onClick={() => setZoomSlot(s.index)} title="Ampliar">
                    <StreamVideo stream={stream} className="h-full w-full object-contain" />
                  </button>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                    {s.ownerId === null ? (
                      <>
                        <span className="text-xs" style={{ color: C.muted }}>Libre</span>
                        {canShare && configured && mySlot === null && (
                          <button onClick={() => shareInto(s.index)} disabled={sharing !== 'idle' || !iceServers}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                            style={{ background: 'rgba(123,241,214,0.15)', color: C.accent }}>
                            <MonitorUp className="h-4 w-4" /> Compartir aquí
                          </button>
                        )}
                      </>
                    ) : mine ? (
                      sharing === 'starting' ? (
                        <span className="flex items-center gap-2 text-xs" style={{ color: C.muted }}><Loader2 className="h-4 w-4 animate-spin" /> Conectando…</span>
                      ) : (
                        <button onClick={() => shareInto(s.index)} disabled={!canShare || !iceServers}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                          style={{ background: 'rgba(123,241,214,0.15)', color: C.accent }}>
                          <MonitorUp className="h-4 w-4" /> Compartir pantalla
                        </button>
                      )
                    ) : s.live ? (
                      <span className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
                        {visible ? <><Loader2 className="h-4 w-4 animate-spin" /> Conectando…</> : <><Eye className="h-4 w-4" /> Vista en pausa</>}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: C.muted }}>Esperando que {s.ownerName} comparta…</span>
                    )}
                  </div>
                )}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2 text-xs"
                  style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.75), transparent)' }}>
                  <span className="font-bold" style={{ color: C.muted }}>{s.index + 1}</span>
                  <span className="truncate font-semibold" style={{ color: C.text }}>
                    {s.ownerName ? (mine ? `${s.ownerName} (tú)` : s.ownerName) : ''}
                  </span>
                  {s.live && (
                    <span className="ml-auto flex items-center gap-1 font-bold" style={{ color: C.live }}>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: C.live }} /> EN VIVO
                    </span>
                  )}
                </div>

                {s.ownerId !== null && (mine ? sharing === 'idle' : statusQ.data?.canModerate) && (
                  <button onClick={() => (mine ? stopSharing(true) : releaseMut.mutate({ slot: s.index }))}
                    title={mine ? 'Soltar mi recuadro' : 'Liberar este recuadro (Super Admin)'}
                    className="absolute right-2 top-2 rounded-md p-1 opacity-70 hover:opacity-100"
                    style={{ background: 'rgba(0,0,0,0.6)', color: C.text }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {zoomSlot !== null && (
        <ZoomView
          name={slots[zoomSlot]?.ownerName ?? `Recuadro ${zoomSlot + 1}`}
          stream={streamFor(zoomSlot)}
          onClose={() => setZoomSlot(null)}
        />
      )}
      {cropping && captureRef.current && (
        <CropDialog stream={captureRef.current} onApply={applyCrop} onCancel={() => setCropping(false)} />
      )}
    </AppShell>
  );
}

function ToolbarButton({ onClick, disabled, icon, tone, children }: {
  onClick: () => void; disabled?: boolean; icon: React.ReactNode; tone?: 'danger'; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
      style={tone === 'danger'
        ? { background: 'rgba(248,113,113,0.14)', color: '#f87171' }
        : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)' }}>
      {icon} {children}
    </button>
  );
}

/** Ampliación local del mismo video recibido: rueda o botones para zoom, arrastrar para mover. */
function ZoomView({ name, stream, onClose }: { name: string; stream: MediaStream | null; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const zoom = (next: number) => {
    const s = Math.min(6, Math.max(1, next));
    setScale(s);
    if (s === 1) setPan({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: 'rgba(0,0,0,0.92)' }}>
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="flex-1 truncate text-sm font-semibold" style={{ color: C.text }}>{name}</span>
        <ToolbarButton onClick={() => zoom(scale - 0.5)} disabled={scale <= 1} icon={<ZoomOut className="h-4 w-4" />}>Alejar</ToolbarButton>
        <span className="w-12 text-center text-xs" style={{ color: C.muted }}>{Math.round(scale * 100)}%</span>
        <ToolbarButton onClick={() => zoom(scale + 0.5)} disabled={scale >= 6} icon={<ZoomIn className="h-4 w-4" />}>Acercar</ToolbarButton>
        <ToolbarButton onClick={onClose} icon={<X className="h-4 w-4" />}>Cerrar (Esc)</ToolbarButton>
      </div>
      <div className="relative flex-1 overflow-hidden"
        style={{ cursor: scale > 1 ? 'grab' : 'default', touchAction: 'none' }}
        onWheel={(e) => zoom(scale + (e.deltaY < 0 ? 0.25 : -0.25))}
        onDoubleClick={() => zoom(scale > 1 ? 1 : 2)}
        onPointerDown={(e) => {
          if (scale <= 1) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
        }}
        onPointerUp={() => { drag.current = null; }}>
        {stream ? (
          <StreamVideo stream={stream} className="h-full w-full object-contain select-none"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: 'center' }} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm" style={{ color: C.muted }}>La transmisión terminó.</div>
        )}
      </div>
      <p className="px-4 pb-3 text-center text-xs" style={{ color: C.muted }}>
        Rueda del mouse o doble clic para acercar · arrastra para moverte
      </p>
    </div>
  );
}

/** Selecciona con el mouse la zona de la pantalla que se transmitirá. */
function CropDialog({ stream, onApply, onCancel }: {
  stream: MediaStream; onApply: (rect: CropRect) => void; onCancel: () => void;
}) {
  const [rect, setRect] = useState<CropRect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const point = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  };

  const valid = !!rect && rect.w > 0.03 && rect.h > 0.03;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 p-6" style={{ background: 'rgba(0,0,0,0.9)' }}>
      <p className="text-sm" style={{ color: C.text }}>Arrastra el mouse sobre la zona que quieres mostrar. Solo esa parte se verá en tu recuadro.</p>
      <div className="relative inline-block">
        <StreamVideo stream={stream} className="block max-h-[70vh] max-w-full" />
        <div className="absolute inset-0 cursor-crosshair" style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = point(e);
            setRect({ ...start.current, w: 0, h: 0 });
          }}
          onPointerMove={(e) => {
            const s = start.current;
            if (!s) return;
            const p = point(e);
            setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
          }}
          onPointerUp={() => { start.current = null; }}>
          {rect && (
            <div className="absolute" style={{
              left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`,
              border: `2px solid ${C.accent}`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            }} />
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <ToolbarButton onClick={onCancel} icon={<X className="h-4 w-4" />}>Cancelar</ToolbarButton>
        <button onClick={() => rect && valid && onApply(rect)} disabled={!valid}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
          style={{ background: 'rgba(123,241,214,0.18)', color: C.accent }}>
          <Crop className="h-4 w-4" /> Usar esta zona
        </button>
      </div>
    </div>
  );
}
