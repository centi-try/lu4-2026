import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getCharacters, createCharacter } from "../db";

const CreateCharacterSchema = z.object({
  name: z.string().min(1),
  userId: z.number(),
});

// Requiere sesión. Antes era publicProcedure y expusimos todos los personajes
// con sus ganancias a cualquiera sin login (info de negocio).
export const charactersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // Super Admin y Mapper ven todos los personajes; User solo ve los suyos
    const role = ctx.user?.role || '';
    const isSuperAdmin = role === 'super_admin' || role === 'SUPER_ADMIN' || role === 'admin';
    const isMapper = role === 'mapper' || role === 'MAPPER';
    if (isSuperAdmin || isMapper) {
      return await getCharacters();
    }
    return await getCharacters(ctx.user.id);
  }),

  create: protectedProcedure
    .input(CreateCharacterSchema)
    .mutation(async ({ ctx, input }) => {
      await createCharacter({
        name: input.name,
        userId: input.userId,
        profitPerCycle: 0,
        totalProfit: 0,
      });
      return { success: true };
    }),
});
