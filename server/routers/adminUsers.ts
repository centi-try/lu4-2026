import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hashPassword } from '../_core';
import { router, protectedProcedure } from '../_core/trpc';
import { getAllUsers, setUserActive, setUserRole, getUserById, deleteUser, createAuditLog, updateUserPassword } from '../db';

// Middleware de Super Admin: solo permite acceso a usuarios con rol 'super_admin'
const superAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Acceso denegado. Solo el Super Admin puede realizar esta acción.',
    });
  }
  return next({ ctx });
});

const VALID_ROLES = ['user', 'mapper', 'admin', 'super_admin'] as const;

export const adminUsersRouter = router({
  // Listar todos los usuarios registrados
  listUsers: superAdminProcedure.query(async ({ ctx }) => {
    const users = await getAllUsers();
    return users;
  }),

  // Activar o desactivar una cuenta de usuario
  toggleUserActive: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      isActive: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }

      // No permitir desactivar al propio Super Admin
      if (targetUser.id === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No puedes desactivar tu propia cuenta.',
        });
      }

      // No permitir desactivar a otros Super Admins
      if (targetUser.role === 'super_admin') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No puedes desactivar la cuenta de otro Super Admin.',
        });
      }

      const updatedUser = await setUserActive(input.userId, input.isActive);

      // Registrar auditoría
      await createAuditLog({
        userId: ctx.user.id,
        action: input.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        details: {
          targetUserId: input.userId,
          targetEmail: targetUser.email,
          performedBy: ctx.user.email || ctx.user.openId,
        },
      });

      return {
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.characterName || updatedUser.name || 'Usuario',
          role: updatedUser.role,
          isActive: updatedUser.isActive,
        },
      };
    }),

  // Cambiar el rol de un usuario
  updateUserRole: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(VALID_ROLES),
    }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }

      // No permitir cambiar el propio rol
      if (targetUser.id === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No puedes cambiar tu propio rol.',
        });
      }

      const previousRole = targetUser.role;
      const updatedUser = await setUserRole(input.userId, input.role);

      // Registrar auditoría
      await createAuditLog({
        userId: ctx.user.id,
        action: 'USER_ROLE_CHANGED',
        details: {
          targetUserId: input.userId,
          targetEmail: targetUser.email,
          previousRole,
          newRole: input.role,
          performedBy: ctx.user.email || ctx.user.openId,
        },
      });

      return {
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.characterName || updatedUser.name || 'Usuario',
          role: updatedUser.role,
          isActive: updatedUser.isActive,
        },
      };
    }),

  // Eliminar una cuenta de usuario
  deleteUser: superAdminProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }

      // No permitir eliminar al propio Super Admin
      if (targetUser.id === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No puedes eliminar tu propia cuenta.',
        });
      }

      // No permitir eliminar a otros Super Admins
      if (targetUser.role === 'super_admin') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No puedes eliminar la cuenta de otro Super Admin.',
        });
      }

      const deletedUser = await deleteUser(input.userId);

      // Registrar auditoría
      await createAuditLog({
        userId: ctx.user.id,
        action: 'USER_DELETED',
        details: {
          targetUserId: input.userId,
          targetEmail: targetUser.email,
          targetRole: targetUser.role,
          performedBy: ctx.user.email || ctx.user.openId,
        },
      });

      return {
        success: true,
        message: `Usuario ${deletedUser.email} eliminado correctamente.`,
        user: {
          id: deletedUser.id,
          email: deletedUser.email,
          name: deletedUser.characterName || deletedUser.name || 'Usuario',
          role: deletedUser.role,
        },
      };
    }),

  // Cambiar la contraseña de un usuario (Solo Super Admin)
  changeUserPassword: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      newPassword: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
    }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }

      // No permitir cambiar la contraseña de otros Super Admins (excepto la propia)
      if (targetUser.role === 'super_admin' && targetUser.id !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'No puedes cambiar la contraseña de otro Super Admin.',
        });
      }

      const hashedPassword = await hashPassword(input.newPassword);
      await updateUserPassword(input.userId, hashedPassword);

      // Registrar auditoría
      await createAuditLog({
        userId: ctx.user.id,
        action: 'USER_PASSWORD_CHANGED_BY_ADMIN',
        details: {
          targetUserId: input.userId,
          targetEmail: targetUser.email,
          performedBy: ctx.user.email || ctx.user.openId,
        },
      });

      return {
        success: true,
        message: `Contraseña de ${targetUser.email} actualizada correctamente.`,
      };
    }),
});
