/**
 * Warehouse Clan — bodega del clan para materiales de crafteo.
 *
 * Flujo:
 *  1. Mapper/Admin/SA registra materiales → van a warehouseIncoming (EN_REGISTRO)
 *  2. Super Admin confirma → se agrupan con warehouseItems existentes (mismo nombre)
 *  3. Admin/SA pueden descontar stock (withdraw)
 *  4. SA puede crear recetas de crafteo (persistentes) y proyectos
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import {
  dbInstance,
  saveDbToDisk,
  createAuditLog,
  getAllUsers,
  getWarehouseClans,
  getWarehouseClanById,
  createWarehouseClan,
  updateWarehouseClan,
  deleteWarehouseClan,
  getWarehouseCPs,
  getWarehouseCPsByClan,
  getWarehouseCPById,
  createWarehouseCP,
  updateWarehouseCP,
  deleteWarehouseCP,
  getWarehouseCPMembers,
  addWarehouseCPMember,
  removeWarehouseCPMember,
  // Raid data (for sync feature)
  getClans as getRaidClans,
  getCommandParties as getRaidCommandParties,
  getUsersByCp as getRaidUsersByCp,
  getSecondaryCharactersByUsers,
} from '../db';

const nowIso = () => new Date().toISOString();
const randId = () => Math.floor(Math.random() * 900_000_000) + 100_000_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve the CP(s) this user leads (checks both raid and warehouse CPs). Returns array of cpIds. */
async function getCpIdsLedByUser(userId: number): Promise<number[]> {
  const [raidCps, warehouseCps] = await Promise.all([getRaidCommandParties(), getWarehouseCPs()]);
  const allCps = [...raidCps, ...warehouseCps];
  const seen = new Set<number>();
  return allCps
    .filter((cp: any) => {
      if (Number(cp.leaderId) === userId) return true;
      if (Array.isArray(cp.leaderIds) && cp.leaderIds.map(Number).includes(userId)) return true;
      return false;
    })
    .map((cp: any) => Number(cp.id))
    .filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
}

/** Check if user can WRITE to a given CP's warehouse (SA or CP leader). */
async function canWriteCp(role: string, userId: number, cpId: number): Promise<boolean> {
  if (role === 'super_admin') return true;
  const ledCps = await getCpIdsLedByUser(userId);
  return ledCps.includes(cpId);
}

// ─── Warehouse Items ────────────────────────────────────────────────────────

export const warehouseRouter = router({
  // List raid CPs (unified — all users can see)
  listCps: protectedProcedure.query(async () => {
    const allCps = await getRaidCommandParties();
    const allUsers = await getAllUsers();
    return allCps.map((cp: any) => {
      const leader = cp.leaderId
        ? allUsers.find((u: any) => Number(u.id) === Number(cp.leaderId))
        : null;
      const ids: number[] = Array.isArray(cp.leaderIds) ? cp.leaderIds.map(Number) : (cp.leaderId ? [Number(cp.leaderId)] : []);
      const names = ids.map((lid: number) => {
        const u = allUsers.find((u: any) => Number(u.id) === lid);
        return u?.characterName || u?.name || null;
      }).filter(Boolean);
      return {
        id: Number(cp.id),
        name: cp.name,
        clanId: Number(cp.clanId),
        leaderId: cp.leaderId ? Number(cp.leaderId) : null,
        leaderIds: ids,
        leaderName: leader?.characterName || leader?.name || null,
        leaderNames: names,
      };
    });
  }),

  // List all character names (primary + secondary) for assignment
  listCharacters: protectedProcedure.query(() => {
    const db = dbInstance;
    const chars: { name: string; userId: number; type: string }[] = [];
    // Primary characters from users
    for (const u of (db.users || [])) {
      if (u.characterName) {
        chars.push({ name: u.characterName, userId: Number(u.id), type: 'principal' });
      }
    }
    // Secondary characters
    for (const sc of (db.secondaryCharacters || [])) {
      if (sc.name) {
        chars.push({ name: sc.name, userId: Number(sc.userId), type: 'secundario' });
      }
    }
    return chars;
  }),

  // List warehouse history (withdrawals, deletions) for an item or all
  listHistory: protectedProcedure
    .input(z.object({ itemId: z.number().optional(), cpId: z.number().optional() }).optional())
    .query(({ input }) => {
      const db = dbInstance;
      if (!db.warehouseHistory) db.warehouseHistory = [];
      let history = (db.warehouseHistory as any[]).slice();
      if (input?.itemId) history = history.filter((h: any) => Number(h.itemId) === Number(input.itemId));
      if (input?.cpId) history = history.filter((h: any) => Number(h.cpId) === Number(input.cpId));
      return history.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }),

  // Delete a history entry (SA only, permanent, no trace)
  deleteHistory: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input, ctx }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede eliminar historial.' });
      const db = dbInstance;
      if (!db.warehouseHistory) db.warehouseHistory = [];
      const idx = db.warehouseHistory.findIndex((h: any) => Number(h.id) === Number(input.id));
      if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entrada no encontrada.' });
      db.warehouseHistory.splice(idx, 1);
      saveDbToDisk();
      return { success: true };
    }),

  // Get current user's CP memberships
  myCps: protectedProcedure.query(async ({ ctx }) => {
    const userId = Number(ctx.user?.id || 0);
    const allCps = await getRaidCommandParties();
    const allUsers = await getAllUsers();
    const user = allUsers.find((u: any) => Number(u.id) === userId);
    const myCpId = user?.raidCpId ? Number(user.raidCpId) : null;
    const ledCps = allCps.filter((cp: any) => Number(cp.leaderId) === userId).map((cp: any) => Number(cp.id));
    return { memberCpId: myCpId, leaderCpIds: ledCps };
  }),

  // Get warehouse settings
  getSettings: protectedProcedure.query(() => {
    const db = dbInstance;
    if (!db.warehouseSettings) db.warehouseSettings = { crossCpVisibility: true, crossCpObjectivesVisibility: false };
    if ((db.warehouseSettings as any).crossCpObjectivesVisibility === undefined) (db.warehouseSettings as any).crossCpObjectivesVisibility = false;
    return db.warehouseSettings as { crossCpVisibility: boolean; crossCpObjectivesVisibility: boolean };
  }),

  // Update warehouse settings (SA only)
  updateSettings: protectedProcedure
    .input(z.object({ crossCpVisibility: z.boolean().optional(), crossCpObjectivesVisibility: z.boolean().optional() }))
    .mutation(({ input, ctx }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema.' });
      const db = dbInstance;
      if (!db.warehouseSettings) db.warehouseSettings = { crossCpVisibility: true, crossCpObjectivesVisibility: false };
      if (input.crossCpVisibility !== undefined) (db.warehouseSettings as any).crossCpVisibility = input.crossCpVisibility;
      if (input.crossCpObjectivesVisibility !== undefined) (db.warehouseSettings as any).crossCpObjectivesVisibility = input.crossCpObjectivesVisibility;
      saveDbToDisk();
      return db.warehouseSettings;
    }),

  // List members of a specific CP (for project assignment filtering)
  listCpMembers: protectedProcedure
    .input(z.object({ cpId: z.number() }))
    .query(async ({ input }) => {
      const members = await getRaidUsersByCp(input.cpId);
      const chars: { name: string; userId: number; type: string }[] = [];
      for (const u of members) {
        if (u.characterName) {
          chars.push({ name: u.characterName, userId: Number(u.id), type: 'principal' });
        }
      }
      // Also get secondary characters for these users
      const userIds = members.map((u: any) => Number(u.id));
      const db = dbInstance;
      for (const sc of (db.secondaryCharacters || [])) {
        if (sc.name && userIds.includes(Number(sc.userId))) {
          chars.push({ name: sc.name, userId: Number(sc.userId), type: 'secundario' });
        }
      }
      return chars;
    }),

  // List confirmed warehouse items (optionally filtered by cpId)
  list: protectedProcedure
    .input(z.object({ cpId: z.number().optional() }).optional())
    .query(({ input }) => {
      const db = dbInstance;
      const items = (db.warehouseItems || []).slice();
      if (input?.cpId) return items.filter((i: any) => Number(i.cpId) === Number(input.cpId));
      return items;
    }),

  // List incoming (pending confirmation), optionally filtered by cpId
  listIncoming: protectedProcedure
    .input(z.object({ cpId: z.number().optional() }).optional())
    .query(({ input }) => {
      const db = dbInstance;
      const items = (db.warehouseIncoming || []).slice();
      if (input?.cpId) return items.filter((i: any) => Number(i.cpId) === Number(input.cpId));
      return items;
    }),

  // Register new incoming material (SA, CP leader for their own CP, admin, mapper)
  register: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      category: z.string().min(1),
      quantity: z.number().int().min(1),
      imageUrl: z.string().optional(),
      cpId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      const userId = Number(ctx.user?.id || 0);
      // CP leader can register for their own CP
      if (input.cpId) {
        const allowed = await canWriteCp(role, userId, input.cpId);
        if (!allowed && role !== 'admin' && role !== 'mapper') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos para registrar en esta CP.' });
        }
      } else if (role !== 'super_admin' && role !== 'admin' && role !== 'mapper') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo mapper, admin o super admin pueden registrar.' });
      }
      const db = dbInstance;
      if (!db.warehouseIncoming) db.warehouseIncoming = [];
      const entry: any = {
        id: randId(),
        name: input.name.trim(),
        nameLower: input.name.trim().toLowerCase(),
        category: input.category,
        quantity: input.quantity,
        imageUrl: input.imageUrl || null,
        cpId: input.cpId || null,
        status: 'EN_REGISTRO',
        registeredBy: ctx.user?.characterName || ctx.user?.name || 'Sistema',
        registeredById: ctx.user?.id || 0,
        createdAt: nowIso(),
      };
      db.warehouseIncoming.push(entry);
      saveDbToDisk();
      await createAuditLog({
        userId: Number(ctx.user?.id || 0),
        action: 'WAREHOUSE_REGISTER',
        actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
        actorRole: String(ctx.user?.role || 'USER'),
        detail: `Registró ${input.quantity}× ${input.name} en bodega (pendiente confirmación).`,
      });
      return { success: true, entry };
    }),

  // Confirm incoming → merge into warehouse (SA or CP leader of that CP)
  confirm: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      const userId = Number(ctx.user?.id || 0);
      const db = dbInstance;
      if (!db.warehouseIncoming) db.warehouseIncoming = [];
      if (!db.warehouseItems) db.warehouseItems = [];
      const idx = db.warehouseIncoming.findIndex((e: any) => Number(e.id) === Number(input.id));
      if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro no encontrado.' });
      const incoming = db.warehouseIncoming[idx];

      // Permission check: SA can confirm anything; CP leader can confirm their CP's items
      if (incoming.cpId) {
        const allowed = await canWriteCp(role, userId, Number(incoming.cpId));
        if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos para confirmar en esta CP.' });
      } else if (role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede confirmar.' });
      }

      // Find existing warehouse item with same name AND same cpId (case-insensitive)
      const nameLower = String(incoming.name || '').trim().toLowerCase();
      const incomingCpId = incoming.cpId || null;
      const existing = db.warehouseItems.find((w: any) =>
        String(w.nameLower || w.name || '').toLowerCase() === nameLower &&
        (w.cpId || null) == incomingCpId
      );

      if (existing) {
        // Merge: add quantity
        existing.quantity = (Number(existing.quantity) || 0) + (Number(incoming.quantity) || 0);
        existing.updatedAt = nowIso();
        // Update image if incoming has one and existing doesn't
        if (incoming.imageUrl && !existing.imageUrl) {
          existing.imageUrl = incoming.imageUrl;
        }
        // Update category if incoming has one
        if (incoming.category) {
          existing.category = incoming.category;
        }
      } else {
        // Create new warehouse item
        db.warehouseItems.push({
          id: randId(),
          name: incoming.name,
          nameLower,
          category: incoming.category,
          quantity: Number(incoming.quantity) || 0,
          imageUrl: incoming.imageUrl || null,
          cpId: incomingCpId,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }

      // Remove from incoming
      db.warehouseIncoming.splice(idx, 1);
      saveDbToDisk();

      await createAuditLog({
        userId: Number(ctx.user?.id || 0),
        action: 'WAREHOUSE_CONFIRM',
        actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
        actorRole: String(ctx.user?.role || 'USER'),
        detail: `Confirmó ${incoming.quantity}× ${incoming.name} → bodega del clan${existing ? ' (agrupado con existente)' : ''}.`,
      });
      return { success: true };
    }),

  // Reject/delete incoming (SA only)
  deleteIncoming: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      if (role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede eliminar.' });
      }
      const db = dbInstance;
      if (!db.warehouseIncoming) return { success: true };
      const idx = db.warehouseIncoming.findIndex((e: any) => Number(e.id) === Number(input.id));
      if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND' });
      const removed = db.warehouseIncoming.splice(idx, 1)[0];
      saveDbToDisk();
      await createAuditLog({
        userId: Number(ctx.user?.id || 0),
        action: 'WAREHOUSE_DELETE_INCOMING',
        actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
        actorRole: String(ctx.user?.role || 'USER'),
        detail: `Rechazó registro pendiente: ${removed.quantity}× ${removed.name}.`,
      });
      return { success: true };
    }),

  // Withdraw stock (SA, admin, or CP leader of the item's CP)
  withdraw: protectedProcedure
    .input(z.object({
      id: z.number(),
      quantity: z.number().int().min(1),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      const userId = Number(ctx.user?.id || 0);
      const db = dbInstance;
      if (!db.warehouseItems) db.warehouseItems = [];
      const item = db.warehouseItems.find((w: any) => Number(w.id) === Number(input.id));
      if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ítem no encontrado.' });
      // Permission check
      if (item.cpId) {
        const allowed = await canWriteCp(role, userId, Number(item.cpId));
        if (!allowed && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos para descontar en esta CP.' });
      } else if (role !== 'super_admin' && role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Admin o Administrador del Sistema pueden descontar.' });
      }
      if ((Number(item.quantity) || 0) < input.quantity) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Stock insuficiente. Disponible: ${item.quantity}` });
      }
      item.quantity = (Number(item.quantity) || 0) - input.quantity;
      item.updatedAt = nowIso();
      // Log to history
      if (!db.warehouseHistory) db.warehouseHistory = [];
      db.warehouseHistory.push({
        id: randId(),
        itemId: Number(item.id),
        itemName: item.name,
        cpId: item.cpId || null,
        type: 'withdraw',
        quantity: input.quantity,
        reason: input.reason,
        actor: ctx.user?.characterName || ctx.user?.name || 'Sistema',
        actorId: Number(ctx.user?.id || 0),
        date: nowIso(),
        remainingStock: item.quantity,
      });
      saveDbToDisk();
      await createAuditLog({
        userId: Number(ctx.user?.id || 0),
        action: 'WAREHOUSE_WITHDRAW',
        actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
        actorRole: String(ctx.user?.role || 'USER'),
        detail: `Descontó ${input.quantity}× ${item.name} de bodega. Motivo: ${input.reason}. Stock restante: ${item.quantity}.`,
      });
      return { success: true, remaining: item.quantity };
    }),

  // Delete warehouse item (SA or CP leader)
  deleteItem: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      const userId = Number(ctx.user?.id || 0);
      const db = dbInstance;
      if (!db.warehouseItems) return { success: true };
      const idx = db.warehouseItems.findIndex((w: any) => Number(w.id) === Number(input.id));
      if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND' });
      const target = db.warehouseItems[idx];
      if (target.cpId) {
        const allowed = await canWriteCp(role, userId, Number(target.cpId));
        if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos para eliminar en esta CP.' });
      } else if (role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede eliminar.' });
      }
      const removed = db.warehouseItems.splice(idx, 1)[0];
      // Log to history
      if (!db.warehouseHistory) db.warehouseHistory = [];
      db.warehouseHistory.push({
        id: randId(),
        itemId: Number(removed.id),
        itemName: removed.name,
        cpId: removed.cpId || null,
        type: 'delete',
        quantity: Number(removed.quantity) || 0,
        reason: input.reason,
        actor: ctx.user?.characterName || ctx.user?.name || 'Sistema',
        actorId: Number(ctx.user?.id || 0),
        date: nowIso(),
        remainingStock: 0,
      });
      saveDbToDisk();
      await createAuditLog({
        userId: Number(ctx.user?.id || 0),
        action: 'WAREHOUSE_DELETE',
        actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
        actorRole: String(ctx.user?.role || 'USER'),
        detail: `Eliminó ${removed.name} (${removed.quantity} uds) de la bodega. Motivo: ${input.reason}.`,
      });
      return { success: true };
    }),

  // Update item (category, quantity) — SA only
  updateItem: protectedProcedure
    .input(z.object({ id: z.number(), category: z.string().optional(), quantity: z.number().int().min(0).optional() }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede editar.' });
      const db = dbInstance;
      if (!db.warehouseItems) return { success: false };
      const item = db.warehouseItems.find((w: any) => Number(w.id) === Number(input.id));
      if (!item) throw new TRPCError({ code: 'NOT_FOUND' });
      if (input.category !== undefined) item.category = input.category;
      if (input.quantity !== undefined) item.quantity = input.quantity;
      item.updatedAt = nowIso();
      saveDbToDisk();
      return { success: true };
    }),

  // ─── Material Loans between CPs ─────────────────────────────────────────

  // Create a loan (lend materials from one CP to another)
  createLoan: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      quantity: z.number().int().min(1),
      toCpId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      const userId = Number(ctx.user?.id || 0);
      const db = dbInstance;
      if (!db.warehouseItems) db.warehouseItems = [];
      const item = db.warehouseItems.find((w: any) => Number(w.id) === Number(input.itemId));
      if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ítem no encontrado.' });
      const fromCpId = Number(item.cpId);
      if (!fromCpId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El ítem no tiene CP asignada.' });
      if (fromCpId === input.toCpId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No puedes prestar a la misma CP.' });
      // Permission check
      const allowed = await canWriteCp(role, userId, fromCpId);
      if (!allowed && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos para prestar desde esta CP.' });
      if ((Number(item.quantity) || 0) < input.quantity) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Stock insuficiente. Disponible: ${item.quantity}` });
      }
      // Deduct from source
      item.quantity = (Number(item.quantity) || 0) - input.quantity;
      item.updatedAt = nowIso();
      // Create loan record
      if (!db.warehouseLoans) db.warehouseLoans = [];
      const allCps = await getRaidCommandParties();
      const fromCp = allCps.find((cp: any) => Number(cp.id) === fromCpId);
      const toCp = allCps.find((cp: any) => Number(cp.id) === input.toCpId);
      const loanId = randId();
      db.warehouseLoans.push({
        id: loanId,
        itemId: Number(item.id),
        itemName: item.name,
        itemImageUrl: item.imageUrl || '',
        fromCpId,
        fromCpName: fromCp?.name || `CP-${fromCpId}`,
        toCpId: input.toCpId,
        toCpName: toCp?.name || `CP-${input.toCpId}`,
        quantity: input.quantity,
        reason: input.reason || '',
        lentBy: ctx.user?.characterName || ctx.user?.name || 'Sistema',
        lentById: userId,
        lentAt: nowIso(),
        returned: false,
        returnedAt: null,
      });
      // History log
      if (!db.warehouseHistory) db.warehouseHistory = [];
      db.warehouseHistory.push({
        id: randId(),
        itemId: Number(item.id),
        itemName: item.name,
        cpId: fromCpId,
        type: 'loan_out',
        quantity: input.quantity,
        reason: `Préstamo a ${toCp?.name || 'CP-' + input.toCpId}${input.reason ? ': ' + input.reason : ''}`,
        actor: ctx.user?.characterName || ctx.user?.name || 'Sistema',
        actorId: userId,
        date: nowIso(),
        remainingStock: item.quantity,
      });
      saveDbToDisk();
      return { success: true, loanId, remaining: item.quantity };
    }),

  // List all loans (optionally filter by cpId — shows loans FROM or TO that CP)
  listLoans: protectedProcedure
    .input(z.object({ cpId: z.number().optional() }).optional())
    .query(({ input }) => {
      const db = dbInstance;
      const loans = (db.warehouseLoans || []).slice();
      if (input?.cpId) {
        return loans.filter((l: any) => Number(l.fromCpId) === Number(input.cpId) || Number(l.toCpId) === Number(input.cpId));
      }
      return loans;
    }),

  // Mark a loan as returned (only source CP leader or SA)
  returnLoan: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      const userId = Number(ctx.user?.id || 0);
      const db = dbInstance;
      if (!db.warehouseLoans) db.warehouseLoans = [];
      const loan = db.warehouseLoans.find((l: any) => Number(l.id) === Number(input.loanId));
      if (!loan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Préstamo no encontrado.' });
      if (loan.returned) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este préstamo ya fue devuelto.' });
      // Only source CP leader or SA can confirm return
      const allowed = await canWriteCp(role, userId, Number(loan.fromCpId));
      if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el líder de la CP prestadora o SA puede confirmar devolución.' });
      // Return materials to source CP
      if (!db.warehouseItems) db.warehouseItems = [];
      const sourceItem = db.warehouseItems.find((w: any) => Number(w.id) === Number(loan.itemId));
      if (sourceItem) {
        sourceItem.quantity = (Number(sourceItem.quantity) || 0) + loan.quantity;
        sourceItem.updatedAt = nowIso();
      }
      loan.returned = true;
      loan.returnedAt = nowIso();
      loan.returnedBy = ctx.user?.characterName || ctx.user?.name || 'Sistema';
      // History log
      if (!db.warehouseHistory) db.warehouseHistory = [];
      db.warehouseHistory.push({
        id: randId(),
        itemId: Number(loan.itemId),
        itemName: loan.itemName,
        cpId: Number(loan.fromCpId),
        type: 'loan_return',
        quantity: loan.quantity,
        reason: `Devolución de préstamo desde ${loan.toCpName}`,
        actor: ctx.user?.characterName || ctx.user?.name || 'Sistema',
        actorId: userId,
        date: nowIso(),
        remainingStock: sourceItem ? sourceItem.quantity : 0,
      });
      saveDbToDisk();
      return { success: true };
    }),

  // ─── Craft Recipes ──────────────────────────────────────────────────────
  recipes: router({
    list: protectedProcedure.query(() => {
      const db = dbInstance;
      return (db.craftRecipes || []).slice();
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        category: z.string().optional(),
        imageUrl: z.string().optional(),
        wikiUrl: z.string().optional(),
        materials: z.array(z.object({
          name: z.string().min(1),
          quantity: z.number().int().min(1),
          imageUrl: z.string().optional(),
          isCraftable: z.boolean().optional(),
          subMaterials: z.lazy((): z.ZodType<any> => z.array(z.object({
            name: z.string().min(1),
            quantity: z.number().int().min(1),
            imageUrl: z.string().optional(),
            isCraftable: z.boolean().optional(),
            subMaterials: z.lazy((): z.ZodType<any> => z.array(z.object({
              name: z.string().min(1),
              quantity: z.number().int().min(1),
              imageUrl: z.string().optional(),
              isCraftable: z.boolean().optional(),
              subMaterials: z.array(z.object({
                name: z.string().min(1),
                quantity: z.number().int().min(1),
                imageUrl: z.string().optional(),
                isCraftable: z.boolean().optional(),
              })).optional(),
            })).optional()),
          })).optional()),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede crear recetas.' });
        }
        const db = dbInstance;
        if (!db.craftRecipes) db.craftRecipes = [];
        const mapMats = (arr: any[]): any[] => arr.map((m: any) => ({
          name: m.name.trim(),
          nameLower: m.name.trim().toLowerCase(),
          quantity: m.quantity,
          imageUrl: m.imageUrl || null,
          isCraftable: m.isCraftable || false,
          subMaterials: m.subMaterials?.length ? mapMats(m.subMaterials) : [],
        }));
        const recipe = {
          id: randId(),
          name: input.name.trim(),
          category: input.category || null,
          imageUrl: input.imageUrl || null,
          wikiUrl: input.wikiUrl || null,
          materials: mapMats(input.materials),
          createdAt: nowIso(),
          createdBy: ctx.user?.characterName || ctx.user?.name || 'Sistema',
        };
        db.craftRecipes.push(recipe);
        saveDbToDisk();
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'CRAFT_RECIPE_CREATE',
          actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          detail: `Creó receta de crafteo: "${input.name}" con ${input.materials.length} materiales.`,
        });
        return { success: true, recipe };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede eliminar recetas.' });
        }
        const db = dbInstance;
        if (!db.craftRecipes) return { success: true };
        const idx = db.craftRecipes.findIndex((r: any) => Number(r.id) === Number(input.id));
        if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND' });
        const removed = db.craftRecipes.splice(idx, 1)[0];
        saveDbToDisk();
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'CRAFT_RECIPE_DELETE',
          actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          detail: `Eliminó receta de crafteo: "${removed.name}".`,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        category: z.string().optional(),
        imageUrl: z.string().optional().nullable(),
        wikiUrl: z.string().optional().nullable(),
        materials: z.array(z.object({
          name: z.string().min(1),
          quantity: z.number().int().min(1),
          imageUrl: z.string().optional(),
          isCraftable: z.boolean().optional(),
          subMaterials: z.lazy((): z.ZodType<any> => z.array(z.object({
            name: z.string().min(1),
            quantity: z.number().int().min(1),
            imageUrl: z.string().optional(),
            isCraftable: z.boolean().optional(),
            subMaterials: z.lazy((): z.ZodType<any> => z.array(z.object({
              name: z.string().min(1),
              quantity: z.number().int().min(1),
              imageUrl: z.string().optional(),
              isCraftable: z.boolean().optional(),
              subMaterials: z.array(z.object({
                name: z.string().min(1),
                quantity: z.number().int().min(1),
                imageUrl: z.string().optional(),
                isCraftable: z.boolean().optional(),
              })).optional(),
            })).optional()),
          })).optional()),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede editar recetas.' });
        }
        const db = dbInstance;
        const recipe = (db.craftRecipes || []).find((r: any) => Number(r.id) === Number(input.id));
        if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Receta no encontrada.' });
        if (input.name) recipe.name = input.name.trim();
        if (input.category !== undefined) recipe.category = input.category || null;
        if (input.imageUrl !== undefined) recipe.imageUrl = input.imageUrl || null;
        if (input.wikiUrl !== undefined) recipe.wikiUrl = input.wikiUrl || null;
        if (input.materials) {
          const mapMats = (arr: any[]): any[] => arr.map((m: any) => ({
            name: m.name.trim(),
            nameLower: m.name.trim().toLowerCase(),
            quantity: m.quantity,
            imageUrl: m.imageUrl || null,
            isCraftable: m.isCraftable || false,
            subMaterials: m.subMaterials?.length ? mapMats(m.subMaterials) : [],
          }));
          recipe.materials = mapMats(input.materials);
        }
        saveDbToDisk();
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'CRAFT_RECIPE_UPDATE',
          actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          detail: `Editó receta de crafteo: "${recipe.name}".`,
        });
        return { success: true, recipe };
      }),
  }),

  // ─── Craft Projects ─────────────────────────────────────────────────────
  projects: router({
    list: protectedProcedure
      .input(z.object({ cpId: z.number().optional() }).optional())
      .query(({ input }) => {
        const db = dbInstance;
        const projects = (db.craftProjects || []).slice();
        if (input?.cpId) return projects.filter((p: any) => Number(p.cpId) === Number(input.cpId));
        return projects;
      }),

    create: protectedProcedure
      .input(z.object({
        recipeId: z.number(),
        notes: z.string().optional(),
        priority: z.boolean().optional(),
        assignedCharacter: z.string().optional(),
        cpId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const userId = Number(ctx.user?.id || 0);
        if (input.cpId) {
          const allowed = await canWriteCp(role, userId, input.cpId);
          if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos para crear proyectos en esta CP.' });
        } else if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede crear proyectos.' });
        }
        const db = dbInstance;
        if (!db.craftProjects) db.craftProjects = [];
        const recipe = (db.craftRecipes || []).find((r: any) => Number(r.id) === Number(input.recipeId));
        if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Receta no encontrada.' });
        const project: any = {
          id: randId(),
          recipeId: input.recipeId,
          recipeName: recipe.name,
          recipeImage: recipe.imageUrl || null,
          recipeCategory: recipe.category || null,
          status: 'active',
          notes: input.notes || '',
          priority: input.priority || false,
          assignedCharacter: input.assignedCharacter || '',
          cpId: input.cpId || null,
          createdAt: nowIso(),
          createdBy: ctx.user?.characterName || ctx.user?.name || 'Sistema',
        };
        db.craftProjects.push(project);
        saveDbToDisk();
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'CRAFT_PROJECT_CREATE',
          actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          detail: `Creó proyecto de crafteo: "${recipe.name}"${input.assignedCharacter ? ` para ${input.assignedCharacter}` : ''}${input.priority ? ' (PRIORIDAD)' : ''}.`,
        });
        return { success: true, project };
      }),

    togglePriority: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const db = dbInstance;
        const project = (db.craftProjects || []).find((p: any) => Number(p.id) === Number(input.id));
        if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
        project.priority = !project.priority;
        saveDbToDisk();
        return { success: true, priority: project.priority };
      }),

    complete: protectedProcedure
      .input(z.object({
        id: z.number(),
        assignedCharacter: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const userId = Number(ctx.user?.id || 0);
        const db = dbInstance;
        const project = (db.craftProjects || []).find((p: any) => Number(p.id) === Number(input.id));
        if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
        // Permission check: SA or CP leader
        if (project.cpId) {
          const allowed = await canWriteCp(role, userId, Number(project.cpId));
          if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos para completar proyectos en esta CP.' });
        } else if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const recipe = (db.craftRecipes || []).find((r: any) => Number(r.id) === Number(project.recipeId));
        if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Receta asociada no encontrada.' });

        // Deduct all materials recursively from warehouse (same CP)
        const projectCpId = project.cpId || null;
        const deductMats = (mats: any[]) => {
          for (const mat of mats) {
            const need = Number(mat.quantity) || 0;
            const nameLower = String(mat.name || '').trim().toLowerCase();
            const warehouseItem = (db.warehouseItems || []).find((w: any) =>
              String(w.nameLower || w.name || '').toLowerCase() === nameLower &&
              (w.cpId || null) == projectCpId
            );
            if (warehouseItem && need > 0) {
              warehouseItem.quantity = Math.max(0, (Number(warehouseItem.quantity) || 0) - need);
              warehouseItem.updatedAt = nowIso();
            }
            if (mat.subMaterials?.length) deductMats(mat.subMaterials);
          }
        };
        deductMats(recipe.materials || []);

        project.status = 'completed';
        project.completedAt = nowIso();
        project.assignedCharacter = input.assignedCharacter;
        project.recipeImage = recipe.imageUrl || null;
        project.recipeCategory = recipe.category || null;
        saveDbToDisk();
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'CRAFT_PROJECT_COMPLETE',
          actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          detail: `Completó proyecto "${project.recipeName}" — entregado a ${input.assignedCharacter}. Materiales descontados de bodega.`,
        });
        return { success: true };
      }),

    editAssignment: protectedProcedure
      .input(z.object({
        id: z.number(),
        assignedCharacter: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const userId = Number(ctx.user?.id || 0);
        const db = dbInstance;
        const project = (db.craftProjects || []).find((p: any) => Number(p.id) === Number(input.id));
        if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
        if (project.cpId) {
          const allowed = await canWriteCp(role, userId, Number(project.cpId));
          if (!allowed) throw new TRPCError({ code: 'FORBIDDEN' });
        } else if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const oldChar = project.assignedCharacter || '(sin asignar)';
        project.assignedCharacter = input.assignedCharacter;
        saveDbToDisk();
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'CRAFT_PROJECT_EDIT_ASSIGNMENT',
          actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          detail: `Cambió asignación de "${project.recipeName}" de ${oldChar} a ${input.assignedCharacter}.`,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const userId = Number(ctx.user?.id || 0);
        const db = dbInstance;
        if (!db.craftProjects) return { success: true };
        const idx = db.craftProjects.findIndex((p: any) => Number(p.id) === Number(input.id));
        if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND' });
        const target = db.craftProjects[idx];
        if (target.cpId) {
          const allowed = await canWriteCp(role, userId, Number(target.cpId));
          if (!allowed) throw new TRPCError({ code: 'FORBIDDEN' });
        } else if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        db.craftProjects.splice(idx, 1);
        saveDbToDisk();
        return { success: true };
      }),
  }),

  // ─── Material Catalog ──────────────────────────────────────────────────
  catalog: router({
    list: protectedProcedure.query(() => {
      const db = dbInstance;
      return (db.materialCatalog || []).slice();
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        category: z.string().min(1),
        imageUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede gestionar el catálogo.' });
        }
        const db = dbInstance;
        if (!db.materialCatalog) db.materialCatalog = [];
        const nameLower = input.name.trim().toLowerCase();
        const existing = db.materialCatalog.find((m: any) => String(m.nameLower || '').toLowerCase() === nameLower);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: `Ya existe "${existing.name}" en el catálogo.` });
        }
        const entry = {
          id: randId(),
          name: input.name.trim(),
          nameLower,
          category: input.category,
          imageUrl: input.imageUrl || null,
          createdAt: nowIso(),
          createdBy: ctx.user?.characterName || ctx.user?.name || 'Sistema',
        };
        db.materialCatalog.push(entry);
        saveDbToDisk();
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'CATALOG_MATERIAL_CREATE',
          actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          detail: `Agregó "${input.name}" al catálogo de materiales (${input.category}).`,
        });
        return { success: true, entry };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        imageUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const db = dbInstance;
        const item = (db.materialCatalog || []).find((m: any) => Number(m.id) === Number(input.id));
        if (!item) throw new TRPCError({ code: 'NOT_FOUND' });
        const oldNameLower = String(item.nameLower || item.name || '').toLowerCase();
        if (input.name) { item.name = input.name.trim(); item.nameLower = input.name.trim().toLowerCase(); }
        if (input.category) item.category = input.category;
        if (input.imageUrl !== undefined) item.imageUrl = input.imageUrl || null;
        // Propagate changes to warehouseItems and warehouseIncoming that match old name
        const updatedName = item.name;
        const updatedCat = item.category;
        const updatedImg = item.imageUrl;
        for (const wi of (db.warehouseItems || [])) {
          if (String(wi.nameLower || wi.name || '').toLowerCase() === oldNameLower) {
            wi.name = updatedName;
            wi.nameLower = updatedName.toLowerCase();
            wi.category = updatedCat;
            if (updatedImg !== undefined) wi.imageUrl = updatedImg;
          }
        }
        for (const inc of (db.warehouseIncoming || [])) {
          if (String(inc.name || '').toLowerCase() === oldNameLower) {
            inc.name = updatedName;
            inc.category = updatedCat;
            if (updatedImg !== undefined) inc.imageUrl = updatedImg;
          }
        }
        saveDbToDisk();
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const db = dbInstance;
        if (!db.materialCatalog) return { success: true };
        const idx = db.materialCatalog.findIndex((m: any) => Number(m.id) === Number(input.id));
        if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND' });
        const removed = db.materialCatalog.splice(idx, 1)[0];
        saveDbToDisk();
        await createAuditLog({
          userId: Number(ctx.user?.id || 0),
          action: 'CATALOG_MATERIAL_DELETE',
          actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
          actorRole: String(ctx.user?.role || 'USER'),
          detail: `Eliminó "${removed.name}" del catálogo de materiales.`,
        });
        return { success: true };
      }),
  }),

  // ─── Warehouse Clans & CPs (independent from raid module) ──────────────
  clans: router({
    list: protectedProcedure.query(async () => {
      return getWarehouseClans();
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const clan = await createWarehouseClan({ name: input.name });
        return { success: true, clan };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const clan = await updateWarehouseClan(input.id, { name: input.name });
        if (!clan) throw new TRPCError({ code: 'NOT_FOUND' });
        return { success: true, clan };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const clan = await deleteWarehouseClan(input.id);
        if (!clan) throw new TRPCError({ code: 'NOT_FOUND' });
        return { success: true };
      }),
  }),

  commandParties: router({
    list: protectedProcedure.query(async () => {
      const allCps = await getWarehouseCPs();
      const allUsers = await getAllUsers();
      const allClans = await getWarehouseClans();
      const allMembers = await getWarehouseCPMembers();
      return allCps.map((cp: any) => {
        const clan = allClans.find((c: any) => Number(c.id) === Number(cp.clanId));
        const leader = cp.leaderId
          ? allUsers.find((u: any) => Number(u.id) === Number(cp.leaderId))
          : null;
        const cpMembers = allMembers.filter((m: any) => Number(m.cpId) === Number(cp.id));
        const membersWithInfo = cpMembers.map((m: any) => {
          const user = allUsers.find((u: any) => Number(u.id) === Number(m.userId));
          return {
            userId: Number(m.userId),
            name: user?.name || user?.characterName || 'Desconocido',
            characterName: user?.characterName || user?.name || '',
            email: user?.email || '',
            addedAt: m.addedAt,
          };
        });
        const ids: number[] = Array.isArray(cp.leaderIds) ? cp.leaderIds.map(Number) : (cp.leaderId ? [Number(cp.leaderId)] : []);
        const leaderNames = ids.map((lid: number) => {
          const u = allUsers.find((u: any) => Number(u.id) === lid);
          return u?.characterName || u?.name || null;
        }).filter(Boolean);
        return {
          ...cp,
          clanName: clan?.name || 'Sin clan',
          leaderId: cp.leaderId ? Number(cp.leaderId) : null,
          leaderIds: ids,
          leaderName: leader?.characterName || leader?.name || null,
          leaderNames,
          members: membersWithInfo,
          memberCount: membersWithInfo.length,
        };
      });
    }),

    cpSelector: protectedProcedure.query(async () => {
      const allCps = await getWarehouseCPs();
      return allCps.map((cp: any) => ({
        id: Number(cp.id),
        name: cp.name,
        clanId: Number(cp.clanId),
        leaderId: cp.leaderId ? Number(cp.leaderId) : null,
        leaderIds: Array.isArray(cp.leaderIds) ? cp.leaderIds.map(Number) : (cp.leaderId ? [Number(cp.leaderId)] : []),
      }));
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), clanId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const clan = await getWarehouseClanById(input.clanId);
        if (!clan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clan no encontrado.' });
        const cp = await createWarehouseCP({ name: input.name, clanId: input.clanId });
        return { success: true, cp };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        leaderId: z.number().nullable().optional(),
        leaderIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const data: any = {};
        if (input.name) data.name = input.name;
        if (input.leaderId !== undefined) data.leaderId = input.leaderId;
        if (input.leaderIds !== undefined) data.leaderIds = input.leaderIds;
        const cp = await updateWarehouseCP(input.id, data);
        if (!cp) throw new TRPCError({ code: 'NOT_FOUND' });
        return { success: true, cp };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const cp = await deleteWarehouseCP(input.id);
        if (!cp) throw new TRPCError({ code: 'NOT_FOUND' });
        return { success: true };
      }),

    listUsers: protectedProcedure.query(async () => {
      const allUsers = await getAllUsers();
      return allUsers
        .filter((u: any) => u.isActive !== false)
        .map((u: any) => ({
          id: Number(u.id),
          name: u.name || u.characterName || u.email,
          characterName: u.characterName || u.name || '',
          email: u.email,
          role: u.role,
        }));
    }),

    addMember: protectedProcedure
      .input(z.object({ cpId: z.number(), userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const cp = await getWarehouseCPById(input.cpId);
        if (!cp) throw new TRPCError({ code: 'NOT_FOUND', message: 'CP no encontrada.' });
        const entry = await addWarehouseCPMember(input.cpId, input.userId);
        return { success: true, entry };
      }),

    removeMember: protectedProcedure
      .input(z.object({ cpId: z.number(), userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const removed = await removeWarehouseCPMember(input.cpId, input.userId);
        if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Miembro no encontrado.' });
        return { success: true };
      }),

    // Get detailed members of a CP (with secondaryCharacters and class info)
    members: protectedProcedure
      .input(z.object({ cpId: z.number() }))
      .query(async ({ input }) => {
        const cp = await getWarehouseCPById(input.cpId);
        if (!cp) return [];
        const cpMembers = await getWarehouseCPMembers(input.cpId);
        const allUsers = await getAllUsers();
        const userIds = cpMembers.map((m: any) => Number(m.userId));
        const secondaries = await getSecondaryCharactersByUsers(userIds);
        return cpMembers.map((m: any) => {
          const user = allUsers.find((u: any) => Number(u.id) === Number(m.userId));
          if (!user) return null;
          return {
            id: Number(user.id),
            name: user.name || user.characterName || user.email,
            characterName: user.characterName || user.name || '',
            email: user.email || '',
            classMain: user.classMain || null,
            cpStatus: m.status || 'confirmed',
            isLeader: Number(cp.leaderId) === Number(user.id) || (Array.isArray(cp.leaderIds) && cp.leaderIds.map(Number).includes(Number(user.id))),
            secondaryCharacters: secondaries.filter((sc: any) => Number(sc.userId) === Number(user.id)),
            addedAt: m.addedAt,
          };
        }).filter(Boolean).sort((a: any, b: any) => {
          if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
          return 0;
        });
      }),

    // Sync members from matching raid clan
    syncFromRaid: protectedProcedure
      .input(z.object({ clanId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const whClan = await getWarehouseClanById(input.clanId);
        if (!whClan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clan warehouse no encontrado.' });
        // Find matching raid clan by name
        const raidClans = await getRaidClans();
        const matchingRaidClan = raidClans.find((rc: any) =>
          String(rc.name || '').toLowerCase().trim() === String(whClan.name || '').toLowerCase().trim()
        );
        if (!matchingRaidClan) throw new TRPCError({ code: 'NOT_FOUND', message: `No existe un clan raid con el nombre "${whClan.name}".` });
        // Get raid CPs for this clan
        const raidCPs = await getRaidCommandParties();
        const matchingRaidCPs = raidCPs.filter((rcp: any) => Number(rcp.clanId) === Number(matchingRaidClan.id));
        let syncedCps = 0;
        let syncedMembers = 0;
        for (const raidCp of matchingRaidCPs) {
          // Check if warehouse CP with same name already exists
          const existingWhCps = await getWarehouseCPsByClan(input.clanId);
          let whCp = existingWhCps.find((wcp: any) =>
            String(wcp.name || '').toLowerCase().trim() === String(raidCp.name || '').toLowerCase().trim()
          );
          if (!whCp) {
            whCp = await createWarehouseCP({ name: raidCp.name, clanId: input.clanId });
            syncedCps++;
          }
          // Set leader if raid CP has one
          if (raidCp.leaderId && !whCp.leaderId) {
            await updateWarehouseCP(whCp.id, { leaderId: Number(raidCp.leaderId) });
          }
          // Add raid members to warehouse CP
          const raidMembers = await getRaidUsersByCp(Number(raidCp.id));
          for (const rm of raidMembers) {
            const added = await addWarehouseCPMember(whCp.id, Number(rm.id));
            if (added && !('userId' in added && (added as any).cpId)) syncedMembers++;
            else syncedMembers++;
          }
        }
        return { success: true, syncedCps, syncedMembers, raidClanName: matchingRaidClan.name };
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // OBJETIVOS (Objectives) — weekly calendar with tasks & attendance
  // ═══════════════════════════════════════════════════════════════════════

  objectives: router({
    // List objectives for a CP within a date range (supports month or week)
    list: protectedProcedure
      .input(z.object({ cpId: z.number(), weekStart: z.string().optional(), monthStart: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const db = dbInstance;
        if (!db.warehouseObjectives) db.warehouseObjectives = [];
        const objs = (db.warehouseObjectives as any[]).filter((o: any) => Number(o.cpId) === input.cpId);
        if (input.monthStart) {
          const ms = new Date(input.monthStart);
          const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 1);
          return objs.filter((o: any) => {
            const d = new Date(o.date);
            return d >= ms && d < me;
          });
        }
        if (input.weekStart) {
          const ws = new Date(input.weekStart);
          const we = new Date(ws); we.setDate(we.getDate() + 7);
          return objs.filter((o: any) => {
            const d = new Date(o.date);
            return d >= ws && d < we;
          });
        }
        return objs;
      }),

    // Create objective (SA or CP leader)
    create: protectedProcedure
      .input(z.object({
        cpId: z.number(),
        date: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        materials: z.array(z.object({ name: z.string(), quantity: z.number(), imageUrl: z.string().optional(), catalogId: z.number().optional() })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const userId = Number(ctx.user?.id || 0);
        const allowed = await canWriteCp(role, userId, input.cpId);
        if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo SA o líder de CP pueden crear objetivos.' });
        const db = dbInstance;
        if (!db.warehouseObjectives) db.warehouseObjectives = [];
        const obj = {
          id: randId(),
          cpId: input.cpId,
          date: input.date,
          title: input.title,
          description: input.description || '',
          materials: input.materials || [],
          achieved: false,
          createdBy: userId,
          createdAt: nowIso(),
        };
        (db.warehouseObjectives as any[]).push(obj);
        saveDbToDisk();
        return obj;
      }),

    // Update objective
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        materials: z.array(z.object({ name: z.string(), quantity: z.number(), imageUrl: z.string().optional(), catalogId: z.number().optional() })).optional(),
        achieved: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const userId = Number(ctx.user?.id || 0);
        const db = dbInstance;
        if (!db.warehouseObjectives) db.warehouseObjectives = [];
        const obj = (db.warehouseObjectives as any[]).find((o: any) => o.id === input.id);
        if (!obj) throw new TRPCError({ code: 'NOT_FOUND', message: 'Objetivo no encontrado.' });
        const allowed = await canWriteCp(role, userId, obj.cpId);
        if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin permisos.' });
        if (input.title !== undefined) obj.title = input.title;
        if (input.description !== undefined) obj.description = input.description;
        if (input.materials !== undefined) obj.materials = input.materials;
        if (input.achieved !== undefined) obj.achieved = input.achieved;
        saveDbToDisk();
        return obj;
      }),

    // Delete objective
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const userId = Number(ctx.user?.id || 0);
        const db = dbInstance;
        if (!db.warehouseObjectives) db.warehouseObjectives = [];
        const idx = (db.warehouseObjectives as any[]).findIndex((o: any) => o.id === input.id);
        if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND', message: 'Objetivo no encontrado.' });
        const obj = (db.warehouseObjectives as any[])[idx];
        const allowed = await canWriteCp(role, userId, obj.cpId);
        if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin permisos.' });
        (db.warehouseObjectives as any[]).splice(idx, 1);
        // Also remove related attendance
        if (!db.warehouseAttendance) db.warehouseAttendance = [];
        db.warehouseAttendance = (db.warehouseAttendance as any[]).filter((a: any) => a.objectiveId !== input.id);
        saveDbToDisk();
        return { success: true };
      }),

    // Cleanup old objectives (> 2 months)
    cleanup: protectedProcedure.mutation(async ({ ctx }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo SA.' });
      const db = dbInstance;
      if (!db.warehouseObjectives) db.warehouseObjectives = [];
      if (!db.warehouseAttendance) db.warehouseAttendance = [];
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const before = (db.warehouseObjectives as any[]).length;
      const oldIds = new Set(
        (db.warehouseObjectives as any[])
          .filter((o: any) => new Date(o.date) < twoMonthsAgo)
          .map((o: any) => o.id)
      );
      db.warehouseObjectives = (db.warehouseObjectives as any[]).filter((o: any) => !oldIds.has(o.id));
      db.warehouseAttendance = (db.warehouseAttendance as any[]).filter((a: any) => !oldIds.has(a.objectiveId));
      saveDbToDisk();
      return { removed: before - (db.warehouseObjectives as any[]).length };
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // ATTENDANCE — per-user per-objective participation tracking
  // ═══════════════════════════════════════════════════════════════════════

  attendance: router({
    // List attendance for objectives in a CP
    list: protectedProcedure
      .input(z.object({ cpId: z.number(), weekStart: z.string().optional() }))
      .query(async ({ input }) => {
        const db = dbInstance;
        if (!db.warehouseAttendance) db.warehouseAttendance = [];
        if (!db.warehouseObjectives) db.warehouseObjectives = [];
        const cpObjIds = new Set(
          (db.warehouseObjectives as any[])
            .filter((o: any) => Number(o.cpId) === input.cpId)
            .map((o: any) => o.id)
        );
        return (db.warehouseAttendance as any[]).filter((a: any) => cpObjIds.has(a.objectiveId));
      }),

    // Toggle attendance for a user on an objective
    toggle: protectedProcedure
      .input(z.object({ objectiveId: z.number(), userId: z.number(), present: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const callerId = Number(ctx.user?.id || 0);
        const db = dbInstance;
        if (!db.warehouseObjectives) db.warehouseObjectives = [];
        if (!db.warehouseAttendance) db.warehouseAttendance = [];
        const obj = (db.warehouseObjectives as any[]).find((o: any) => o.id === input.objectiveId);
        if (!obj) throw new TRPCError({ code: 'NOT_FOUND', message: 'Objetivo no encontrado.' });
        const allowed = await canWriteCp(role, callerId, obj.cpId);
        if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin permisos.' });
        const existing = (db.warehouseAttendance as any[]).find(
          (a: any) => a.objectiveId === input.objectiveId && Number(a.userId) === input.userId
        );
        if (existing) {
          existing.present = input.present;
          existing.updatedAt = nowIso();
        } else {
          (db.warehouseAttendance as any[]).push({
            id: randId(),
            objectiveId: input.objectiveId,
            userId: input.userId,
            present: input.present,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
        saveDbToDisk();
        return { success: true };
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // DAILY ATTENDANCE — independent of objectives, per-day per-CP
  // ═══════════════════════════════════════════════════════════════════════

  dailyAttendance: router({
    list: protectedProcedure
      .input(z.object({ cpId: z.number(), monthStart: z.string().optional() }))
      .query(async ({ input }) => {
        const db = dbInstance;
        if (!db.warehouseDailyAttendance) db.warehouseDailyAttendance = [];
        let records = (db.warehouseDailyAttendance as any[]).filter((a: any) => Number(a.cpId) === input.cpId);
        if (input.monthStart) {
          const ms = new Date(input.monthStart);
          const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 1);
          records = records.filter((a: any) => {
            const d = new Date(a.date);
            return d >= ms && d < me;
          });
        }
        return records;
      }),
    toggle: protectedProcedure
      .input(z.object({ cpId: z.number(), date: z.string(), userId: z.number(), present: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const callerId = Number(ctx.user?.id || 0);
        const allowed = await canWriteCp(role, callerId, input.cpId);
        if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin permisos.' });
        const db = dbInstance;
        if (!db.warehouseDailyAttendance) db.warehouseDailyAttendance = [];
        const dateKey = input.date.slice(0, 10);
        const existing = (db.warehouseDailyAttendance as any[]).find(
          (a: any) => Number(a.cpId) === input.cpId && a.date === dateKey && Number(a.userId) === input.userId
        );
        if (existing) {
          existing.present = input.present;
          existing.updatedAt = nowIso();
        } else {
          (db.warehouseDailyAttendance as any[]).push({
            id: randId(),
            cpId: input.cpId,
            date: dateKey,
            userId: input.userId,
            present: input.present,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
        saveDbToDisk();
        return { success: true };
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // DELIVERIES — per-user per-material delivery tracking for objectives
  // ═══════════════════════════════════════════════════════════════════════

  deliveries: router({
    list: protectedProcedure
      .input(z.object({ cpId: z.number() }))
      .query(async ({ input }) => {
        const db = dbInstance;
        if (!db.warehouseDeliveries) db.warehouseDeliveries = [];
        if (!db.warehouseObjectives) db.warehouseObjectives = [];
        const cpObjIds = new Set(
          (db.warehouseObjectives as any[])
            .filter((o: any) => Number(o.cpId) === input.cpId)
            .map((o: any) => o.id)
        );
        return (db.warehouseDeliveries as any[]).filter((d: any) => cpObjIds.has(d.objectiveId));
      }),

    // Set delivered quantity for a user-material pair
    setQuantity: protectedProcedure
      .input(z.object({
        objectiveId: z.number(),
        userId: z.number(),
        materialIndex: z.number(),
        quantity: z.number().min(0),
      }))
      .mutation(async ({ input, ctx }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const callerId = Number(ctx.user?.id || 0);
        const db = dbInstance;
        if (!db.warehouseObjectives) db.warehouseObjectives = [];
        if (!db.warehouseDeliveries) db.warehouseDeliveries = [];
        const obj = (db.warehouseObjectives as any[]).find((o: any) => o.id === input.objectiveId);
        if (!obj) throw new TRPCError({ code: 'NOT_FOUND', message: 'Objetivo no encontrado.' });
        const allowed = await canWriteCp(role, callerId, obj.cpId);
        if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin permisos.' });
        const existing = (db.warehouseDeliveries as any[]).find(
          (d: any) => d.objectiveId === input.objectiveId && Number(d.userId) === input.userId && d.materialIndex === input.materialIndex
        );
        if (existing) {
          existing.quantity = input.quantity;
          existing.delivered = input.quantity >= (obj.materials?.[input.materialIndex]?.quantity || 0);
          existing.updatedAt = nowIso();
        } else {
          (db.warehouseDeliveries as any[]).push({
            id: randId(),
            objectiveId: input.objectiveId,
            userId: input.userId,
            materialIndex: input.materialIndex,
            quantity: input.quantity,
            delivered: input.quantity >= (obj.materials?.[input.materialIndex]?.quantity || 0),
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
        // Auto-mark objective as achieved if all members delivered all materials
        const allMembers = await getRaidUsersByCp(obj.cpId);
        const allDelivered = (obj.materials || []).every((_: any, mi: number) => {
          return allMembers.every((m: any) => {
            const del = (db.warehouseDeliveries as any[]).find(
              (d: any) => d.objectiveId === input.objectiveId && Number(d.userId) === Number(m.id) && d.materialIndex === mi
            );
            return del && del.quantity >= (obj.materials[mi]?.quantity || 0);
          });
        });
        if (allDelivered && !obj.achieved) {
          obj.achieved = true;
        }
        saveDbToDisk();
        return { success: true };
      }),

    // Pay all debt for a user+material across all objectives in a CP for a given month
    payAllDebt: protectedProcedure
      .input(z.object({
        cpId: z.number(),
        userId: z.number(),
        materialName: z.string(),
        monthStart: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        const callerId = Number(ctx.user?.id || 0);
        const allowed = await canWriteCp(role, callerId, input.cpId);
        if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin permisos.' });
        const db = dbInstance;
        if (!db.warehouseObjectives) db.warehouseObjectives = [];
        if (!db.warehouseDeliveries) db.warehouseDeliveries = [];
        const ms = new Date(input.monthStart);
        const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 1);
        const cpObjs = (db.warehouseObjectives as any[]).filter((o: any) => {
          if (Number(o.cpId) !== input.cpId) return false;
          const d = new Date(o.date);
          return d >= ms && d < me;
        });
        let updated = 0;
        for (const obj of cpObjs) {
          (obj.materials || []).forEach((m: any, mi: number) => {
            if (m.name !== input.materialName) return;
            const existing = (db.warehouseDeliveries as any[]).find(
              (d: any) => d.objectiveId === obj.id && Number(d.userId) === input.userId && d.materialIndex === mi
            );
            if (existing) {
              if (existing.quantity < m.quantity) {
                existing.quantity = m.quantity;
                existing.delivered = true;
                existing.updatedAt = nowIso();
                updated++;
              }
            } else {
              (db.warehouseDeliveries as any[]).push({
                id: randId(),
                objectiveId: obj.id,
                userId: input.userId,
                materialIndex: mi,
                quantity: m.quantity,
                delivered: true,
                createdAt: nowIso(),
                updatedAt: nowIso(),
              });
              updated++;
            }
          });
          // Check if objective is now fully delivered
          const allMembers = await getRaidUsersByCp(obj.cpId);
          const allDelivered = (obj.materials || []).every((_: any, mi: number) => {
            return allMembers.every((mem: any) => {
              const del = (db.warehouseDeliveries as any[]).find(
                (d: any) => d.objectiveId === obj.id && Number(d.userId) === Number(mem.id) && d.materialIndex === mi
              );
              return del && del.quantity >= (obj.materials[mi]?.quantity || 0);
            });
          });
          if (allDelivered && !obj.achieved) {
            obj.achieved = true;
          }
        }
        saveDbToDisk();
        return { success: true, updated };
      }),
  }),
});
