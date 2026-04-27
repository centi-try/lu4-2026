import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  getClanFundSettings,
  updateClanFundSettings,
  getClanFundTransactions,
  addClanFundTransaction,
  getClanFundSummary,
  setSalesCycleClanPaid,
} from "../db";

export const clanFundRouter = router({
  getSettings: protectedProcedure.query(async () => {
    return getClanFundSettings();
  }),

  updateSettings: protectedProcedure
    .input(z.object({
      clanTaxPercent: z.number().min(0).max(100).optional(),
      internalDiscountPercent: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'super_admin') {
        throw new Error('Solo el Super Admin puede modificar la configuración del clan.');
      }
      return await updateClanFundSettings(input, ctx.user?.id);
    }),

  listTransactions: protectedProcedure.query(async () => {
    return getClanFundTransactions();
  }),

  addExpense: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      description: z.string().min(1),
      evidenceUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'super_admin') {
        throw new Error('Solo el Super Admin puede registrar gastos del clan.');
      }
      return await addClanFundTransaction({
        type: 'expense',
        amount: input.amount,
        description: input.description,
        evidenceUrl: input.evidenceUrl,
        createdBy: ctx.user?.characterName || ctx.user?.name || 'Administrador',
        createdByUserId: ctx.user?.id,
      });
    }),

  getSummary: protectedProcedure.query(async () => {
    return getClanFundSummary();
  }),

  markCyclePaid: protectedProcedure
    .input(z.object({
      cycleId: z.string(),
      paidOut: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const actorName = ctx.user?.characterName || ctx.user?.name || 'Administrador';
      return await setSalesCycleClanPaid(
        input.cycleId,
        input.paidOut,
        actorName,
        ctx.user?.id,
      );
    }),
});
