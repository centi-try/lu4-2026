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

/** Resolve the raid CP(s) this user leads. Returns array of cpIds. */
async function getCpIdsLedByUser(userId: number): Promise<number[]> {
  const allCps = await getRaidCommandParties();
  return allCps
    .filter((cp: any) => Number(cp.leaderId) === userId)
    .map((cp: any) => Number(cp.id));
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
      return {
        id: Number(cp.id),
        name: cp.name,
        clanId: Number(cp.clanId),
        leaderId: cp.leaderId ? Number(cp.leaderId) : null,
        leaderName: leader?.characterName || leader?.name || null,
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
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede confirmar.' });
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
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede eliminar.' });
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
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Admin o Super Admin pueden descontar.' });
      }
      if ((Number(item.quantity) || 0) < input.quantity) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Stock insuficiente. Disponible: ${item.quantity}` });
      }
      item.quantity = (Number(item.quantity) || 0) - input.quantity;
      item.updatedAt = nowIso();
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
    .input(z.object({ id: z.number() }))
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
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede eliminar.' });
      }
      const removed = db.warehouseItems.splice(idx, 1)[0];
      saveDbToDisk();
      await createAuditLog({
        userId: Number(ctx.user?.id || 0),
        action: 'WAREHOUSE_DELETE',
        actorName: String(ctx.user?.characterName || ctx.user?.name || 'Sistema'),
        actorRole: String(ctx.user?.role || 'USER'),
        detail: `Eliminó ${removed.name} (${removed.quantity} uds) de la bodega.`,
      });
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
          subMaterials: z.lazy((): z.ZodType<any> => z.array(z.object({
            name: z.string().min(1),
            quantity: z.number().int().min(1),
            imageUrl: z.string().optional(),
            subMaterials: z.lazy((): z.ZodType<any> => z.array(z.object({
              name: z.string().min(1),
              quantity: z.number().int().min(1),
              imageUrl: z.string().optional(),
              subMaterials: z.array(z.object({
                name: z.string().min(1),
                quantity: z.number().int().min(1),
                imageUrl: z.string().optional(),
              })).optional(),
            })).optional()),
          })).optional()),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede crear recetas.' });
        }
        const db = dbInstance;
        if (!db.craftRecipes) db.craftRecipes = [];
        const mapMats = (arr: any[]): any[] => arr.map((m: any) => ({
          name: m.name.trim(),
          nameLower: m.name.trim().toLowerCase(),
          quantity: m.quantity,
          imageUrl: m.imageUrl || null,
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
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede eliminar recetas.' });
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
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede crear proyectos.' });
        }
        const db = dbInstance;
        if (!db.craftProjects) db.craftProjects = [];
        const recipe = (db.craftRecipes || []).find((r: any) => Number(r.id) === Number(input.recipeId));
        if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Receta no encontrada.' });
        const project: any = {
          id: randId(),
          recipeId: input.recipeId,
          recipeName: recipe.name,
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
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede gestionar el catálogo.' });
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
        return {
          ...cp,
          clanName: clan?.name || 'Sin clan',
          leaderName: leader?.characterName || leader?.name || null,
          members: membersWithInfo,
          memberCount: membersWithInfo.length,
        };
      });
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
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const data: any = {};
        if (input.name) data.name = input.name;
        if (input.leaderId !== undefined) data.leaderId = input.leaderId;
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
            isLeader: Number(cp.leaderId) === Number(user.id),
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
});
