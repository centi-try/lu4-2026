/**
 * Presentación del Login — contenido gestionado por Super Admin.
 * Items: imágenes, videos de YouTube, y bloques de texto.
 * Las imágenes se almacenan como archivos en disco (/data/uploads/presentation/)
 * y se referencian por nombre de archivo en data_storage.json.
 */
import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { dbInstance, saveDbToDisk, savePresentationFile, deletePresentationFile, readPresentationFileAsDataUri } from '../db';

const nowIso = () => new Date().toISOString();
const randId = () => Math.floor(Math.random() * 900_000_000) + 100_000_000;

const superAdminGuard = (role: string) => {
  if (role !== 'super_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el Administrador del Sistema puede gestionar la presentación.' });
  }
};

export const presentationRouter = router({
  // Public: list all items (used by login page — no auth needed)
  list: publicProcedure
    .input(z.object({ page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(200).default(12) }).optional())
    .query(({ input }) => {
      const db = dbInstance;
      const items = (db.presentationItems || []).slice().sort((a: any, b: any) => (b.order ?? 0) - (a.order ?? 0));
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 12;
      const start = (page - 1) * limit;
      return {
        items: items.slice(start, start + limit).map((item: any) => {
          if (item.type === 'image' && item.filePath) {
            const content = readPresentationFileAsDataUri(item.filePath) || '';
            return { ...item, content };
          }
          return item;
        }),
        total: items.length,
        page,
        totalPages: Math.ceil(items.length / limit) || 1,
      };
    }),

  // Admin: create a new item
  create: protectedProcedure
    .input(z.object({
      type: z.enum(['image', 'video', 'text']),
      title: z.string().max(200).default(''),
      content: z.string().min(1),
    }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      if (!db.presentationItems) db.presentationItems = [];
      const maxOrder = db.presentationItems.reduce((m: number, i: any) => Math.max(m, i.order ?? 0), 0);
      const id = randId();

      let content = input.content;
      let filePath: string | undefined;

      if (input.type === 'image' && input.content.startsWith('data:image/')) {
        filePath = savePresentationFile(id, input.content);
        content = '';
      }

      const item: any = {
        id,
        type: input.type,
        title: input.title,
        content,
        order: maxOrder + 1,
        createdAt: nowIso(),
      };
      if (filePath) item.filePath = filePath;

      db.presentationItems.push(item);
      saveDbToDisk();
      return item;
    }),

  // Admin: update an item
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().max(200).optional(),
      content: z.string().min(1).optional(),
      order: z.number().int().optional(),
    }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      const item = (db.presentationItems || []).find((i: any) => i.id === input.id);
      if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item no encontrado.' });
      if (input.title !== undefined) item.title = input.title;
      if (input.content !== undefined) {
        if (item.type === 'image' && input.content.startsWith('data:image/')) {
          if (item.filePath) deletePresentationFile(item.filePath);
          item.filePath = savePresentationFile(item.id, input.content);
          item.content = '';
        } else {
          item.content = input.content;
        }
      }
      if (input.order !== undefined) item.order = input.order;
      item.updatedAt = nowIso();
      saveDbToDisk();
      return item;
    }),

  // Admin: delete an item
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      if (!db.presentationItems) db.presentationItems = [];
      const idx = db.presentationItems.findIndex((i: any) => i.id === input.id);
      if (idx === -1) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item no encontrado.' });
      const item = db.presentationItems[idx];
      if (item.filePath) deletePresentationFile(item.filePath);
      db.presentationItems.splice(idx, 1);
      saveDbToDisk();
      return { success: true };
    }),

  // Admin: delete all items
  deleteAll: protectedProcedure
    .mutation(({ ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      for (const item of (db.presentationItems || [])) {
        if (item.filePath) deletePresentationFile(item.filePath);
      }
      const count = (db.presentationItems || []).length;
      db.presentationItems = [];
      saveDbToDisk();
      return { success: true, deleted: count };
    }),

  // Admin: reorder items
  reorder: protectedProcedure
    .input(z.object({ orderedIds: z.array(z.number()) }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      if (!db.presentationItems) db.presentationItems = [];
      input.orderedIds.forEach((id, idx) => {
        const item = db.presentationItems.find((i: any) => i.id === id);
        if (item) item.order = idx + 1;
      });
      saveDbToDisk();
      return { success: true };
    }),
});
