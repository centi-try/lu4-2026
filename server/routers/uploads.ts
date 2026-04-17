import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";

export const uploadsRouter = router({
  uploadImage: publicProcedure
    .input(z.object({ fileName: z.string(), fileData: z.string() }))
    .mutation(async ({ input }) => {
      return { success: true, url: `https://placeholder.com/${input.fileName}` };
    }),
});
