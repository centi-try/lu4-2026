import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDashboardMetrics } from "../db";

export const dashboardRouter = router({
  metrics: protectedProcedure.query(async () => {
    return await getDashboardMetrics();
  }),
});
