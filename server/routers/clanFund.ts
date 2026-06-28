import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  getClanFundSettings,
  updateClanFundSettings,
  getClanFundTransactions,
  addClanFundTransaction,
  getClanFundSummary,
  setSalesCycleClanPaid,
  updateClanFundTransaction,
  deleteClanFundTransaction,
} from "../db";
import fs from "fs";
import path from "path";

const EVIDENCE_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"), "clan-evidence");

function ensureEvidenceDir() {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
}

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

  uploadEvidence: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      base64Data: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'super_admin') {
        throw new Error('Solo el Super Admin puede subir evidencia.');
      }
      ensureEvidenceDir();
      const ext = path.extname(input.fileName) || '.png';
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const filePath = path.join(EVIDENCE_DIR, safeName);
      const buffer = Buffer.from(input.base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);
      return { url: `/api/clan-evidence/${safeName}` };
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

  editExpense: protectedProcedure
    .input(z.object({
      txId: z.number(),
      amount: z.number().positive().optional(),
      description: z.string().min(1).optional(),
      evidenceUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'super_admin') {
        throw new Error('Solo el Super Admin puede editar gastos del clan.');
      }
      const { txId, ...updates } = input;
      return await updateClanFundTransaction(txId, updates, ctx.user?.id);
    }),

  deleteExpense: protectedProcedure
    .input(z.object({ txId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'super_admin') {
        throw new Error('Solo el Super Admin puede eliminar gastos del clan.');
      }
      return await deleteClanFundTransaction(input.txId, ctx.user?.id);
    }),
});
