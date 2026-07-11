import { router, protectedProcedure } from "../_core/trpc";
import { getAuditLogs } from "../db";

// Audit log: contiene IPs de login, intentos fallidos, acciones de usuarios.
// Requiere sesión para leerlo — antes era publicProcedure y se filtraba esa
// información sin autenticación (CWE-200: Exposure of Sensitive Information).
export const auditLogsRouter = router({
  list: protectedProcedure.query(async () => {
    return await getAuditLogs();
  }),
});
