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
type DkpEvent = {
  id: number;
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
};

const events = (): DkpEvent[] => (dbInstance.dkpEvents ??= []);
const records = (): DkpRecord[] => (dbInstance.dkpRecords ??= []);
const ledger = (): LedgerEntry[] => (dbInstance.dkpLedger ??= []);

const nowIso = () => new Date().toISOString();
const monthOf = (date: string) => date.slice(0, 7);
const nextId = (list: Array<{ id: number }>) => list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
const nameOf = (u: any) => String(u?.characterName || u?.name || u?.email || "Usuario");
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : null);

const freshUser = (u: any) => (dbInstance.users || []).find((x: any) => Number(x.id) === Number(u?.id)) ?? u;
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
  ev.log = [...(ev.log || []), { at: nowIso(), by: nameOf(user), action, detail }];
  ev.updatedAt = nowIso();
}

async function audit(user: any, action: string, detail: string) {
  await createAuditLog({ userId: user.id, action, detail });
}

function requireAdmin(u: any) {
  if (!isDkpAdmin(u)) throw new TRPCError({ code: "FORBIDDEN", message: "Solo un Admin DKP o el Super Admin puede hacer esto." });
}

function canEditRecord(u: any, ev: DkpEvent, cp: Cp, r: DkpRecord | undefined) {
  if (ev.status === "cancelled") return false;
  if (isDkpAdmin(u)) return true;
  return isLeader(u, cp) && ev.status === "open" && (!r || r.status === "draft");
}

function assertCanEdit(u: any, ev: DkpEvent, cp: Cp, r: DkpRecord | undefined) {
  if (canEditRecord(u, ev, cp, r)) return;
  if (ev.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "El evento está anulado." });
  if (!isLeader(u, cp)) throw new TRPCError({ code: "FORBIDDEN", message: "Solo el líder de esta CP puede registrar su asistencia." });
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

const dkpProcedure = protectedProcedure.use(({ ctx, next }) => {
  const u = freshUser(ctx.user);
  const leader = commandParties().some((cp) => isLeader(u, cp));
  if (!isDkpAdmin(u) && u?.legacyAccess !== true && u?.cpAccess !== true && !leader) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a DKP." });
  }
  return next({ ctx: { ...ctx, user: u } });
});

const monthInput = z.string().regex(/^\d{4}-\d{2}$/);
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const reasonInput = z.string().trim().min(3, "Escribe un motivo.").max(300);
const recordKey = z.object({ eventId: z.number().int(), cpId: z.number().int() });

const eventSummary = (ev: DkpEvent) => ({
  id: ev.id,
  name: ev.name,
  date: ev.date,
  points: ev.points,
  status: ev.status,
  records: commandParties().map((cp) => {
    const r = recordOf(ev.id, cp.id);
    return { cpId: cp.id, status: r?.status ?? null, attendeeCount: r?.attendees.length ?? 0, hasPhoto: !!r?.photoUrl };
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
      .map(eventSummary);
    return { month: input.month, canAdmin: isDkpAdmin(ctx.user), maxAttendees: MAX_ATTENDEES, cps, events: list };
  }),

  cpDetail: dkpProcedure.input(z.object({ cpId: z.number().int(), month: monthInput })).query(({ input }) => {
    const cp = findCp(input.cpId);
    type Row = { key: string; date: string; kind: "event" | LedgerType; title: string; points: number; comment: string; eventId?: number; ledgerId?: number };
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
      const label = l.type === "purchase" ? "Compra" : l.type === "delivery" ? "Entrega" : "Ajuste";
      rows.push({
        key: `l${l.id}`,
        date: l.date,
        kind: l.type,
        title: l.itemName ? `${label}: ${l.itemName}` : label,
        points: l.points,
        comment: `${l.comment} · registrado por ${l.createdBy}`,
        ledgerId: l.id,
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
    const cps = commandParties().map((cp) => {
      const r = recordOf(ev.id, cp.id);
      const current = members(cp.id);
      const extra = (r?.attendees ?? []).filter((a) => !current.some((m) => m.userId === a.userId));
      return {
        cpId: cp.id,
        cpName: cp.name,
        leaders: cp.leaderIds.map((id) => users.get(id)).filter(Boolean) as string[],
        isMine: isLeader(ctx.user, cp),
        canEdit: canEditRecord(ctx.user, ev, cp, r),
        members: [
          ...current.map((m) => ({ userId: m.userId, name: m.name, className: m.className, former: false })),
          ...extra.map((a) => ({ userId: a.userId, name: a.name, className: null, former: true })),
        ],
        record: r ?? null,
      };
    });
    return { event: ev, canAdmin: isDkpAdmin(ctx.user), maxAttendees: MAX_ATTENDEES, closeWord: CLOSE_WORD, cps };
  }),

  createEvent: dkpProcedure
    .input(z.object({ name: z.string().trim().min(2).max(80), date: dateInput, points: z.number().int().min(0).max(100) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const ev: DkpEvent = {
        id: nextId(events()),
        name: input.name,
        date: input.date,
        points: input.points,
        status: "open",
        createdBy: nameOf(ctx.user),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        log: [],
      };
      pushLog(ev, ctx.user, "created", `Creó el evento (${input.points} pt por asistente).`);
      events().push(ev);
      saveDbToDisk();
      await audit(ctx.user, "DKP_EVENT_CREATED", `Creó el evento DKP "${ev.name}" del ${ev.date}.`);
      return { id: ev.id };
    }),

  updateEvent: dkpProcedure
    .input(z.object({ eventId: z.number().int(), name: z.string().trim().min(2).max(80), date: dateInput, points: z.number().int().min(0).max(100) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const ev = findEvent(input.eventId);
      const changes: string[] = [];
      if (ev.name !== input.name) changes.push(`nombre "${ev.name}" → "${input.name}"`);
      if (ev.date !== input.date) changes.push(`fecha ${ev.date} → ${input.date}`);
      if (ev.points !== input.points) changes.push(`puntos ${ev.points} → ${input.points}`);
      if (!changes.length) return { ok: true };
      Object.assign(ev, { name: input.name, date: input.date, points: input.points });
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

  setPhoto: dkpProcedure
    .input(recordKey.extend({ dataBase64: z.string().min(10).max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8), reason: reasonInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const ev = findEvent(input.eventId);
      const cp = findCp(input.cpId);
      const existing = recordOf(ev.id, cp.id);
      assertCanEdit(ctx.user, ev, cp, existing);
      if (existing && needsReason(ev, existing) && !input.reason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Escribe el motivo de la corrección." });
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
      if (needsReason(ev, r) && input.reason) {
        r.corrections.push({ at: nowIso(), by: nameOf(ctx.user), reason: `Cambió la foto: ${input.reason}`, before: [], after: [] });
      }
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
        r.corrections.push({ at: nowIso(), by: nameOf(ctx.user), reason: input.reason!, before, after });
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
    r.submittedBy = nameOf(ctx.user);
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
    r.validatedBy = nameOf(ctx.user);
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
        createdBy: nameOf(ctx.user),
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
});
