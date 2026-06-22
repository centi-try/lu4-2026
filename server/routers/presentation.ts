/**
 * Presentación del Login — contenido gestionado por Super Admin.
 * Items: imágenes, videos de YouTube, y bloques de texto.
 */
import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { dbInstance, saveDbToDisk } from '../db';

const nowIso = () => new Date().toISOString();
const randId = () => Math.floor(Math.random() * 900_000_000) + 100_000_000;

const superAdminGuard = (role: string) => {
  if (role !== 'super_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo Super Admin puede gestionar la presentación.' });
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
        items: items.slice(start, start + limit),
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
      content: z.string().min(1), // URL for image, YouTube URL/ID for video, markdown/text for text
    }))
    .mutation(({ input, ctx }) => {
      superAdminGuard(String(ctx.user?.role || '').toLowerCase());
      const db = dbInstance;
      if (!db.presentationItems) db.presentationItems = [];
      const maxOrder = db.presentationItems.reduce((m: number, i: any) => Math.max(m, i.order ?? 0), 0);
      const item = {
        id: randId(),
        type: input.type,
        title: input.title,
        content: input.content,
        order: maxOrder + 1,
        createdAt: nowIso(),
      };
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
      if (input.content !== undefined) item.content = input.content;
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
      db.presentationItems.splice(idx, 1);
      saveDbToDisk();
      return { success: true };
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
