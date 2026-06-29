/**
 * Carrusel del Login — imágenes gestionadas por Super Admin.
 * Cada imagen se almacena como base64 en data_storage.json con historial
 * de versiones anteriores para reemplazo rápido.
 */
import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { dbInstance, saveDbToDisk } from '../db';

const nowIso = () => new Date().toISOString();
const randId = () => Math.floor(Math.random() * 900_000_000) + 100_000_000;

const superAdminGuard = (role: string) => {
  if (role !== 'super_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede gestionar el carrusel.' });
  }
};

export const carouselRouter = router({
  // Public: list carousel images + settings (used by login page)
  list: publicProcedure.query(() => {
    const db = dbInstance;
    const images = (db.carouselImages || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    const settings = db.carouselSettings || { intervalSeconds: 10 };
    return {
      intervalSeconds: settings.intervalSeconds || 10,
      images: images.map((img: any) => ({
        id: img.id,
        label: img.label || '',
        data: img.data,
        width: img.width || 1536,
        height: img.height || 1024,
        sizeBytes: img.sizeBytes || 0,
        order: img.order || 0,
        createdAt: img.createdAt,
        historyCount: (img.history || []).length,
      })),
    };
  }),

  // Admin: update carousel interval
  updateSettings: protectedProcedure
    .input(z.object({
      intervalSeconds: z.number().int().min(1).max(120),
    }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      if (!db.carouselSettings) db.carouselSettings = { intervalSeconds: 10 };
      db.carouselSettings.intervalSeconds = input.intervalSeconds;
      saveDbToDisk();
      return { success: true, intervalSeconds: input.intervalSeconds };
    }),

  // Admin: get single image with full history
  getWithHistory: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      const img = (db.carouselImages || []).find((i: any) => i.id === input.id);
      if (!img) throw new TRPCError({ code: 'NOT_FOUND', message: 'Imagen no encontrada.' });
      return {
        id: img.id,
        label: img.label || '',
        data: img.data,
        width: img.width || 1536,
        height: img.height || 1024,
        sizeBytes: img.sizeBytes || 0,
        order: img.order || 0,
        createdAt: img.createdAt,
        history: (img.history || []).map((h: any, idx: number) => ({
          index: idx,
          data: h.data,
          width: h.width || 1536,
          height: h.height || 1024,
          sizeBytes: h.sizeBytes || 0,
          replacedAt: h.replacedAt,
        })),
      };
    }),

  // Admin: add a new carousel image
  create: protectedProcedure
    .input(z.object({
      label: z.string().max(100).default(''),
      data: z.string().min(10),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
      sizeBytes: z.number().int().optional(),
    }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      if (!db.carouselImages) db.carouselImages = [];
      const maxOrder = db.carouselImages.reduce((m: number, i: any) => Math.max(m, i.order ?? 0), 0);
      const item = {
        id: randId(),
        label: input.label,
        data: input.data,
        width: input.width || 1536,
        height: input.height || 1024,
        sizeBytes: input.sizeBytes || 0,
        order: maxOrder + 1,
        createdAt: nowIso(),
        history: [],
      };
      db.carouselImages.push(item);
      saveDbToDisk();
      return { id: item.id, label: item.label, order: item.order };
    }),

  // Admin: replace an existing image (old version goes to history)
  replace: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.string().min(10),
      label: z.string().max(100).optional(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
      sizeBytes: z.number().int().optional(),
    }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      const img = (db.carouselImages || []).find((i: any) => i.id === input.id);
      if (!img) throw new TRPCError({ code: 'NOT_FOUND', message: 'Imagen no encontrada.' });
      if (!img.history) img.history = [];
      img.history.unshift({
        data: img.data,
        width: img.width,
        height: img.height,
        sizeBytes: img.sizeBytes,
        replacedAt: nowIso(),
      });
      img.data = input.data;
      img.width = input.width || 1536;
      img.height = input.height || 1024;
      img.sizeBytes = input.sizeBytes || 0;
      if (input.label !== undefined) img.label = input.label;
      img.updatedAt = nowIso();
      saveDbToDisk();
      return { success: true, historyCount: img.history.length };
    }),

  // Admin: restore a previous version from history
  restoreFromHistory: protectedProcedure
    .input(z.object({
      id: z.number(),
      historyIndex: z.number().int().min(0),
    }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      const img = (db.carouselImages || []).find((i: any) => i.id === input.id);
      if (!img) throw new TRPCError({ code: 'NOT_FOUND', message: 'Imagen no encontrada.' });
      const history = img.history || [];
      if (input.historyIndex >= history.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Versión no encontrada en el historial.' });
      }
      const old = history[input.historyIndex];
      // Current version goes to history
      history.splice(input.historyIndex, 1);
      history.unshift({
        data: img.data,
        width: img.width,
        height: img.height,
        sizeBytes: img.sizeBytes,
        replacedAt: nowIso(),
      });
      img.data = old.data;
      img.width = old.width || 1536;
      img.height = old.height || 1024;
      img.sizeBytes = old.sizeBytes || 0;
      img.updatedAt = nowIso();
      saveDbToDisk();
      return { success: true };
    }),

  // Admin: delete an image permanently
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      if (!db.carouselImages) db.carouselImages = [];
      const idx = db.carouselImages.findIndex((i: any) => i.id === input.id);
      if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND', message: 'Imagen no encontrada.' });
      db.carouselImages.splice(idx, 1);
      saveDbToDisk();
      return { success: true };
    }),

  // Admin: delete all images
  deleteAll: protectedProcedure
    .mutation(({ ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      const count = (db.carouselImages || []).length;
      db.carouselImages = [];
      saveDbToDisk();
      return { success: true, deleted: count };
    }),
});
