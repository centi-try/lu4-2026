// Router tRPC para el sistema de backups de la base de datos JSON.
// Permite a super_admins listar, crear y restaurar snapshots del archivo
// `data_storage.json`. Las operaciones de restore tocan `dbInstance` en memoria
// + reescriben el archivo principal de forma atómica.

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../_core/trpc';
import {
  createBackup,
  listBackups,
  pruneOldBackups,
  restoreFromBackup,
  STORAGE_PATHS,
  createAuditLog,
  getDbRawContent,
  importDbContent,
  resetDatabase,
} from '../db';

const superAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Solo el Administrador del Sistema puede gestionar backups.',
    });
  }
  return next({ ctx });
});

export const backupsRouter = router({
  // Info del sistema: paths configurados, retención, count de backups.
  status: superAdminProcedure.query(async () => {
    const all = listBackups();
    return {
      dbFile: STORAGE_PATHS.dbFile,
      dataDir: STORAGE_PATHS.dataDir,
      backupsDir: STORAGE_PATHS.backupsDir,
      retentionDays: STORAGE_PATHS.retentionDays,
      totalBackups: all.length,
      latest: all[0] || null,
    };
  }),

  // Lista cronológica (más reciente primero) de todos los backups disponibles.
  list: superAdminProcedure.query(async () => {
    return listBackups();
  }),

  // Crear un snapshot on-demand.
  create: superAdminProcedure
    .input(
      z
        .object({
          reason: z.string().max(40).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const reason = input?.reason || 'manual';
      const info = createBackup(reason);
      if (!info) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'No se pudo crear el backup. Revisá logs del servidor.',
        });
      }
      try {
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name || ctx.user.characterName || ctx.user.email,
          action: 'BACKUP_CREATED',
          details: `Backup manual creado: ${info.file} (${info.sizeBytes} bytes, motivo: ${reason})`,
        } as any);
      } catch {
        /* audit log es best-effort */
      }
      return info;
    }),

  // Purga backups antiguos según retention window. Normalmente corre automático
  // pero el super_admin puede ejecutarlo on-demand para liberar espacio.
  prune: superAdminProcedure.mutation(async ({ ctx }) => {
    const before = listBackups().length;
    pruneOldBackups();
    const after = listBackups().length;
    const removed = before - after;
    try {
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.characterName || ctx.user.email,
        action: 'BACKUP_PRUNED',
        details: `Purga manual de backups: ${removed} eliminados (antes=${before}, después=${after})`,
      } as any);
    } catch {
      /* ignore */
    }
    return { removed, remaining: after };
  }),

  // Restaurar un backup específico. Antes de escribir se toma un snapshot del
  // estado actual (reason=pre-restore) así nunca se pierde irreversiblemente
  // el estado previo.
  restore: superAdminProcedure
    .input(
      z.object({
        file: z
          .string()
          .min(1)
          .regex(/^[a-zA-Z0-9._-]+$/, 'Nombre de archivo inválido'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ok = restoreFromBackup(input.file);
      if (!ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No se pudo restaurar. Archivo no encontrado o corrupto.',
        });
      }
      try {
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name || ctx.user.characterName || ctx.user.email,
          action: 'BACKUP_RESTORED',
          details: `Base restaurada desde backup: ${input.file}`,
        } as any);
      } catch {
        /* ignore */
      }
      return { success: true };
    }),

  // Download current database as JSON string
  download: superAdminProcedure.query(async ({ ctx }) => {
    try {
      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.characterName || ctx.user.email,
        action: 'BACKUP_DOWNLOADED',
        details: 'Descarga del archivo de base de datos completo',
      } as any);
    } catch { /* best effort */ }
    return { content: getDbRawContent() };
  }),

  // Import/upload a JSON backup file
  importBackup: superAdminProcedure
    .input(z.object({
      content: z.string().min(2, 'El archivo está vacío o no es válido'),
    }))
    .mutation(async ({ ctx, input }) => {
      const ok = importDbContent(input.content);
      if (!ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'El archivo no es un backup válido. Verifica que sea un JSON con la estructura correcta.',
        });
      }
      try {
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name || ctx.user.characterName || ctx.user.email,
          action: 'BACKUP_IMPORTED',
          details: 'Base de datos importada desde archivo subido',
        } as any);
      } catch { /* best effort */ }
      return { success: true };
    }),

  // Factory reset — wipe everything and start fresh
  factoryReset: superAdminProcedure
    .input(z.object({
      confirmText: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.confirmText !== 'RESETEAR') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Texto de confirmación incorrecto. Escribe "RESETEAR" para confirmar.',
        });
      }
      // Audit log BEFORE reset (since it will be wiped)
      try {
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name || ctx.user.characterName || ctx.user.email,
          action: 'FACTORY_RESET',
          details: 'Reset completo de la base de datos. Se creó backup pre-reset automáticamente.',
        } as any);
      } catch { /* best effort */ }

      const ok = resetDatabase();
      if (!ok) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al resetear la base de datos.',
        });
      }
      return { success: true };
    }),
});
