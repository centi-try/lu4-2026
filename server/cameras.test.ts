import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { camerasRouter, resetCamerasState, STALE_MS } from './routers/cameras';

const user = (id: number, extra: Record<string, unknown> = {}) => ({
  id, name: `U${id}`, characterName: `Char${id}`, role: 'user', legacyAccess: true, ...extra,
});
const caller = (u: any) => camerasRouter.createCaller({ user: u, req: {} as any, res: {} as any });

const offer = { type: 'offer' as const, sdp: 'v=0 offer' };
let fetchMock: ReturnType<typeof vi.fn>;
let sessionCounter = 0;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  resetCamerasState();
  process.env.CF_REALTIME_APP_ID = 'app123';
  process.env.CF_REALTIME_APP_SECRET = 'secret123';
  delete process.env.CF_TURN_KEY_ID;
  delete process.env.CF_TURN_KEY_API_TOKEN;
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (url.endsWith('/sessions/new')) return json({ sessionId: `sess${++sessionCounter}` });
    if (url.endsWith('/tracks/new') && body.sessionDescription) {
      return json({ sessionDescription: { type: 'answer', sdp: 'v=0 answer' }, tracks: body.tracks.map((t: any) => ({ mid: t.mid, trackName: t.trackName })) });
    }
    if (url.endsWith('/tracks/new')) {
      return json({
        requiresImmediateRenegotiation: true,
        sessionDescription: { type: 'offer', sdp: 'v=0 sfu-offer' },
        tracks: body.tracks.map((t: any, i: number) => ({ mid: String(i), trackName: t.trackName, sessionId: t.sessionId })),
      });
    }
    return json({});
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('cameras router', () => {
  it('bloquea a usuarios sin acceso al sistema', async () => {
    await expect(caller(user(1, { legacyAccess: false })).status()).rejects.toThrow('No tienes acceso');
    await expect(caller(null).status()).rejects.toThrow();
  });

  it('un recuadro tiene un solo dueño y cada usuario tiene un solo recuadro', async () => {
    await caller(user(1)).claim({ slot: 0 });
    await expect(caller(user(2)).claim({ slot: 0 })).rejects.toThrow('Char1');
    await caller(user(1)).claim({ slot: 4 });
    const { slots } = await caller(user(2)).status();
    expect(slots[0].ownerId).toBeNull();
    expect(slots[4]).toMatchObject({ ownerId: 1, ownerName: 'Char1', live: false });
  });

  it('solo el dueño o el Super Admin liberan un recuadro', async () => {
    await caller(user(1)).claim({ slot: 2 });
    await expect(caller(user(2)).release({ slot: 2 })).rejects.toThrow();
    await caller(user(9, { role: 'super_admin', legacyAccess: false })).release({ slot: 2 });
    expect((await caller(user(1)).status()).slots[2].ownerId).toBeNull();
  });

  it('libera el recuadro si el dueño deja de mandar señales', async () => {
    vi.useFakeTimers();
    await caller(user(1)).claim({ slot: 1 });
    vi.advanceTimersByTime(STALE_MS - 1000);
    expect((await caller(user(1)).heartbeat({ slot: 1 })).owned).toBe(true);
    vi.advanceTimersByTime(STALE_MS + 1000);
    expect((await caller(user(2)).status()).slots[1].ownerId).toBeNull();
    expect((await caller(user(1)).heartbeat({ slot: 1 })).owned).toBe(false);
  });

  it('publica y suscribe usando sesiones propias; el secret va solo en el header', async () => {
    const pub = caller(user(1));
    await pub.claim({ slot: 3 });
    const { sessionId } = await pub.createSession();
    const res = await pub.publish({ slot: 3, sessionId, mid: '0', offer });
    expect(res.answer.type).toBe('answer');
    expect((await caller(user(2)).status()).slots[3]).toMatchObject({ live: false, trackName: null });
    await expect(caller(user(2)).publishReady({ slot: 3, trackName: res.trackName })).rejects.toThrow();
    await pub.publishReady({ slot: 3, trackName: res.trackName });
    const status = await caller(user(2)).status();
    expect(status.slots[3]).toMatchObject({ live: true, trackName: res.trackName });

    await expect(caller(user(2)).publish({ slot: 3, sessionId, mid: '0', offer })).rejects.toThrow();

    const viewer = caller(user(2));
    const v = await viewer.createSession();
    await expect(pub.subscribe({ sessionId: v.sessionId, slots: [3] })).rejects.toThrow('Sesión de video inválida');
    const sub = await viewer.subscribe({ sessionId: v.sessionId, slots: [3, 5] });
    expect(sub.tracks).toEqual([{ slot: 3, trackName: res.trackName, mid: '0' }]);
    expect(sub.offer?.type).toBe('offer');
    const pullBody = JSON.parse(String(fetchMock.mock.calls.at(-1)![1].body));
    expect(pullBody.tracks).toEqual([{ location: 'remote', sessionId, trackName: res.trackName }]);

    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toMatch(/^https:\/\/rtc\.live\.cloudflare\.com\/v1\/apps\/app123\//);
      expect(init.headers.Authorization).toBe('Bearer secret123');
      expect(String(init.body ?? '')).not.toContain('secret123');
    }
  });

  it('al liberar un recuadro en vivo cierra la pista en el SFU', async () => {
    const pub = caller(user(1));
    await pub.claim({ slot: 0 });
    const { sessionId } = await pub.createSession();
    await pub.publish({ slot: 0, sessionId, mid: '0', offer });
    await pub.release({ slot: 0 });
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toContain(`/sessions/${sessionId}/tracks/close`);
    expect(JSON.parse(String(init.body))).toEqual({ force: true, tracks: [{ mid: '0' }] });
  });

  it('sin TURN configurado entrega solo STUN', async () => {
    expect(await caller(user(1)).iceServers()).toEqual([{ urls: ['stun:stun.cloudflare.com:3478'] }]);
  });
});
