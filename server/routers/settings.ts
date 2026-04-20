import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { hashPassword } from "../_core";
import { updateUserPassword, createAuditLog } from "../db";

export const settingsRouter = router({
  getSettings: publicProcedure.query(async ({ ctx }) => {
    return {
      userId: ctx.user?.id,
      role: ctx.user?.role,
      email: ctx.user?.email,
    };
  }),

  updateRole: protectedProcedure
    .input(z.object({ role: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return { success: true, role: input.role };
    }),

  // Cambiar mi propia contraseña
  changeMyPassword: protectedProcedure
    .input(z.object({
      newPassword: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
    }))
    .mutation(async ({ ctx, input }) => {
      const hashedPassword = await hashPassword(input.newPassword);
      await updateUserPassword(ctx.user.id, hashedPassword);

      // Registrar auditoría
      await createAuditLog({
        userId: ctx.user.id,
        action: 'USER_PASSWORD_CHANGED_BY_SELF',
        detail: `Cambió su propia contraseña.`,
        details: {
          performedBy: ctx.user.email || ctx.user.openId,
        },
      });

      return {
        success: true,
        message: 'Tu contraseña ha sido actualizada correctamente.',
      };
    }),
});
