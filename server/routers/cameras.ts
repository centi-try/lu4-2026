import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { createAuditLog, dbInstance, saveDbToDisk } from "../db";

// ============================================================================
// Cámaras — hasta 9 recuadros donde cada usuario comparte su pantalla.
// El video viaja directo entre los navegadores y Cloudflare Realtime (SFU);
// este backend solo reparte los recuadros, guarda el App Secret y valida que
// cada operación sobre una sesión del SFU la haga su dueño. Los recuadros viven
// en memoria; solo el consumo mensual y los interruptores de los admins se
// guardan en `settings` (entrada con key "cameras").
// ============================================================================

export const SLOT_COUNT = 9;
export const STALE_MS = 90_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SFU_TIMEOUT_MS = 10_000;
const TURN_TTL_S = 24 * 60 * 60;

// Cloudflare cobra el video que reciben los espectadores; 1000 GB al mes son gratis.
export const GB = 1e9;
export const FREE_BYTES = 1000 * GB;
export const WARN_BYTES = 900 * GB;
export const BLOCK_BYTES = 950 * GB;
const MAX_REPORT_BYTES = 200e6;
const MIN_REPORT_INTERVAL_MS = 10_000;
const USAGE_SAVE_MS = 60_000;

type Publication = { sessionId: string; trackName: string; mid: string; ready: boolean };
type Slot = {
  ownerId: number;
  ownerName: string;
  claimedAt: number;
  lastSeen: number;
  publication: Publication | null;
};

const slots: Array<Slot | null> = Array.from({ length: SLOT_COUNT }, () => null);
const sessionOwners = new Map<string, { userId: number; createdAt: number }>();
const lastReport = new Map<number, number>();
let lastUsageSave = 0;

export function resetCamerasState() {
  slots.fill(null);
  sessionOwners.clear();
  lastReport.clear();
  lastUsageSave = 0;
}

type CameraSettings = {
  key: "cameras";
  month: string;
  bytes: number;
  sharingEnabled: boolean;
  overLimitUnlocked: boolean;
  unlockedBy: string | null;
  updatedAt: string;
};

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

function cameraSettings(): CameraSettings {
  const list = dbInstance.settings;
  let cfg = list.find((x: any) => x?.key === "cameras") as CameraSettings | undefined;
  if (!cfg) {
    cfg = { key: "cameras", month: monthKey(), bytes: 0, sharingEnabled: true, overLimitUnlocked: false, unlockedBy: null, updatedAt: new Date().toISOString() };
    list.push(cfg);
    saveDbToDisk();
  }
  if (cfg.month !== monthKey()) {
    Object.assign(cfg, { month: monthKey(), bytes: 0, overLimitUnlocked: false, unlockedBy: null, updatedAt: new Date().toISOString() });
    saveDbToDisk();
  }
  return cfg;
}

const isBlocked = (cfg: CameraSettings) => cfg.bytes >= BLOCK_BYTES && !cfg.overLimitUnlocked;

function assertStreamingAllowed() {
  const cfg = cameraSettings();
  if (isBlocked(cfg)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cámaras está bloqueado: se alcanzó el límite gratis del mes. Un administrador debe desbloquearlo." });
  }
  if (!cfg.sharingEnabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Compartir pantalla está pausado por un administrador." });
  }
}

function freeAllSlots() {
  slots.forEach((_, i) => freeSlot(i));
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

async function sfu(path: string, method: "POST" | "PUT", body?: unknown, quiet = false): Promise<SfuResponse> {
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
    if (!quiet) {
      const detail = String(data.errorDescription ?? "").slice(0, 120);
      console.error(`[cameras] SFU ${method} ${path.replace(/sessions\/[^/]+/, "sessions/…")} -> ${res.status} ${data.errorCode ?? ""} ${detail}`);
    }
    throw new TRPCError({ code: "BAD_GATEWAY", message: "El servidor de video rechazó la operación. Intenta de nuevo." });
  }
  return data;
}

const closeQuietly = (pub: Publication) =>
  sfu(`/sessions/${encodeURIComponent(pub.sessionId)}/tracks/close`, "PUT", { force: true, tracks: [{ mid: pub.mid }] }, true).catch(() => {});

const displayName = (u: any) => String(u?.characterName || u?.name || u?.email || "Usuario");
const isModerator = (u: any) => ["super_admin", "admin"].includes(String(u?.role || "").toLowerCase());

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
  if (!isModerator(u) && u?.legacyAccess !== true && u?.cpAccess !== true) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a Cámaras." });
  }
  return next();
});

export const camerasRouter = router({
  status: cameraProcedure.query(({ ctx }) => {
    sweep();
    const cfg = cameraSettings();
    return {
      configured: !!sfuConfig(),
      me: Number(ctx.user.id),
      canModerate: isModerator(ctx.user),
      usage: {
        month: cfg.month,
        bytes: cfg.bytes,
        freeBytes: FREE_BYTES,
        warnBytes: WARN_BYTES,
        blockBytes: BLOCK_BYTES,
        sharingEnabled: cfg.sharingEnabled,
        blocked: isBlocked(cfg),
        overLimitUnlocked: cfg.overLimitUnlocked,
        unlockedBy: cfg.unlockedBy,
      },
      slots: slots.map((s, index) => ({
        index,
        ownerId: s?.ownerId ?? null,
        ownerName: s?.ownerName ?? null,
        live: !!s?.publication?.ready,
        trackName: s?.publication?.ready ? s.publication.trackName : null,
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
    assertStreamingAllowed();
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
      assertStreamingAllowed();
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
      slot.publication = { sessionId: input.sessionId, trackName, mid: input.mid, ready: false };
      return { answer: data.sessionDescription, trackName };
    }),

  /** El navegador avisa que su conexión con el SFU ya está activa; recién ahí otros pueden suscribirse. */
  publishReady: cameraProcedure
    .input(z.object({ slot: slotSchema, trackName: z.string().min(1).max(64) }))
    .mutation(({ ctx, input }) => {
      const s = ownSlot(Number(ctx.user.id), input.slot);
      if (s.publication?.trackName !== input.trackName) return { ok: false };
      s.publication.ready = true;
      return { ok: true };
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
      if (isBlocked(cameraSettings())) assertStreamingAllowed();
      const wanted = Array.from(new Set(input.slots))
        .map((slot) => ({ slot, pub: slots[slot]?.publication }))
        .filter((w): w is { slot: number; pub: Publication } => !!w.pub?.ready);
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

  /** Cada espectador informa los bytes de video que recibió desde su último reporte. */
  reportUsage: cameraProcedure
    .input(z.object({ bytes: z.number().int().min(0).max(10 * MAX_REPORT_BYTES) }))
    .mutation(({ ctx, input }) => {
      const userId = Number(ctx.user.id);
      const now = Date.now();
      if (now - (lastReport.get(userId) ?? 0) < MIN_REPORT_INTERVAL_MS) return { ok: false };
      lastReport.set(userId, now);
      const cfg = cameraSettings();
      const wasBlocked = isBlocked(cfg);
      cfg.bytes += Math.min(input.bytes, MAX_REPORT_BYTES);
      cfg.updatedAt = new Date(now).toISOString();
      if (!wasBlocked && isBlocked(cfg)) {
        freeAllSlots();
        console.warn(`[cameras] límite de ${BLOCK_BYTES / GB} GB alcanzado en ${cfg.month}: Cámaras bloqueado`);
      }
      if (now - lastUsageSave >= USAGE_SAVE_MS || isBlocked(cfg) !== wasBlocked) {
        lastUsageSave = now;
        saveDbToDisk();
      }
      return { ok: true };
    }),

  setSharingEnabled: cameraProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!isModerator(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Solo un Admin o Super Admin puede hacer esto." });
      const cfg = cameraSettings();
      cfg.sharingEnabled = input.enabled;
      cfg.updatedAt = new Date().toISOString();
      if (!input.enabled) freeAllSlots();
      saveDbToDisk();
      await createAuditLog({
        userId: ctx.user.id,
        action: input.enabled ? "CAMERAS_SHARING_ENABLED" : "CAMERAS_SHARING_PAUSED",
        detail: input.enabled ? "Reanudó compartir pantalla en Cámaras." : "Pausó compartir pantalla en Cámaras.",
      });
      return { ok: true };
    }),

  unlockOverLimit: cameraProcedure
    .input(z.object({ acceptCost: z.literal(true) }))
    .mutation(async ({ ctx }) => {
      if (!isModerator(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Solo un Admin o Super Admin puede hacer esto." });
      const cfg = cameraSettings();
      cfg.overLimitUnlocked = true;
      cfg.unlockedBy = displayName(ctx.user);
      cfg.updatedAt = new Date().toISOString();
      saveDbToDisk();
      await createAuditLog({
        userId: ctx.user.id,
        action: "CAMERAS_OVER_LIMIT_UNLOCKED",
        detail: `Desbloqueó Cámaras sobre ${BLOCK_BYTES / GB} GB en ${cfg.month} (${(cfg.bytes / GB).toFixed(1)} GB usados), aceptando el costo sobre ${FREE_BYTES / GB} GB.`,
      });
      return { ok: true };
    }),
});
