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
} from '../db';

const nowIso = () => new Date().toISOString();
const randId = () => Math.floor(Math.random() * 900_000_000) + 100_000_000;

// ─── Warehouse Items ────────────────────────────────────────────────────────

export const warehouseRouter = router({
  // List confirmed warehouse items
  list: protectedProcedure.query(() => {
    const db = dbInstance;
    return (db.warehouseItems || []).slice();
  }),

  // List incoming (pending confirmation)
  listIncoming: protectedProcedure.query(() => {
    const db = dbInstance;
    return (db.warehouseIncoming || []).slice();
  }),

  // Register new incoming material (mapper/admin/SA)
  register: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      category: z.string().min(1),
      quantity: z.number().int().min(1),
      imageUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      if (role !== 'super_admin' && role !== 'admin' && role !== 'mapper') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo mapper, admin o super admin pueden registrar.' });
      }
      const db = dbInstance;
      if (!db.warehouseIncoming) db.warehouseIncoming = [];
      const entry = {
        id: randId(),
        name: input.name.trim(),
        nameLower: input.name.trim().toLowerCase(),
        category: input.category,
        quantity: input.quantity,
        imageUrl: input.imageUrl || null,
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

  // Confirm incoming → merge into warehouse (SA only)
  confirm: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      if (role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede confirmar.' });
      }
      const db = dbInstance;
      if (!db.warehouseIncoming) db.warehouseIncoming = [];
      if (!db.warehouseItems) db.warehouseItems = [];
      const idx = db.warehouseIncoming.findIndex((e: any) => Number(e.id) === Number(input.id));
      if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro no encontrado.' });
      const incoming = db.warehouseIncoming[idx];

      // Find existing warehouse item with same name (case-insensitive)
      const nameLower = String(incoming.name || '').trim().toLowerCase();
      const existing = db.warehouseItems.find((w: any) => String(w.nameLower || w.name || '').toLowerCase() === nameLower);

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

  // Withdraw stock (admin/SA) — descontar materiales
  withdraw: protectedProcedure
    .input(z.object({
      id: z.number(),
      quantity: z.number().int().min(1),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      if (role !== 'super_admin' && role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Admin o Super Admin pueden descontar.' });
      }
      const db = dbInstance;
      if (!db.warehouseItems) db.warehouseItems = [];
      const item = db.warehouseItems.find((w: any) => Number(w.id) === Number(input.id));
      if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ítem no encontrado.' });
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

  // Delete warehouse item (SA only)
  deleteItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = String(ctx.user?.role || '').toLowerCase();
      if (role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede eliminar.' });
      }
      const db = dbInstance;
      if (!db.warehouseItems) return { success: true };
      const idx = db.warehouseItems.findIndex((w: any) => Number(w.id) === Number(input.id));
      if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND' });
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
        imageUrl: z.string().optional(),
        wikiUrl: z.string().optional(),
        materials: z.array(z.object({
          name: z.string().min(1),
          quantity: z.number().int().min(1),
          imageUrl: z.string().optional(),
          subMaterials: z.array(z.object({
            name: z.string().min(1),
            quantity: z.number().int().min(1),
            imageUrl: z.string().optional(),
          })).optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede crear recetas.' });
        }
        const db = dbInstance;
        if (!db.craftRecipes) db.craftRecipes = [];
        const recipe = {
          id: randId(),
          name: input.name.trim(),
          imageUrl: input.imageUrl || null,
          wikiUrl: input.wikiUrl || null,
          materials: input.materials.map(m => ({
            name: m.name.trim(),
            nameLower: m.name.trim().toLowerCase(),
            quantity: m.quantity,
            imageUrl: m.imageUrl || null,
            subMaterials: (m.subMaterials || []).map(s => ({
              name: s.name.trim(),
              nameLower: s.name.trim().toLowerCase(),
              quantity: s.quantity,
              imageUrl: s.imageUrl || null,
            })),
          })),
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
    list: protectedProcedure.query(() => {
      const db = dbInstance;
      return (db.craftProjects || []).slice();
    }),

    create: protectedProcedure
      .input(z.object({
        recipeId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede crear proyectos.' });
        }
        const db = dbInstance;
        if (!db.craftProjects) db.craftProjects = [];
        const recipe = (db.craftRecipes || []).find((r: any) => Number(r.id) === Number(input.recipeId));
        if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Receta no encontrada.' });
        const project = {
          id: randId(),
          recipeId: input.recipeId,
          recipeName: recipe.name,
          status: 'active',
          notes: input.notes || '',
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
          detail: `Creó proyecto de crafteo: "${recipe.name}".`,
        });
        return { success: true, project };
      }),

    complete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const role = String(ctx.user?.role || '').toLowerCase();
        if (role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const db = dbInstance;
        const project = (db.craftProjects || []).find((p: any) => Number(p.id) === Number(input.id));
        if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
        project.status = 'completed';
        project.completedAt = nowIso();
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
        if (!db.craftProjects) return { success: true };
        const idx = db.craftProjects.findIndex((p: any) => Number(p.id) === Number(input.id));
        if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND' });
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
});
