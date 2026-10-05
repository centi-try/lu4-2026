import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { createAuditLog, dbInstance, saveDbToDisk } from "../db";

// ============================================================================
// DKP — puntos por asistencia de cada CP (de "Clanes & CPs") a eventos.
// Flujo: un Admin DKP crea el evento → el líder de cada CP sube 1 foto y marca
// hasta 9 asistentes → envía su registro (ya no lo puede tocar) → un Admin DKP
// valida o corrige → cierra el evento escribiendo "CERRAR". Solo cuentan los
// registros enviados de eventos cerrados; los puntos y porcentajes se calculan
// siempre a partir de los datos, así que una corrección se refleja sola.
// ============================================================================

export const MAX_ATTENDEES = 9;
export const CLOSE_WORD = "CERRAR";
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_ROUTE = "/api/dkp-evidence";
export const photoDir = () =>
  path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"), "dkp-evidence");

type EventStatus = "open" | "closed" | "cancelled";
type LogEntry = { at: string; by: string; action: string; detail: string };
type DkpEventType = { id: number; name: string; points: number; active: boolean; createdAt: string; updatedAt: string };
type DkpEvent = {
  id: number;
  typeId?: number | null;
  name: string;
  date: string;
  points: number;
  status: EventStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  log: LogEntry[];
};
type Attendee = { userId: number; name: string };
type RecordStatus = "draft" | "submitted" | "validated";
type Correction = { at: string; by: string; reason: string; before: string[]; after: string[] };
type DkpRecord = {
  id: number;
  eventId: number;
  cpId: number;
  cpName: string;
  photoUrl: string | null;
  attendees: Attendee[];
  status: RecordStatus;
  submittedBy: string | null;
  submittedAt: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
  updatedAt: string;
  corrections: Correction[];
};
type LedgerType = "purchase" | "delivery" | "adjust";
type LedgerEntry = {
  id: number;
  cpId: number;
  type: LedgerType;
  points: number;
  itemName: string | null;
  comment: string;
  date: string;
  createdBy: string;
  createdAt: string;
  auctionId?: number;
};
type AuctionStatus = "open" | "closed" | "cancelled";
type Bid = { id: number; cpId: number; cpName: string; amount: number; by: string; byUserId: number; at: string };
type DkpAuction = {
  id: number;
  itemName: string;
  itemType: string;
  notes: string | null;
  endsAt: string;
  status: AuctionStatus;
  bids: Bid[];
  winnerCpId: number | null;
  winningBid: number | null;
  ledgerId: number | null;
  cancelReason: string | null;
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
};

export const AUCTION_ITEM_TYPES = ["Arma", "Armadura", "Joya", "Accesorio", "Libro / Skill", "Material", "Receta", "Consumible", "Otro"] as const;
const MIN_AUCTION_MS = 60_000;
const MAX_AUCTION_MS = 30 * 24 * 3600_000;

const events = (): DkpEvent[] => (dbInstance.dkpEvents ??= []);
const records = (): DkpRecord[] => (dbInstance.dkpRecords ??= []);
const ledger = (): LedgerEntry[] => (dbInstance.dkpLedger ??= []);
const eventTypes = (): DkpEventType[] => (dbInstance.dkpEventTypes ??= []);
const auctions = (): DkpAuction[] => (dbInstance.dkpAuctions ??= []);
const activeTypes = () =>
  eventTypes()
    .filter((t) => t.active)
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((t) => ({ id: t.id, name: t.name, points: t.points }));

const nowIso = () => new Date().toISOString();
const monthOf = (date: string) => date.slice(0, 7);
const nextId = (list: Array<{ id: number }>) => list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
const nameOf = (u: any) => String(u?.characterName || u?.name || u?.email || "Usuario");
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : null);

const freshUser = (u: any) => (dbInstance.users || []).find((x: any) => Number(x.id) === Number(u?.id)) ?? u;
/** Nombre para bitácoras; si un Super Admin está viendo DKP como otro usuario, deja constancia de ambos. */
const actorName = (u: any) => (u?.viewAsBy ? `${nameOf(u)} (vía ${u.viewAsBy})` : nameOf(u));
export const VIEW_AS_HEADER = "x-dkp-view-as";

/**
 * El Super Admin puede "cambiar de cuenta" en la app para ver lo que ve otro usuario.
 * En DKP eso debe aplicar también los permisos de ese usuario, no los del Super Admin.
 */
export function effectiveDkpUser(authUser: any, headerValue: unknown) {
  const real = freshUser(authUser);
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const targetId = Number(raw);
  if (!raw || !Number.isInteger(targetId) || targetId === Number(real?.id)) return real;
  if (String(real?.role || "").toLowerCase() !== "super_admin") return real;
  const target = (dbInstance.users || []).find((x: any) => Number(x.id) === targetId && x.isActive !== false);
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "El usuario que estás viendo ya no existe." });
  return { ...target, viewAsBy: nameOf(real), viewAsById: Number(real.id) };
}
export const isDkpAdmin = (u: any) => String(u?.role || "").toLowerCase() === "super_admin" || u?.dkpAdmin === true;

type Cp = { id: number; name: string; clanId: number | null; leaderIds: number[] };
function commandParties(): Cp[] {
  return (dbInstance.raidCommandParties || [])
    .map((cp: any) => ({
      id: Number(cp.id),
      name: String(cp.name || "CP"),
      clanId: cp.clanId != null ? Number(cp.clanId) : null,
      leaderIds: (Array.isArray(cp.leaderIds) && cp.leaderIds.length ? cp.leaderIds : cp.leaderId != null ? [cp.leaderId] : []).map(Number),
    }))
    .sort((a: Cp, b: Cp) => a.name.localeCompare(b.name, "es"));
}
function findCp(cpId: number): Cp {
  const cp = commandParties().find((c) => c.id === cpId);
  if (!cp) throw new TRPCError({ code: "NOT_FOUND", message: "La CP no existe." });
  return cp;
}
const isLeader = (u: any, cp: Cp) => cp.leaderIds.includes(Number(u?.id));

type Member = { userId: number; name: string; className: string | null; joinedAt: string | null };
function members(cpId: number): Member[] {
  return (dbInstance.users || [])
    .filter((u: any) => Number(u.raidCpId) === cpId && u.cpStatus === "confirmed" && u.isActive !== false)
    .map((u: any) => ({ userId: Number(u.id), name: nameOf(u), className: u.classMain || null, joinedAt: u.cpJoinedAt || null }))
    .sort((a: Member, b: Member) => a.name.localeCompare(b.name, "es"));
}

function findEvent(eventId: number): DkpEvent {
  const ev = events().find((e) => e.id === eventId);
  if (!ev) throw new TRPCError({ code: "NOT_FOUND", message: "El evento no existe." });
  return ev;
}
function findType(id: number, mustBeActive = false): DkpEventType {
  const t = eventTypes().find((x) => x.id === id);
  if (!t || (mustBeActive && !t.active)) throw new TRPCError({ code: "NOT_FOUND", message: "Ese tipo de evento no existe." });
  return t;
}
const recordOf = (eventId: number, cpId: number) => records().find((r) => r.eventId === eventId && r.cpId === cpId);
const counts = (r: DkpRecord | undefined): r is DkpRecord => !!r && r.status !== "draft";
const closedInMonth = (month: string) =>
  events().filter((e) => e.status === "closed" && monthOf(e.date) === month).sort((a, b) => a.date.localeCompare(b.date));

export function cpBalance(cpId: number) {
  const fromEvents = events()
    .filter((e) => e.status === "closed")
    .reduce((sum, e) => {
      const r = recordOf(e.id, cpId);
      return sum + (counts(r) ? r.attendees.length * e.points : 0);
    }, 0);
  return fromEvents + ledger().filter((l) => l.cpId === cpId).reduce((s, l) => s + l.points, 0);
}

export function cpMonthStats(cpId: number, month: string) {
  const closed = closedInMonth(month);
  const participated = closed.filter((e) => {
    const r = recordOf(e.id, cpId);
    return counts(r) && r.attendees.length > 0;
  }).length;
  return { closedEvents: closed.length, participated, percent: pct(participated, closed.length) };
}

export function memberMonthStats(m: Member, month: string) {
  const since = m.joinedAt ? m.joinedAt.slice(0, 10) : "";
  const eligible = closedInMonth(month).filter((e) => e.date >= since);
  const attended = eligible.filter((e) =>
    records().some((r) => r.eventId === e.id && counts(r) && r.attendees.some((a) => a.userId === m.userId)),
  ).length;
  return { attended, eligible: eligible.length, percent: pct(attended, eligible.length) };
}

function pushLog(ev: DkpEvent, user: any, action: string, detail: string) {
  ev.log = [...(ev.log || []), { at: nowIso(), by: actorName(user), action, detail }];
  ev.updatedAt = nowIso();
}

async function audit(user: any, action: string, detail: string) {
  await createAuditLog({
    userId: user.viewAsById ?? user.id,
    action,
    detail: user.viewAsBy ? `[Como ${nameOf(user)}] ${detail}` : detail,
  });
}

function requireAdmin(u: any) {
  if (!isDkpAdmin(u)) throw new TRPCError({ code: "FORBIDDEN", message: "Solo un Admin DKP o el Super Admin puede hacer esto." });
}

/** Mientras el evento no esté cerrado, cada líder solo ve el registro de su CP. */
function canSeeRecord(u: any, ev: DkpEvent, cp: Cp) {
  return ev.status === "closed" || isDkpAdmin(u) || isLeader(u, cp);
}

export function hasDkpAccess(u: any) {
  return isDkpAdmin(u) || u?.legacyAccess === true || u?.cpAccess === true || commandParties().some((cp) => isLeader(u, cp));
}

/** Autoriza la descarga de una foto de evidencia (`/api/dkp-evidence/<archivo>`). */
export function canViewPhoto(user: any, file: string) {
  const u = freshUser(user);
  if (!hasDkpAccess(u)) return false;
  const r = records().find((x) => x.photoUrl === `${PHOTO_ROUTE}/${file}`);
  if (!r) return isDkpAdmin(u);
  const ev = events().find((e) => e.id === r.eventId);
  const cp = commandParties().find((c) => c.id === r.cpId);
  return !!ev && !!cp && canSeeRecord(u, ev, cp);
}

/** Solo el líder carga su registro (foto y checks) mientras está en borrador y el evento abierto. */
const isLeaderDraft = (u: any, ev: DkpEvent, cp: Cp, r: DkpRecord | undefined) =>
  isLeader(u, cp) && ev.status === "open" && (!r || r.status === "draft");

/** El Admin DKP no carga registros: solo corrige la asistencia de uno ya enviado (o tras el cierre). */
const canCorrectRecord = (u: any, ev: DkpEvent, r: DkpRecord | undefined) =>
  isDkpAdmin(u) && !!r && ev.status !== "cancelled" && (ev.status === "closed" || r.status !== "draft");

function canEditRecord(u: any, ev: DkpEvent, cp: Cp, r: DkpRecord | undefined) {
  if (ev.status === "cancelled") return false;
  return isLeaderDraft(u, ev, cp, r) || canCorrectRecord(u, ev, r);
}

function assertCanEdit(u: any, ev: DkpEvent, cp: Cp, r: DkpRecord | undefined) {
  if (canEditRecord(u, ev, cp, r)) return;
  if (ev.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "El evento está anulado." });
  if (!isLeader(u, cp)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: isDkpAdmin(u)
        ? "Solo el líder de esta CP carga la foto y la asistencia. Podrás corregirla cuando envíe su registro."
        : "Solo el líder de esta CP puede registrar su asistencia.",
    });
  }
  if (ev.status !== "open") throw new TRPCError({ code: "FORBIDDEN", message: "El evento ya está cerrado." });
  throw new TRPCError({ code: "FORBIDDEN", message: "Ya enviaste este registro; solo un Admin DKP puede corregirlo." });
}

function ensureRecord(ev: DkpEvent, cp: Cp): DkpRecord {
  let r = recordOf(ev.id, cp.id);
  if (!r) {
    r = {
      id: nextId(records()),
      eventId: ev.id,
      cpId: cp.id,
      cpName: cp.name,
      photoUrl: null,
      attendees: [],
      status: "draft",
      submittedBy: null,
      submittedAt: null,
      validatedBy: null,
      validatedAt: null,
      updatedAt: nowIso(),
      corrections: [],
    };
    records().push(r);
  }
  return r;
}

// Un registro ya enviado (o de un evento no abierto) solo lo cambia un admin, y queda constancia.
function needsReason(ev: DkpEvent, r: DkpRecord) {
  return ev.status !== "open" || r.status !== "draft";
}

function detectImage(buf: Buffer): { ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: ".jpg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: ".png" };
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { ext: ".webp" };
  return null;
}

const topBid = (a: DkpAuction): Bid | null => a.bids.reduce<Bid | null>((t, b) => (!t || b.amount > t.amount ? b : t), null);
const isLive = (a: DkpAuction, now = Date.now()) => a.status === "open" && Date.parse(a.endsAt) > now;

/** Puntos que la CP tiene comprometidos por ir ganando otras subastas abiertas. */
function committedPoints(cpId: number, exceptAuctionId?: number) {
  return auctions()
    .filter((a) => a.id !== exceptAuctionId && isLive(a))
    .reduce((s, a) => {
      const t = topBid(a);
      return s + (t && t.cpId === cpId ? t.amount : 0);
    }, 0);
}

const localDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DKP_TZ || "America/Santiago" }).format(new Date(iso));

/** Cierra las subastas vencidas: la puja más alta gana y se descuenta del saldo de su CP. */
export function settleAuctions(now = Date.now()) {
  let changed = false;
  for (const a of auctions()) {
    if (a.status !== "open" || Date.parse(a.endsAt) > now) continue;
    a.status = "closed";
    a.closedAt = new Date(now).toISOString();
    const top = topBid(a);
    if (top) {
      const entry: LedgerEntry = {
        id: nextId(ledger()),
        cpId: top.cpId,
        type: "purchase",
        points: -top.amount,
        itemName: a.itemName,
        comment: `Ganó la subasta #${a.id} (${a.itemType}) con ${top.amount} pt`,
        date: localDate(a.endsAt),
        createdBy: "Subasta",
        createdAt: a.closedAt,
        auctionId: a.id,
      };
      ledger().push(entry);
      Object.assign(a, { winnerCpId: top.cpId, winningBid: top.amount, ledgerId: entry.id });
    }
    changed = true;
  }
  if (changed) saveDbToDisk();
}

const auctionView = (a: DkpAuction) => {
  const top = topBid(a);
  return {
    id: a.id,
    itemName: a.itemName,
    itemType: a.itemType,
    notes: a.notes,
    endsAt: a.endsAt,
    status: a.status,
    createdBy: a.createdBy,
    createdAt: a.createdAt,
    closedAt: a.closedAt,
    cancelReason: a.cancelReason,
    topBid: top ? { cpId: top.cpId, cpName: top.cpName, amount: top.amount, by: top.by, at: top.at } : null,
    winner: a.winnerCpId != null ? { cpId: a.winnerCpId, cpName: a.bids.find((b) => b.cpId === a.winnerCpId)?.cpName ?? "CP", amount: a.winningBid ?? 0 } : null,
    bidCount: a.bids.length,
    bids: [...a.bids].sort((x, y) => y.amount - x.amount).slice(0, 15).map((b) => ({ id: b.id, cpName: b.cpName, amount: b.amount, by: b.by, at: b.at })),
  };
};

function findAuction(id: number) {
  const a = auctions().find((x) => x.id === id);
  if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "La subasta no existe." });
  return a;
}

const dkpProcedure = protectedProcedure.use(({ ctx, next }) => {
  const u = effectiveDkpUser(ctx.user, ctx.req?.headers?.[VIEW_AS_HEADER]);
  if (!hasDkpAccess(u)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a DKP." });
  }
  settleAuctions();
  return next({ ctx: { ...ctx, user: u } });
});

const monthInput = z.string().regex(/^\d{4}-\d{2}$/);
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const reasonInput = z.string().trim().min(3, "Escribe un motivo.").max(300);
const pointsInput = z.number().min(0).max(100).refine((v) => Number.isInteger(v * 2), "Usa enteros o medios puntos (0,5).");
const eventInput = z.object({
  typeId: z.number().int().nullish(),
  name: z.string().trim().min(2).max(80).optional(),
  date: dateInput,
  points: pointsInput.optional(),
});
const recordKey = z.object({ eventId: z.number().int(), cpId: z.number().int() });

const eventSummary = (ev: DkpEvent, u: any) => ({
  id: ev.id,
  name: ev.name,
  date: ev.date,
  points: ev.points,
  status: ev.status,
  records: commandParties().map((cp) => {
    const r = recordOf(ev.id, cp.id);
    const visible = canSeeRecord(u, ev, cp);
    return {
      cpId: cp.id,
      status: r?.status ?? null,
      attendeeCount: visible ? r?.attendees.length ?? 0 : 0,
      hasPhoto: visible && !!r?.photoUrl,
    };
  }),
});

export const dkpRouter = router({
  overview: dkpProcedure.input(z.object({ month: monthInput })).query(({ ctx, input }) => {
    const clans = new Map((dbInstance.clans || []).map((c: any) => [Number(c.id), String(c.name)]));
    const users = new Map((dbInstance.users || []).map((u: any) => [Number(u.id), nameOf(u)]));
    const cps = commandParties().map((cp) => ({
      id: cp.id,
      name: cp.name,
      clanName: cp.clanId != null ? clans.get(cp.clanId) ?? null : null,
      leaders: cp.leaderIds.map((id) => users.get(id)).filter(Boolean) as string[],
      memberCount: members(cp.id).length,
      balance: cpBalance(cp.id),
      isMine: isLeader(ctx.user, cp),
      ...cpMonthStats(cp.id, input.month),
    }));
    const list = events()
      .filter((e) => e.status === "open" || monthOf(e.date) === input.month)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map((ev) => eventSummary(ev, ctx.user));
    return { month: input.month, canAdmin: isDkpAdmin(ctx.user), viewingAs: ctx.user.viewAsBy ? nameOf(ctx.user) : null, maxAttendees: MAX_ATTENDEES, cps, events: list, eventTypes: activeTypes() };
  }),

  cpDetail: dkpProcedure.input(z.object({ cpId: z.number().int(), month: monthInput })).query(({ input }) => {
    const cp = findCp(input.cpId);
    type Row = {
      key: string;
      date: string;
      kind: "event" | "auction" | LedgerType;
      title: string;
      points: number;
      comment: string;
      eventId?: number;
      ledger?: { id: number; type: LedgerType; itemName: string | null; comment: string };
    };
    const rows: Row[] = closedInMonth(input.month).map((e) => {
      const r = recordOf(e.id, cp.id);
      const n = counts(r) ? r.attendees.length : 0;
      const last = r?.corrections.at(-1);
      const comment = !r || r.status === "draft"
        ? "Sin registro enviado"
        : `${n} de ${MAX_ATTENDEES} asistieron · ${e.points} pt por asistente${r.status === "validated" ? " · validado" : ""}${last ? ` · corregido por ${last.by}: ${last.reason}` : ""}`;
      return { key: `e${e.id}`, date: e.date, kind: "event", title: e.name, points: n * e.points, comment, eventId: e.id };
    });
    for (const l of ledger().filter((x) => x.cpId === cp.id && monthOf(x.date) === input.month)) {
      const label = l.auctionId ? "Subasta" : l.type === "purchase" ? "Compra" : l.type === "delivery" ? "Entrega" : "Ajuste";
      rows.push({
        key: `l${l.id}`,
        date: l.date,
        kind: l.auctionId ? "auction" : l.type,
        title: l.itemName ? `${label}: ${l.itemName}` : label,
        points: l.points,
        comment: `${l.comment} · registrado por ${l.createdBy}`,
        ledger: { id: l.id, type: l.type, itemName: l.itemName, comment: l.comment },
      });
    }
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
    const memberRows = members(cp.id)
      .map((m) => ({ userId: m.userId, name: m.name, className: m.className, ...memberMonthStats(m, input.month) }))
      .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.name.localeCompare(b.name, "es"));
    return {
      cp: { id: cp.id, name: cp.name },
      balance: cpBalance(cp.id),
      monthPoints: rows.reduce((s, r) => s + r.points, 0),
      history: rows,
      members: memberRows,
    };
  }),

  eventDetail: dkpProcedure.input(z.object({ eventId: z.number().int() })).query(({ ctx, input }) => {
    const ev = findEvent(input.eventId);
    const users = new Map((dbInstance.users || []).map((u: any) => [Number(u.id), nameOf(u)]));
    const all = commandParties();
    const visible = all.filter((cp) => canSeeRecord(ctx.user, ev, cp));
    const cps = visible.map((cp) => {
      const r = recordOf(ev.id, cp.id);
      const current = members(cp.id);
      const extra = (r?.attendees ?? []).filter((a) => !current.some((m) => m.userId === a.userId));
      return {
        cpId: cp.id,
        cpName: cp.name,
        leaders: cp.leaderIds.map((id) => users.get(id)).filter(Boolean) as string[],
        isMine: isLeader(ctx.user, cp),
        canEdit: canEditRecord(ctx.user, ev, cp, r),
        canPhoto: isLeaderDraft(ctx.user, ev, cp, r),
        members: [
          ...current.map((m) => ({ userId: m.userId, name: m.name, className: m.className, former: false })),
          ...extra.map((a) => ({ userId: a.userId, name: a.name, className: null, former: true })),
        ],
        record: r ?? null,
      };
    });
    const submitted = all.filter((cp) => {
      const r = recordOf(ev.id, cp.id);
      return !!r && r.status !== "draft";
    }).length;
    return {
      event: ev,
      canAdmin: isDkpAdmin(ctx.user),
      maxAttendees: MAX_ATTENDEES,
      closeWord: CLOSE_WORD,
      cps,
      totalCps: all.length,
      submittedCps: submitted,
      hiddenCps: all.length - visible.length,
    };
  }),

  eventTypes: dkpProcedure.query(() => activeTypes()),

  saveEventType: dkpProcedure
    .input(z.object({ id: z.number().int().optional(), name: z.string().trim().min(2).max(80), points: pointsInput }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const dup = eventTypes().find((t) => t.active && t.id !== input.id && t.name.toLowerCase() === input.name.toLowerCase());
      if (dup) throw new TRPCError({ code: "CONFLICT", message: `Ya existe el tipo "${dup.name}".` });
      if (input.id != null) {
        const t = findType(input.id, true);
        const before = `${t.name} (${t.points} pt)`;
        Object.assign(t, { name: input.name, points: input.points, updatedAt: nowIso() });
        saveDbToDisk();
        await audit(ctx.user, "DKP_TYPE_UPDATED", `Editó el tipo de evento DKP ${before} → ${t.name} (${t.points} pt).`);
        return { id: t.id };
      }
      const t: DkpEventType = { id: nextId(eventTypes()), name: input.name, points: input.points, active: true, createdAt: nowIso(), updatedAt: nowIso() };
      eventTypes().push(t);
      saveDbToDisk();
      await audit(ctx.user, "DKP_TYPE_CREATED", `Creó el tipo de evento DKP ${t.name} (${t.points} pt).`);
      return { id: t.id };
    }),

  archiveEventType: dkpProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const t = findType(input.id, true);
    t.active = false;
    t.updatedAt = nowIso();
    saveDbToDisk();
    await audit(ctx.user, "DKP_TYPE_ARCHIVED", `Quitó el tipo de evento DKP ${t.name}.`);
    return { ok: true };
  }),

  createEvent: dkpProcedure
    .input(eventInput)
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const t = input.typeId != null ? findType(input.typeId, true) : null;
      const name = t?.name ?? input.name;
      const points = t?.points ?? input.points;
      if (!name || points == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Elige el tipo de evento." });
      const ev: DkpEvent = {
        id: nextId(events()),
        typeId: t?.id ?? null,
        name,
        date: input.date,
        points,
        status: "open",
        createdBy: actorName(ctx.user),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        log: [],
      };
      pushLog(ev, ctx.user, "created", `Creó el evento (${points} pt por asistente).`);
      events().push(ev);
      saveDbToDisk();
      await audit(ctx.user, "DKP_EVENT_CREATED", `Creó el evento DKP "${ev.name}" del ${ev.date}.`);
      return { id: ev.id };
    }),

  updateEvent: dkpProcedure
    .input(eventInput.extend({ eventId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const ev = findEvent(input.eventId);
      const t = input.typeId != null ? eventTypes().find((x) => x.id === input.typeId && (x.active || x.id === ev.typeId)) : null;
      if (input.typeId != null && !t) throw new TRPCError({ code: "NOT_FOUND", message: "Ese tipo de evento no existe." });
      const keep = t && t.id === ev.typeId && !t.active;
      const name = keep ? ev.name : t?.name ?? input.name ?? ev.name;
      const points = keep ? ev.points : t?.points ?? input.points ?? ev.points;
      if (input.typeId !== undefined) ev.typeId = t?.id ?? null;
      const changes: string[] = [];
      if (ev.name !== name) changes.push(`nombre "${ev.name}" → "${name}"`);
      if (ev.date !== input.date) changes.push(`fecha ${ev.date} → ${input.date}`);
      if (ev.points !== points) changes.push(`puntos ${ev.points} → ${points}`);
      if (!changes.length) {
        saveDbToDisk();
        return { ok: true };
      }
      Object.assign(ev, { name, date: input.date, points });
      pushLog(ev, ctx.user, "updated", `Editó ${changes.join(", ")}.`);
      saveDbToDisk();
      await audit(ctx.user, "DKP_EVENT_UPDATED", `Editó el evento DKP "${ev.name}": ${changes.join(", ")}.`);
      return { ok: true };
    }),

  closeEvent: dkpProcedure
    .input(z.object({ eventId: z.number().int(), confirm: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const ev = findEvent(input.eventId);
      if (ev.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "El evento no está abierto." });
      if (input.confirm.trim().toUpperCase() !== CLOSE_WORD) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Escribe ${CLOSE_WORD} para confirmar.` });
      }
      const cps = commandParties();
      const counted = cps.filter((cp) => counts(recordOf(ev.id, cp.id)));
      ev.status = "closed";
      pushLog(ev, ctx.user, "closed", `Cerró el evento: ${counted.length} de ${cps.length} CP con registro; el resto queda en 0.`);
      saveDbToDisk();
      await audit(ctx.user, "DKP_EVENT_CLOSED", `Cerró el evento DKP "${ev.name}" del ${ev.date}.`);
      return { ok: true };
    }),

  reopenEvent: dkpProcedure
    .input(z.object({ eventId: z.number().int(), reason: reasonInput }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const ev = findEvent(input.eventId);
      if (ev.status === "open") throw new TRPCError({ code: "BAD_REQUEST", message: "El evento ya está abierto." });
      const from = ev.status === "closed" ? "cerrado" : "anulado";
      ev.status = "open";
      pushLog(ev, ctx.user, "reopened", `Reabrió el evento (estaba ${from}): ${input.reason}`);
      saveDbToDisk();
      await audit(ctx.user, "DKP_EVENT_REOPENED", `Reabrió el evento DKP "${ev.name}": ${input.reason}`);
      return { ok: true };
    }),

  cancelEvent: dkpProcedure
    .input(z.object({ eventId: z.number().int(), reason: reasonInput }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const ev = findEvent(input.eventId);
      if (ev.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "El evento ya está anulado." });
      ev.status = "cancelled";
      pushLog(ev, ctx.user, "cancelled", `Anuló el evento: ${input.reason}`);
      saveDbToDisk();
      await audit(ctx.user, "DKP_EVENT_CANCELLED", `Anuló el evento DKP "${ev.name}": ${input.reason}`);
      return { ok: true };
    }),

  deleteEvent: dkpProcedure.input(z.object({ eventId: z.number().int() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const ev = findEvent(input.eventId);
    if (ev.status !== "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se pueden eliminar eventos anulados." });
    for (const r of records().filter((x) => x.eventId === ev.id)) {
      if (!r.photoUrl) continue;
      try {
        fs.unlinkSync(path.join(photoDir(), path.basename(r.photoUrl)));
      } catch {
        // la foto ya no existe
      }
    }
    dbInstance.dkpRecords = records().filter((x) => x.eventId !== ev.id);
    dbInstance.dkpEvents = events().filter((x) => x.id !== ev.id);
    saveDbToDisk();
    await audit(ctx.user, "DKP_EVENT_DELETED", `Eliminó el evento DKP anulado "${ev.name}" del ${ev.date}.`);
    return { ok: true };
  }),

  setPhoto: dkpProcedure
    .input(recordKey.extend({ dataBase64: z.string().min(10).max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8) }))
    .mutation(async ({ ctx, input }) => {
      const ev = findEvent(input.eventId);
      const cp = findCp(input.cpId);
      const existing = recordOf(ev.id, cp.id);
      if (!isLeaderDraft(ctx.user, ev, cp, existing)) {
        assertCanEdit(ctx.user, ev, cp, existing);
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo el líder de esta CP sube la foto de evidencia, mientras su registro no esté enviado." });
      }
      const buf = Buffer.from(input.dataBase64, "base64");
      if (buf.length > MAX_PHOTO_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "La foto pesa más de 8 MB." });
      const img = detectImage(buf);
      if (!img) throw new TRPCError({ code: "BAD_REQUEST", message: "El archivo debe ser una foto JPG, PNG o WebP." });
      const dir = photoDir();
      fs.mkdirSync(dir, { recursive: true });
      const file = `${ev.id}-${cp.id}-${Date.now()}-${randomBytes(4).toString("hex")}${img.ext}`;
      fs.writeFileSync(path.join(dir, file), buf);
      const r = ensureRecord(ev, cp);
      const hadPhoto = !!r.photoUrl;
      r.photoUrl = `${PHOTO_ROUTE}/${file}`;
      r.updatedAt = nowIso();
      pushLog(ev, ctx.user, "photo", `${hadPhoto ? "Cambió" : "Subió"} la foto de ${cp.name}.`);
      saveDbToDisk();
      return { photoUrl: r.photoUrl };
    }),

  saveAttendance: dkpProcedure
    .input(recordKey.extend({ userIds: z.array(z.number().int()).max(MAX_ATTENDEES, `Máximo ${MAX_ATTENDEES} asistentes.`), reason: reasonInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const ev = findEvent(input.eventId);
      const cp = findCp(input.cpId);
      const existing = recordOf(ev.id, cp.id);
      assertCanEdit(ctx.user, ev, cp, existing);
      const ids = Array.from(new Set(input.userIds));
      const allowed = new Map<number, string>(members(cp.id).map((m) => [m.userId, m.name]));
      for (const a of existing?.attendees ?? []) if (!allowed.has(a.userId)) allowed.set(a.userId, a.name);
      const unknown = ids.filter((id) => !allowed.has(id));
      if (unknown.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Solo puedes marcar a miembros confirmados de la CP." });
      const correcting = !!existing && needsReason(ev, existing);
      if (correcting && !input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "Escribe el motivo de la corrección." });
      const r = ensureRecord(ev, cp);
      const before = r.attendees.map((a) => a.name);
      r.attendees = ids.map((id) => ({ userId: id, name: allowed.get(id)! }));
      r.updatedAt = nowIso();
      if (correcting) {
        const after = r.attendees.map((a) => a.name);
        r.corrections.push({ at: nowIso(), by: actorName(ctx.user), reason: input.reason!, before, after });
        pushLog(ev, ctx.user, "corrected", `Corrigió la asistencia de ${cp.name} (${before.length} → ${after.length}): ${input.reason}`);
        await audit(ctx.user, "DKP_RECORD_CORRECTED", `Corrigió la asistencia de ${cp.name} en "${ev.name}" (${before.length} → ${after.length}): ${input.reason}`);
      }
      saveDbToDisk();
      return { ok: true, count: r.attendees.length };
    }),

  submitRecord: dkpProcedure.input(recordKey).mutation(async ({ ctx, input }) => {
    const ev = findEvent(input.eventId);
    const cp = findCp(input.cpId);
    const r = recordOf(ev.id, cp.id);
    if (ev.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "El evento ya está cerrado." });
    if (r && r.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Este registro ya fue enviado." });
    assertCanEdit(ctx.user, ev, cp, r);
    if (!r?.photoUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Sube la foto de evidencia antes de enviar." });
    r.status = "submitted";
    r.submittedBy = actorName(ctx.user);
    r.submittedAt = nowIso();
    r.updatedAt = nowIso();
    pushLog(ev, ctx.user, "submitted", `Envió el registro de ${cp.name}: ${r.attendees.length} asistentes.`);
    saveDbToDisk();
    await audit(ctx.user, "DKP_RECORD_SUBMITTED", `Envió la asistencia de ${cp.name} en "${ev.name}" (${r.attendees.length} asistentes).`);
    return { ok: true };
  }),

  validateRecord: dkpProcedure.input(recordKey).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const ev = findEvent(input.eventId);
    const cp = findCp(input.cpId);
    const r = recordOf(ev.id, cp.id);
    if (!r || r.status === "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "La CP todavía no envía su registro." });
    r.status = "validated";
    r.validatedBy = actorName(ctx.user);
    r.validatedAt = nowIso();
    r.updatedAt = nowIso();
    pushLog(ev, ctx.user, "validated", `Validó el registro de ${cp.name}.`);
    saveDbToDisk();
    await audit(ctx.user, "DKP_RECORD_VALIDATED", `Validó la asistencia de ${cp.name} en "${ev.name}".`);
    return { ok: true };
  }),

  reopenRecord: dkpProcedure.input(recordKey.extend({ reason: reasonInput })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const ev = findEvent(input.eventId);
    const cp = findCp(input.cpId);
    const r = recordOf(ev.id, cp.id);
    if (ev.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "Reabre primero el evento." });
    if (!r || r.status === "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "El registro ya está abierto para el líder." });
    Object.assign(r, { status: "draft", submittedBy: null, submittedAt: null, validatedBy: null, validatedAt: null, updatedAt: nowIso() });
    pushLog(ev, ctx.user, "record_reopened", `Devolvió el registro de ${cp.name} al líder: ${input.reason}`);
    saveDbToDisk();
    await audit(ctx.user, "DKP_RECORD_REOPENED", `Devolvió la asistencia de ${cp.name} en "${ev.name}" al líder: ${input.reason}`);
    return { ok: true };
  }),

  addLedger: dkpProcedure
    .input(z.object({
      cpId: z.number().int(),
      type: z.enum(["purchase", "delivery", "adjust"]),
      points: z.number().int().min(-100000).max(100000),
      itemName: z.string().trim().max(120).optional(),
      comment: z.string().trim().min(2, "Escribe un comentario.").max(300),
      date: dateInput,
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const cp = findCp(input.cpId);
      let points = input.points;
      if (input.type !== "adjust") {
        if (!input.itemName) throw new TRPCError({ code: "BAD_REQUEST", message: "Indica el ítem." });
        if (points < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Los puntos deben ser positivos." });
        const balance = cpBalance(cp.id);
        if (points > balance) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Saldo insuficiente: ${cp.name} tiene ${balance} pt.` });
        }
        points = -points;
      } else if (points === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El ajuste no puede ser 0." });
      }
      const entry: LedgerEntry = {
        id: nextId(ledger()),
        cpId: cp.id,
        type: input.type,
        points,
        itemName: input.itemName || null,
        comment: input.comment,
        date: input.date,
        createdBy: actorName(ctx.user),
        createdAt: nowIso(),
      };
      ledger().push(entry);
      saveDbToDisk();
      await audit(ctx.user, "DKP_LEDGER_ADDED", `DKP ${cp.name}: ${points > 0 ? "+" : ""}${points} pt (${input.type}${entry.itemName ? `: ${entry.itemName}` : ""}) — ${input.comment}`);
      return { id: entry.id, balance: cpBalance(cp.id) };
    }),

  deleteLedger: dkpProcedure
    .input(z.object({ id: z.number().int(), reason: reasonInput }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const entry = ledger().find((l) => l.id === input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "El movimiento no existe." });
      dbInstance.dkpLedger = ledger().filter((l) => l.id !== input.id);
      saveDbToDisk();
      await audit(ctx.user, "DKP_LEDGER_DELETED", `Eliminó el movimiento DKP de ${entry.points} pt (${entry.itemName || entry.type}): ${input.reason}`);
      return { ok: true };
    }),
  updateLedger: dkpProcedure
    .input(z.object({
      id: z.number().int(),
      points: z.number().min(-100000).max(100000).refine((v) => Number.isInteger(v * 2), "Usa enteros o medios puntos (0,5)."),
      itemName: z.string().trim().max(120).optional(),
      comment: z.string().trim().min(2, "Escribe un comentario.").max(300),
      date: dateInput,
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const entry = ledger().find((l) => l.id === input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "El movimiento no existe." });
      const cp = findCp(entry.cpId);
      let points = input.points;
      if (entry.type !== "adjust") {
        if (!input.itemName) throw new TRPCError({ code: "BAD_REQUEST", message: "Indica el ítem." });
        if (points <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Los puntos deben ser positivos." });
        const available = cpBalance(cp.id) - entry.points;
        if (points > available) throw new TRPCError({ code: "BAD_REQUEST", message: `Saldo insuficiente: ${cp.name} tendría ${available} pt.` });
        points = -points;
      } else if (points === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El ajuste no puede ser 0." });
      }
      const before = `${entry.points} pt${entry.itemName ? ` (${entry.itemName})` : ""}`;
      Object.assign(entry, { points, itemName: input.itemName || null, comment: input.comment, date: input.date, updatedBy: actorName(ctx.user), updatedAt: nowIso() });
      saveDbToDisk();
      await audit(ctx.user, "DKP_LEDGER_UPDATED", `Editó el movimiento DKP de ${cp.name}: ${before} → ${points} pt${entry.itemName ? ` (${entry.itemName})` : ""}.`);
      return { ok: true, balance: cpBalance(cp.id) };
    }),

  auctions: dkpProcedure.query(({ ctx }) => {
    const list = [...auctions()].sort((a, b) =>
      a.status === "open" && b.status === "open" ? a.endsAt.localeCompare(b.endsAt) : (b.closedAt || b.createdAt).localeCompare(a.closedAt || a.createdAt),
    );
    const myCps = commandParties()
      .filter((cp) => isLeader(ctx.user, cp))
      .map((cp) => {
        const balance = cpBalance(cp.id);
        const committed = committedPoints(cp.id);
        return { id: cp.id, name: cp.name, balance, committed, available: balance - committed };
      });
    return {
      now: nowIso(),
      canAdmin: isDkpAdmin(ctx.user),
      itemTypes: AUCTION_ITEM_TYPES,
      myCps,
      open: list.filter((a) => a.status === "open").map(auctionView),
      finished: list.filter((a) => a.status !== "open").slice(0, 200).map(auctionView),
    };
  }),

  createAuction: dkpProcedure
    .input(z.object({
      itemName: z.string().trim().min(2, "Escribe el nombre del ítem.").max(120),
      itemType: z.enum(AUCTION_ITEM_TYPES),
      notes: z.string().trim().max(300).optional(),
      endsAt: z.string().datetime({ offset: true }),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const ends = Date.parse(input.endsAt);
      const now = Date.now();
      if (ends - now < MIN_AUCTION_MS) throw new TRPCError({ code: "BAD_REQUEST", message: "La subasta debe durar al menos 1 minuto." });
      if (ends - now > MAX_AUCTION_MS) throw new TRPCError({ code: "BAD_REQUEST", message: "La subasta puede durar como máximo 30 días." });
      const a: DkpAuction = {
        id: nextId(auctions()),
        itemName: input.itemName,
        itemType: input.itemType,
        notes: input.notes || null,
        endsAt: new Date(ends).toISOString(),
        status: "open",
        bids: [],
        winnerCpId: null,
        winningBid: null,
        ledgerId: null,
        cancelReason: null,
        createdBy: actorName(ctx.user),
        createdAt: nowIso(),
        closedAt: null,
      };
      auctions().push(a);
      saveDbToDisk();
      await audit(ctx.user, "DKP_AUCTION_CREATED", `Abrió la subasta DKP #${a.id}: ${a.itemName} (${a.itemType}), cierra ${a.endsAt}.`);
      return { id: a.id };
    }),

  placeBid: dkpProcedure
    .input(z.object({ auctionId: z.number().int(), cpId: z.number().int(), amount: z.number().int("La puja debe ser un número entero.").min(1, "La puja mínima es 1 punto.") }))
    .mutation(async ({ ctx, input }) => {
      const a = findAuction(input.auctionId);
      const cp = findCp(input.cpId);
      if (!isLeader(ctx.user, cp)) throw new TRPCError({ code: "FORBIDDEN", message: "Solo el líder de la CP puede pujar con sus puntos." });
      if (!isLive(a)) throw new TRPCError({ code: "BAD_REQUEST", message: "La subasta ya cerró." });
      const top = topBid(a);
      if (top && input.amount <= top.amount) throw new TRPCError({ code: "BAD_REQUEST", message: `La puja debe superar ${top.amount} pt.` });
      const available = cpBalance(cp.id) - committedPoints(cp.id, a.id);
      if (input.amount > available) throw new TRPCError({ code: "BAD_REQUEST", message: `Saldo insuficiente: ${cp.name} tiene ${available} pt disponibles.` });
      a.bids.push({ id: nextId(a.bids), cpId: cp.id, cpName: cp.name, amount: input.amount, by: actorName(ctx.user), byUserId: Number(ctx.user.id), at: nowIso() });
      saveDbToDisk();
      await audit(ctx.user, "DKP_AUCTION_BID", `Pujó ${input.amount} pt por ${cp.name} en la subasta #${a.id} (${a.itemName}).`);
      return { ok: true };
    }),

  cancelAuction: dkpProcedure.input(z.object({ id: z.number().int(), reason: reasonInput })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const a = findAuction(input.id);
    if (a.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "La subasta ya cerró." });
    Object.assign(a, { status: "cancelled", cancelReason: input.reason, closedAt: nowIso() });
    saveDbToDisk();
    await audit(ctx.user, "DKP_AUCTION_CANCELLED", `Anuló la subasta DKP #${a.id} (${a.itemName}): ${input.reason}`);
    return { ok: true };
  }),

  deleteAuction: dkpProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const a = findAuction(input.id);
    if (a.status !== "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se pueden eliminar subastas anuladas." });
    dbInstance.dkpAuctions = auctions().filter((x) => x.id !== a.id);
    saveDbToDisk();
    await audit(ctx.user, "DKP_AUCTION_DELETED", `Eliminó la subasta DKP anulada #${a.id} (${a.itemName}).`);
    return { ok: true };
  }),
});
