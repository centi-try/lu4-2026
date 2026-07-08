/**
 * Carrusel del Login — imágenes gestionadas por Super Admin.
 * Las imágenes se almacenan como archivos en disco (/data/uploads/carousel/)
 * y se referencian por nombre de archivo en data_storage.json.
 */
import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import {
  dbInstance,
  saveDbToDisk,
  saveCarouselFile,
  deleteCarouselFile,
  readCarouselFileAsDataUri,
} from '../db';

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
      images: images.map((img: any) => {
        let data = '';
        if (img.filePath) {
          data = readCarouselFileAsDataUri(img.filePath) || '';
        } else if (img.data) {
          data = img.data;
        }
        return {
          id: img.id,
          label: img.label || '',
          data,
          width: img.width || 1536,
          height: img.height || 1024,
          sizeBytes: img.sizeBytes || 0,
          order: img.order || 0,
          createdAt: img.createdAt,
          historyCount: (img.history || []).length,
        };
      }),
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

      let data = '';
      if (img.filePath) {
        data = readCarouselFileAsDataUri(img.filePath) || '';
      } else if (img.data) {
        data = img.data;
      }

      return {
        id: img.id,
        label: img.label || '',
        data,
        width: img.width || 1536,
        height: img.height || 1024,
        sizeBytes: img.sizeBytes || 0,
        order: img.order || 0,
        createdAt: img.createdAt,
        history: (img.history || []).map((h: any, idx: number) => {
          let hData = '';
          if (h.filePath) {
            hData = readCarouselFileAsDataUri(h.filePath) || '';
          } else if (h.data) {
            hData = h.data;
          }
          return {
            index: idx,
            data: hData,
            width: h.width || 1536,
            height: h.height || 1024,
            sizeBytes: h.sizeBytes || 0,
            replacedAt: h.replacedAt,
          };
        }),
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
      const id = randId();
      const fileName = saveCarouselFile(id, input.data);
      const item = {
        id,
        label: input.label,
        filePath: fileName,
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
      const histIdx = img.history.length;
      // Move current to history: rename file with history suffix
      if (img.filePath) {
        const oldFilePath = img.filePath;
        const hFileName = saveCarouselFile(img.id, readCarouselFileAsDataUri(oldFilePath) || '', `_h${histIdx}`);
        img.history.unshift({
          filePath: hFileName,
          width: img.width,
          height: img.height,
          sizeBytes: img.sizeBytes,
          replacedAt: nowIso(),
        });
        deleteCarouselFile(oldFilePath);
      } else if (img.data) {
        // Legacy base64 in JSON — save to file first
        const hFileName = saveCarouselFile(img.id, img.data, `_h${histIdx}`);
        img.history.unshift({
          filePath: hFileName,
          width: img.width,
          height: img.height,
          sizeBytes: img.sizeBytes,
          replacedAt: nowIso(),
        });
        delete img.data;
      }
      // Save new image as file
      const newFileName = saveCarouselFile(img.id, input.data);
      img.filePath = newFileName;
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
      const histIdx = history.length;
      if (img.filePath) {
        const currentData = readCarouselFileAsDataUri(img.filePath);
        if (currentData) {
          const hFileName = saveCarouselFile(img.id, currentData, `_h${histIdx}`);
          history.unshift({
            filePath: hFileName,
            width: img.width,
            height: img.height,
            sizeBytes: img.sizeBytes,
            replacedAt: nowIso(),
          });
        }
        deleteCarouselFile(img.filePath);
      }
      // Restore old version as current
      if (old.filePath) {
        const oldData = readCarouselFileAsDataUri(old.filePath);
        if (oldData) {
          const newFileName = saveCarouselFile(img.id, oldData);
          img.filePath = newFileName;
          deleteCarouselFile(old.filePath);
        }
      } else if (old.data) {
        const newFileName = saveCarouselFile(img.id, old.data);
        img.filePath = newFileName;
      }
      delete img.data;
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
      const img = db.carouselImages[idx];
      // Delete current file
      if (img.filePath) deleteCarouselFile(img.filePath);
      // Delete history files
      if (img.history) {
        for (const h of img.history) {
          if (h.filePath) deleteCarouselFile(h.filePath);
        }
      }
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
      // Delete all files from disk
      for (const img of (db.carouselImages || [])) {
        if (img.filePath) deleteCarouselFile(img.filePath);
        if (img.history) {
          for (const h of img.history) {
            if (h.filePath) deleteCarouselFile(h.filePath);
          }
        }
      }
      db.carouselImages = [];
      saveDbToDisk();
      return { success: true, deleted: count };
    }),
});
