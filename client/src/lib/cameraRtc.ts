// WebRTC contra Cloudflare Realtime (SFU) para el menú Cámaras. Todas las
// llamadas al SFU pasan por el backend (que guarda el App Secret); aquí solo
// se manejan las PeerConnection del navegador. Cada sesión del SFU tiene una
// sola negociación a la vez, por eso las mutaciones se encolan.

type Sdp = { type: 'offer' | 'answer'; sdp: string };

export interface CamerasApi {
  createSession(): Promise<{ sessionId: string }>;
  publish(input: { slot: number; sessionId: string; mid: string; offer: Sdp }): Promise<{ answer: Sdp; trackName: string }>;
  publishReady(input: { slot: number; trackName: string }): Promise<unknown>;
  subscribe(input: { sessionId: string; slots: number[] }): Promise<{
    tracks: Array<{ slot: number; trackName: string; mid: string | null }>;
    offer: Sdp | null;
  }>;
  renegotiate(input: { sessionId: string; answer: Sdp }): Promise<unknown>;
  closeTracks(input: { sessionId: string; mids: string[] }): Promise<unknown>;
}

export const MAX_BITRATE = 150_000;
export const MAX_FPS = 5;

class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => {});
    return next;
  }
}

function newPeer(iceServers: RTCIceServer[]) {
  return new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
}

function toSdp(d: RTCSessionDescriptionInit | null, type: Sdp['type']): Sdp {
  if (!d?.sdp) throw new Error('El navegador no generó la negociación de video.');
  return { type, sdp: d.sdp };
}

const CONNECT_TIMEOUT_MS = 20_000;

function waitConnected(pc: RTCPeerConnection) {
  return new Promise<void>((resolve, reject) => {
    if (pc.connectionState === 'connected') return resolve();
    const timer = setTimeout(() => done(new Error('No se pudo conectar con el servidor de video. Revisa tu conexión.')), CONNECT_TIMEOUT_MS);
    const onChange = () => {
      if (pc.connectionState === 'connected') done();
      else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') done(new Error('Se perdió la conexión de video.'));
    };
    const done = (err?: Error) => {
      clearTimeout(timer);
      pc.removeEventListener('connectionstatechange', onChange);
      if (err) reject(err);
      else resolve();
    };
    pc.addEventListener('connectionstatechange', onChange);
  });
}

function watchConnection(pc: RTCPeerConnection, onLost: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') onLost();
    if (pc.connectionState === 'disconnected') {
      timer ??= setTimeout(() => pc.connectionState !== 'connected' && onLost(), 5_000);
    } else if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  });
}

/** Publica una sola pista de video (la pantalla compartida) en un recuadro. */
export class ScreenPublisher {
  private pc: RTCPeerConnection | null = null;
  private sender: RTCRtpSender | null = null;
  private closed = false;

  constructor(
    private api: CamerasApi,
    private iceServers: RTCIceServer[],
    private onLost: () => void,
  ) {}

  async start(slot: number, track: MediaStreamTrack) {
    const pc = newPeer(this.iceServers);
    this.pc = pc;
    watchConnection(pc, () => !this.closed && this.onLost());
    const { sessionId } = await this.api.createSession();
    const transceiver = pc.addTransceiver(track, {
      direction: 'sendonly',
      sendEncodings: [{ maxBitrate: MAX_BITRATE, maxFramerate: MAX_FPS }],
    });
    this.sender = transceiver.sender;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (!transceiver.mid) throw new Error('El navegador no asignó la pista de video.');
    const { answer, trackName } = await this.api.publish({ slot, sessionId, mid: transceiver.mid, offer: toSdp(offer, 'offer') });
    if (this.closed) return;
    await pc.setRemoteDescription(answer);
    await waitConnected(pc);
    if (this.closed) return;
    await this.api.publishReady({ slot, trackName });
  }

  /** Cambia la imagen enviada (p. ej. al recortar) sin renegociar. */
  async replaceTrack(track: MediaStreamTrack) {
    await this.sender?.replaceTrack(track);
  }

  close() {
    this.closed = true;
    this.pc?.close();
    this.pc = null;
    this.sender = null;
  }
}

type Subscription = { trackName: string; mid: string; stream: MediaStream };

/**
 * Recibe los recuadros en vivo por una única PeerConnection. `sync` recibe el
 * estado deseado (recuadro → trackName publicado) y agrega o quita pistas.
 */
export class GridViewer {
  private pc: RTCPeerConnection;
  private sessionId: string | null = null;
  private queue = new SerialQueue();
  private subs = new Map<number, Subscription>();
  private pendingTracks = new Map<string, MediaStreamTrack>();
  private negotiated = false;
  private closed = false;

  constructor(
    private api: CamerasApi,
    iceServers: RTCIceServer[],
    private onStreams: (streams: Map<number, MediaStream>) => void,
    private onLost: () => void,
  ) {
    this.pc = newPeer(iceServers);
    watchConnection(this.pc, () => !this.closed && this.onLost());
    this.pc.addEventListener('track', (ev) => {
      const mid = ev.transceiver.mid;
      if (!mid) return;
      const sub = Array.from(this.subs.values()).find((s) => s.mid === mid);
      if (sub) {
        sub.stream.getTracks().forEach((t) => sub.stream.removeTrack(t));
        sub.stream.addTrack(ev.track);
        this.emit();
      } else {
        this.pendingTracks.set(mid, ev.track);
      }
    });
  }

  private emit() {
    if (this.closed) return;
    const out = new Map<number, MediaStream>();
    this.subs.forEach((s, slot) => {
      if (s.stream.getVideoTracks().length) out.set(slot, s.stream);
    });
    this.onStreams(out);
  }

  sync(desired: Map<number, string>) {
    return this.queue.run(async () => {
      if (this.closed) return;
      if (this.negotiated) await waitConnected(this.pc);

      const stale: number[] = [];
      this.subs.forEach((s, slot) => {
        if (desired.get(slot) !== s.trackName) stale.push(slot);
      });
      if (stale.length && this.sessionId) {
        const sessionId = this.sessionId;
        const mids = stale.map((slot) => this.subs.get(slot)!.mid);
        stale.forEach((slot) => this.subs.delete(slot));
        this.emit();
        await this.api.closeTracks({ sessionId, mids }).catch(() => {});
      }

      const missing = Array.from(desired.keys()).filter((slot) => !this.subs.has(slot));
      if (!missing.length || this.closed) return;
      // Cloudflare da por desconectada una sesión que no conecta pronto: se abre recién al necesitarla.
      this.sessionId ??= (await this.api.createSession()).sessionId;
      const sessionId = this.sessionId;
      if (this.closed) return;
      const res = await this.api.subscribe({ sessionId, slots: missing });
      for (const t of res.tracks) {
        if (!t.mid) continue;
        const stream = new MediaStream();
        const early = this.pendingTracks.get(t.mid);
        if (early) {
          stream.addTrack(early);
          this.pendingTracks.delete(t.mid);
        }
        this.subs.set(t.slot, { trackName: t.trackName, mid: t.mid, stream });
      }
      if (res.offer && !this.closed) {
        await this.pc.setRemoteDescription(res.offer);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.api.renegotiate({ sessionId, answer: toSdp(answer, 'answer') });
        this.negotiated = true;
        await waitConnected(this.pc);
      }
      this.emit();
    });
  }

  close() {
    this.closed = true;
    this.pc.close();
    this.subs.clear();
  }
}

// ---------------------------------------------------------------------------
// Recorte de zona: se transmite solo el rectángulo elegido (coordenadas 0..1).
// Usa Insertable Streams (Chrome/Edge); funciona con la pestaña en segundo
// plano porque el procesamiento lo marca la llegada de cada cuadro, no un timer.
// ---------------------------------------------------------------------------

export type CropRect = { x: number; y: number; w: number; h: number };

type TrackProcessorCtor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };
type TrackGeneratorCtor = new (init: { kind: 'video' }) => MediaStreamTrack & { writable: WritableStream<VideoFrame> };

const insertable = globalThis as unknown as {
  MediaStreamTrackProcessor?: TrackProcessorCtor;
  MediaStreamTrackGenerator?: TrackGeneratorCtor;
};

export const canCrop = () => !!insertable.MediaStreamTrackProcessor && !!insertable.MediaStreamTrackGenerator;

const evenFloor = (n: number) => Math.floor(n / 2) * 2;

/** Devuelve una pista nueva con solo el rectángulo elegido; `stop` la libera. */
export function cropTrack(source: MediaStreamTrack, rect: CropRect): { track: MediaStreamTrack; stop: () => void } {
  const Processor = insertable.MediaStreamTrackProcessor;
  const Generator = insertable.MediaStreamTrackGenerator;
  if (!Processor || !Generator) throw new Error('Tu navegador no permite recortar. Usa Chrome o Edge.');
  const input = source.clone();
  const processor = new Processor({ track: input });
  const generator = new Generator({ kind: 'video' });
  const transform = new TransformStream<VideoFrame, VideoFrame>({
    transform(frame, controller) {
      const fw = frame.displayWidth;
      const fh = frame.displayHeight;
      const x = Math.min(evenFloor(rect.x * fw), Math.max(0, fw - 2));
      const y = Math.min(evenFloor(rect.y * fh), Math.max(0, fh - 2));
      const width = Math.max(2, evenFloor(Math.min(rect.w * fw, fw - x)));
      const height = Math.max(2, evenFloor(Math.min(rect.h * fh, fh - y)));
      try {
        controller.enqueue(new VideoFrame(frame, { visibleRect: { x, y, width, height } }));
      } catch {
        controller.enqueue(frame.clone());
      } finally {
        frame.close();
      }
    },
  });
  processor.readable.pipeThrough(transform).pipeTo(generator.writable).catch(() => {});
  generator.contentHint = 'detail';
  return {
    track: generator,
    stop: () => {
      generator.stop();
      input.stop();
    },
  };
}
