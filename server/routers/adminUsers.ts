import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hashPassword } from '../_core';
import { router, protectedProcedure } from '../_core/trpc';
import { getAllUsers, setUserActive, setUserRole, setUserLegacyAccess, setUserCpAccess, getUserById, deleteUser, createAuditLog, updateUserPassword, listUserRaidAccess, updateUserProfile, getClans, getCommandParties, getAvailableClasses, addWarehouseCPMember, removeWarehouseCPMember, getWarehouseCPMembers, resetLoginAttempts, getInvitationCode, setInvitationCode, generateRandomInvitationCode } from '../db';

// Middleware de Super Admin: solo permite acceso a usuarios con rol 'super_admin'
const superAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Acceso denegado. Solo el Administrador del Sistema puede realizar esta acción.',
    });
  }
  return next({ ctx });
});

const VALID_ROLES = ['user', 'mapper', 'admin', 'super_admin'] as const;

export const adminUsersRouter = router({
  // Listar todos los usuarios registrados
  listUsers: superAdminProcedure.query(async ({ ctx }) => {
    const [users, raidAccessList] = await Promise.all([getAllUsers(), listUserRaidAccess()]);
    const raidMap = new Map((raidAccessList as any[]).map((a: any) => [Number(a.userId), a.accessLevel]));
    return users.map((u: any) => ({
      ...u,
      raidAccessLevel: raidMap.get(Number(u.id)) || null,
    }));
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
          message: 'No puedes desactivar la cuenta de otro Administrador del Sistema.',
        });
      }

      const updatedUser = await setUserActive(input.userId, input.isActive);

      // Registrar auditoría
      const targetLabel = targetUser.characterName || targetUser.name || targetUser.email;
      await createAuditLog({
        userId: ctx.user.id,
        action: input.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        detail: input.isActive
          ? `Activó la cuenta de ${targetLabel}.`
          : `Desactivó la cuenta de ${targetLabel}.`,
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
      const targetLabelRole = targetUser.characterName || targetUser.name || targetUser.email;
      await createAuditLog({
        userId: ctx.user.id,
        action: 'USER_ROLE_CHANGED',
        detail: `Cambió el rol de ${targetLabelRole} de ${previousRole} a ${input.role}.`,
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
          message: 'No puedes eliminar la cuenta de otro Administrador del Sistema.',
        });
      }

      const deletedUser = await deleteUser(input.userId);

      // Registrar auditoría
      const targetLabelDel = targetUser.characterName || targetUser.name || targetUser.email;
      await createAuditLog({
        userId: ctx.user.id,
        action: 'USER_DELETED',
        detail: `Eliminó la cuenta de ${targetLabelDel} (${targetUser.email}).`,
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
          message: 'No puedes cambiar la contraseña de otro Administrador del Sistema.',
        });
      }

      const hashedPassword = await hashPassword(input.newPassword);
      await updateUserPassword(input.userId, hashedPassword);

      // Registrar auditoría
      const targetLabelPwd = targetUser.characterName || targetUser.name || targetUser.email;
      await createAuditLog({
        userId: ctx.user.id,
        action: 'USER_PASSWORD_CHANGED_BY_ADMIN',
        detail: `Cambió la contraseña de ${targetLabelPwd}.`,
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

  toggleLegacyAccess: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      legacyAccess: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }

      if (targetUser.role === 'super_admin') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'El Administrador del Sistema siempre tiene acceso al menú antiguo.',
        });
      }

      const updatedUser = await setUserLegacyAccess(input.userId, input.legacyAccess);

      const targetLabel = targetUser.characterName || targetUser.name || targetUser.email;
      await createAuditLog({
        userId: ctx.user.id,
        action: input.legacyAccess ? 'LEGACY_ACCESS_ENABLED' : 'LEGACY_ACCESS_DISABLED',
        detail: input.legacyAccess
          ? `Activó acceso al menú antiguo para ${targetLabel}.`
          : `Desactivó acceso al menú antiguo para ${targetLabel}.`,
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
          legacyAccess: updatedUser.legacyAccess,
        },
      };
    }),

  // Acceso exclusivo a Reparticiones CP (toggle por usuario). Al activarlo, el
  // usuario solo verá/entrará a ese módulo. Reemplaza al antiguo rol dedicado.
  toggleCpAccess: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      cpAccess: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }

      if (targetUser.role === 'super_admin') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'El Administrador del Sistema ya tiene acceso a todos los módulos.',
        });
      }

      const updatedUser = await setUserCpAccess(input.userId, input.cpAccess);

      const targetLabel = targetUser.characterName || targetUser.name || targetUser.email;
      await createAuditLog({
        userId: ctx.user.id,
        action: input.cpAccess ? 'CP_ACCESS_ENABLED' : 'CP_ACCESS_DISABLED',
        detail: input.cpAccess
          ? `Activó acceso exclusivo a Reparticiones CP para ${targetLabel}.`
          : `Desactivó acceso a Reparticiones CP para ${targetLabel}.`,
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
          cpAccess: updatedUser.cpAccess,
        },
      };
    }),

  // Fetch clans, CPs and classes for edit modal dropdowns
  clansAndCps: superAdminProcedure.query(async () => {
    const [clans, cps, classes] = await Promise.all([
      getClans(),
      getCommandParties(),
      getAvailableClasses(),
    ]);
    return {
      clans: clans.map((c: any) => ({ id: Number(c.id), name: c.name })),
      commandParties: cps.map((cp: any) => ({
        id: Number(cp.id),
        name: cp.name,
        clanId: Number(cp.clanId),
      })),
      availableClasses: classes.map((c: any) => ({ id: Number(c.id), name: c.name })),
    };
  }),

  // Update user profile (email, characterName, clan, CP, class)
  updateProfile: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      email: z.string().email().optional(),
      characterName: z.string().min(2).optional(),
      raidClanId: z.number().nullable().optional(),
      raidCpId: z.number().nullable().optional(),
      classMain: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }

      const oldCpId = targetUser.raidCpId || null;
      const newCpId = input.raidCpId !== undefined ? input.raidCpId : oldCpId;

      try {
        const updated = await updateUserProfile(input.userId, {
          email: input.email,
          characterName: input.characterName,
          raidClanId: input.raidClanId,
          raidCpId: input.raidCpId,
          classMain: input.classMain,
        });

        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
        }

        // Sync warehouse CP membership when CP changes
        if (input.raidCpId !== undefined && Number(oldCpId) !== Number(newCpId)) {
          // Remove from old warehouse CP (find the warehouse CP that matches the raid CP)
          if (oldCpId) {
            try {
              const allWMembers = await getWarehouseCPMembers();
              const oldMembership = allWMembers.find(
                (m: any) => Number(m.userId) === Number(input.userId)
              );
              if (oldMembership) {
                await removeWarehouseCPMember(Number(oldMembership.cpId), input.userId);
              }
            } catch { /* best effort */ }
          }
          // Add to new warehouse CP (find warehouse CP matching new raid CP name)
          if (newCpId) {
            try {
              const raidCps = await getCommandParties();
              const raidCp = raidCps.find((cp: any) => Number(cp.id) === Number(newCpId));
              if (raidCp) {
                const { getWarehouseCPs } = await import('../db');
                const warehouseCps = await getWarehouseCPs();
                const matchingWCp = warehouseCps.find(
                  (wcp: any) => String(wcp.name).toLowerCase() === String(raidCp.name).toLowerCase()
                );
                if (matchingWCp) {
                  await addWarehouseCPMember(Number(matchingWCp.id), input.userId);
                }
              }
            } catch { /* best effort */ }
          }
        }

        // Audit log
        const changes: string[] = [];
        if (input.email && input.email !== targetUser.email) changes.push(`email: ${targetUser.email} → ${input.email}`);
        if (input.characterName && input.characterName !== targetUser.characterName) changes.push(`nombre: ${targetUser.characterName} → ${input.characterName}`);
        if (input.raidClanId !== undefined) changes.push(`clan: ${targetUser.raidClanId || 'ninguno'} → ${input.raidClanId || 'ninguno'}`);
        if (input.raidCpId !== undefined) changes.push(`CP: ${oldCpId || 'ninguna'} → ${newCpId || 'ninguna'}`);
        if (input.classMain !== undefined) changes.push(`clase: ${targetUser.classMain || 'ninguna'} → ${input.classMain || 'ninguna'}`);

        const targetLabel = targetUser.characterName || targetUser.name || targetUser.email;
        await createAuditLog({
          userId: ctx.user.id,
          action: 'USER_PROFILE_UPDATED',
          detail: `Editó el perfil de ${targetLabel}: ${changes.join(', ')}`,
          details: {
            targetUserId: input.userId,
            targetEmail: targetUser.email,
            changes,
            performedBy: ctx.user.email || ctx.user.openId,
          },
        });

        return {
          success: true,
          user: {
            id: updated.id,
            email: updated.email,
            name: updated.characterName || updated.name || 'Usuario',
            characterName: updated.characterName,
            role: updated.role,
            isActive: updated.isActive,
            raidClanId: updated.raidClanId || null,
            raidCpId: updated.raidCpId || null,
            classMain: updated.classMain || null,
          },
        };
      } catch (err: any) {
        if (err.message === 'EMAIL_DUPLICATE') {
          throw new TRPCError({ code: 'CONFLICT', message: 'El correo electrónico ya está en uso por otro usuario.' });
        }
        throw err;
      }
    }),

  // Desbloquear usuario (resetear intentos fallidos y lockout)
  unlockUser: superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      await resetLoginAttempts(input.userId);
      await createAuditLog({
        userId: ctx.user!.id,
        action: 'UNLOCK_USER',
        details: `Desbloqueó al usuario ${user.name || user.email} (ID: ${input.userId})`,
      });
      return { success: true };
    }),

  // Get current invitation code
  getInvitationCode: superAdminProcedure.query(async () => {
    const code = await getInvitationCode();
    return code;
  }),

  // Generate a new random invitation code
  generateInvitationCode: superAdminProcedure.mutation(async ({ ctx }) => {
    const newCode = generateRandomInvitationCode();
    const result = await setInvitationCode(newCode);
    await createAuditLog({
      userId: ctx.user.id,
      action: 'INVITATION_CODE_GENERATED',
      detail: `Generó nuevo código de invitación.`,
      details: {
        performedBy: ctx.user.email || ctx.user.openId,
      },
    });
    return result;
  }),
});
