import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { getSalesCycles, createSalesCycle, closeSalesCycle } from "../db";

const CreateSalesCycleSchema = z.object({
  name: z.string(),
});

// FIX: Esquema extendido para recibir todos los datos necesarios del cliente
const CloseSalesCycleSchema = z.object({
  id: z.number().optional(),
  type: z.enum(["DIARIO", "SEMANAL"]).optional(),
  label: z.string().optional(),
  totalRevenue: z.number(),
  totalProfit: z.number(),
  profitByCharacter: z.record(z.string(), z.number()).optional(),
  itemsSold: z.array(z.object({ itemId: z.number(), quantity: z.number() })).optional(),
  closedBy: z.string().optional(),
  startedAt: z.string().optional(),
});

export const salesCyclesRouter = router({
  list: publicProcedure.query(async () => {
    return await getSalesCycles();
  }),

  create: protectedProcedure
    .input(CreateSalesCycleSchema)
    .mutation(async ({ input }) => {
      await createSalesCycle({
        name: input.name,
        startDate: new Date(),
        status: "OPEN",
        totalRevenue: 0,
        totalProfit: 0,
      });
      return { success: true };
    }),

  close: protectedProcedure
    .input(CloseSalesCycleSchema)
    .mutation(async ({ ctx, input }) => {
      // FIX: Pasar todos los datos al closeSalesCycle para que genere el ciclo correcto
      await closeSalesCycle(input.id || 0, {
        type: input.type || "SEMANAL",
        label: input.label,
        totalRevenue: input.totalRevenue,
        totalProfit: input.totalProfit,
        profitByCharacter: input.profitByCharacter || {},
        itemsSold: input.itemsSold || [],
        // FIX: Registrar quién cerró el ciclo usando el usuario autenticado
        closedBy: ctx.user?.characterName || ctx.user?.name || "Administrador",
        closedByUserId: ctx.user?.id,
        startedAt: input.startedAt,
      });
      return { success: true };
    }),
});
