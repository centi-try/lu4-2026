import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

// ============================================================================
// Cámaras — hasta 9 recuadros donde cada usuario comparte su pantalla.
// El video viaja directo entre los navegadores y Cloudflare Realtime (SFU);
// este backend solo reparte los recuadros, guarda el App Secret y valida que
// cada operación sobre una sesión del SFU la haga su dueño. El estado vive en
// memoria: no se persiste nada en la base de datos.
// ============================================================================

export const SLOT_COUNT = 9;
export const STALE_MS = 90_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SFU_TIMEOUT_MS = 10_000;
const TURN_TTL_S = 24 * 60 * 60;

type Publication = { sessionId: string; trackName: string; mid: string };
type Slot = {
  ownerId: number;
  ownerName: string;
  claimedAt: number;
  lastSeen: number;
  publication: Publication | null;
};

const slots: Array<Slot | null> = Array.from({ length: SLOT_COUNT }, () => null);
const sessionOwners = new Map<string, { userId: number; createdAt: number }>();

export function resetCamerasState() {
  slots.fill(null);
  sessionOwners.clear();
}

const sfuConfig = () => {
  const appId = process.env.CF_REALTIME_APP_ID;
  const secret = process.env.CF_REALTIME_APP_SECRET;
  return appId && secret ? { appId, secret } : null;
};

const sdpSchema = z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().min(1).max(200_000) });
const slotSchema = z.number().int().min(0).max(SLOT_COUNT - 1);
const sessionIdSchema = z.string().min(1).max(200);

type SfuTrack = { mid?: string; trackName?: string; sessionId?: string; errorCode?: string; errorDescription?: string };
type SfuResponse = {
  sessionId?: string;
  sessionDescription?: { type: "offer" | "answer"; sdp: string };
  requiresImmediateRenegotiation?: boolean;
  tracks?: SfuTrack[];
  errorCode?: string;
  errorDescription?: string;
};

async function sfu(path: string, method: "POST" | "PUT", body?: unknown): Promise<SfuResponse> {
  const cfg = sfuConfig();
  if (!cfg) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cámaras no está configurado en el servidor." });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SFU_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(cfg.appId)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.secret}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new TRPCError({ code: "GATEWAY_TIMEOUT", message: "El servidor de video no respondió. Intenta de nuevo." });
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as SfuResponse;
  if (!res.ok || data.errorCode) {
    console.error(`[cameras] SFU ${method} ${path.replace(/sessions\/[^/]+/, "sessions/…")} -> ${res.status} ${data.errorCode ?? ""}`);
    throw new TRPCError({ code: "BAD_GATEWAY", message: "El servidor de video rechazó la operación. Intenta de nuevo." });
  }
  return data;
}

const closeQuietly = (pub: Publication) =>
  sfu(`/sessions/${encodeURIComponent(pub.sessionId)}/tracks/close`, "PUT", { force: true, tracks: [{ mid: pub.mid }] }).catch(() => {});

const displayName = (u: any) => String(u?.characterName || u?.name || u?.email || "Usuario");
const isModerator = (u: any) => String(u?.role || "").toLowerCase() === "super_admin";

function sweep(now = Date.now()) {
  slots.forEach((s, i) => {
    if (s && now - s.lastSeen > STALE_MS) {
      if (s.publication) closeQuietly(s.publication);
      slots[i] = null;
    }
  });
  sessionOwners.forEach((v, k) => {
    if (now - v.createdAt > SESSION_TTL_MS) sessionOwners.delete(k);
  });
}

function freeSlot(i: number) {
  const s = slots[i];
  if (s?.publication) closeQuietly(s.publication);
  slots[i] = null;
}

function ownSlot(userId: number, i: number): Slot {
  sweep();
  const s = slots[i];
  if (!s || s.ownerId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Este recuadro ya no es tuyo." });
  s.lastSeen = Date.now();
  return s;
}

function ownSession(userId: number, sessionId: string) {
  if (sessionOwners.get(sessionId)?.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sesión de video inválida. Recarga la página." });
  }
}

const cameraProcedure = protectedProcedure.use(({ ctx, next }) => {
  const u: any = ctx.user;
  if (!isModerator(u) && u?.legacyAccess !== true) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a Cámaras." });
  }
  return next();
});

export const camerasRouter = router({
  status: cameraProcedure.query(({ ctx }) => {
    sweep();
    return {
      configured: !!sfuConfig(),
      me: Number(ctx.user.id),
      canModerate: isModerator(ctx.user),
      slots: slots.map((s, index) => ({
        index,
        ownerId: s?.ownerId ?? null,
        ownerName: s?.ownerName ?? null,
        live: !!s?.publication,
        trackName: s?.publication?.trackName ?? null,
      })),
    };
  }),

  iceServers: cameraProcedure.query(async () => {
    const stun = [{ urls: ["stun:stun.cloudflare.com:3478"] }];
    const keyId = process.env.CF_TURN_KEY_ID;
    const token = process.env.CF_TURN_KEY_API_TOKEN;
    if (!keyId || !token) return stun;
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: TURN_TTL_S }),
          signal: AbortSignal.timeout(SFU_TIMEOUT_MS),
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { iceServers?: Array<{ urls: string[]; username?: string; credential?: string }> };
      return data.iceServers?.length ? data.iceServers : stun;
    } catch (e) {
      console.error("[cameras] TURN credentials failed:", (e as Error).message);
      return stun;
    }
  }),

  claim: cameraProcedure.input(z.object({ slot: slotSchema })).mutation(({ ctx, input }) => {
    sweep();
    const userId = Number(ctx.user.id);
    const current = slots[input.slot];
    if (current && current.ownerId !== userId) {
      throw new TRPCError({ code: "CONFLICT", message: `Este recuadro ya lo tomó ${current.ownerName}.` });
    }
    slots.forEach((s, i) => {
      if (s?.ownerId === userId && i !== input.slot) freeSlot(i);
    });
    const now = Date.now();
    slots[input.slot] = current ?? {
      ownerId: userId,
      ownerName: displayName(ctx.user),
      claimedAt: now,
      lastSeen: now,
      publication: null,
    };
    slots[input.slot]!.lastSeen = now;
    return { slot: input.slot };
  }),

  release: cameraProcedure.input(z.object({ slot: slotSchema })).mutation(({ ctx, input }) => {
    const s = slots[input.slot];
    if (!s) return { ok: true };
    if (s.ownerId !== Number(ctx.user.id) && !isModerator(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Solo el dueño o un Super Admin puede liberar este recuadro." });
    }
    freeSlot(input.slot);
    return { ok: true };
  }),

  heartbeat: cameraProcedure.input(z.object({ slot: slotSchema })).mutation(({ ctx, input }) => {
    sweep();
    const s = slots[input.slot];
    if (!s || s.ownerId !== Number(ctx.user.id)) return { owned: false };
    s.lastSeen = Date.now();
    return { owned: true };
  }),

  createSession: cameraProcedure.mutation(async ({ ctx }) => {
    const data = await sfu("/sessions/new", "POST");
    if (!data.sessionId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo abrir la sesión de video." });
    sessionOwners.set(data.sessionId, { userId: Number(ctx.user.id), createdAt: Date.now() });
    return { sessionId: data.sessionId };
  }),

  publish: cameraProcedure
    .input(z.object({ slot: slotSchema, sessionId: sessionIdSchema, mid: z.string().min(1).max(20), offer: sdpSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = Number(ctx.user.id);
      ownSession(userId, input.sessionId);
      ownSlot(userId, input.slot);
      const trackName = `slot${input.slot}-${Math.random().toString(36).slice(2, 10)}`;
      const data = await sfu(`/sessions/${encodeURIComponent(input.sessionId)}/tracks/new`, "POST", {
        sessionDescription: input.offer,
        tracks: [{ location: "local", mid: input.mid, trackName }],
      });
      const track = data.tracks?.[0];
      if (!data.sessionDescription || !track || track.errorCode) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo publicar la pantalla. Intenta de nuevo." });
      }
      const slot = ownSlot(userId, input.slot);
      if (slot.publication) closeQuietly(slot.publication);
      slot.publication = { sessionId: input.sessionId, trackName, mid: input.mid };
      return { answer: data.sessionDescription, trackName };
    }),

  unpublish: cameraProcedure.input(z.object({ slot: slotSchema })).mutation(({ ctx, input }) => {
    const s = slots[input.slot];
    if (!s || s.ownerId !== Number(ctx.user.id)) return { ok: true };
    if (s.publication) closeQuietly(s.publication);
    s.publication = null;
    return { ok: true };
  }),

  subscribe: cameraProcedure
    .input(z.object({ sessionId: sessionIdSchema, slots: z.array(slotSchema).min(1).max(SLOT_COUNT) }))
    .mutation(async ({ ctx, input }) => {
      ownSession(Number(ctx.user.id), input.sessionId);
      sweep();
      const wanted = Array.from(new Set(input.slots))
        .map((slot) => ({ slot, pub: slots[slot]?.publication }))
        .filter((w): w is { slot: number; pub: Publication } => !!w.pub);
      if (wanted.length === 0) return { tracks: [], offer: null };
      const data = await sfu(`/sessions/${encodeURIComponent(input.sessionId)}/tracks/new`, "POST", {
        tracks: wanted.map((w) => ({ location: "remote", sessionId: w.pub.sessionId, trackName: w.pub.trackName })),
      });
      const tracks = wanted.map((w, i) => {
        const t = data.tracks?.[i];
        return { slot: w.slot, trackName: w.pub.trackName, mid: t?.errorCode ? null : (t?.mid ?? null) };
      });
      return {
        tracks,
        offer: data.requiresImmediateRenegotiation && data.sessionDescription ? data.sessionDescription : null,
      };
    }),

  renegotiate: cameraProcedure
    .input(z.object({ sessionId: sessionIdSchema, answer: sdpSchema }))
    .mutation(async ({ ctx, input }) => {
      ownSession(Number(ctx.user.id), input.sessionId);
      await sfu(`/sessions/${encodeURIComponent(input.sessionId)}/renegotiate`, "PUT", { sessionDescription: input.answer });
      return { ok: true };
    }),

  closeTracks: cameraProcedure
    .input(z.object({ sessionId: sessionIdSchema, mids: z.array(z.string().min(1).max(20)).min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      ownSession(Number(ctx.user.id), input.sessionId);
      await sfu(`/sessions/${encodeURIComponent(input.sessionId)}/tracks/close`, "PUT", {
        force: true,
        tracks: input.mids.map((mid) => ({ mid })),
      });
      return { ok: true };
    }),
});
