import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getAuditLogs } from "../db";

export const auditLogsRouter = router({
  list: publicProcedure.query(async () => {
    return await getAuditLogs();
  }),
});
