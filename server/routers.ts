import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { itemsRouter } from "./routers/items";
import { charactersRouter } from "./routers/characters";
import { salesCyclesRouter } from "./routers/salesCycles";
import { auditLogsRouter } from "./routers/auditLogs";
import { dashboardRouter } from "./routers/dashboard";
import { uploadsRouter } from "./routers/uploads";
import { settingsRouter } from "./routers/settings";
import { adminUsersRouter } from "./routers/adminUsers";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  items: itemsRouter,
  characters: charactersRouter,
  salesCycles: salesCyclesRouter,
  auditLogs: auditLogsRouter,
  dashboard: dashboardRouter,
  uploads: uploadsRouter,
  settings: settingsRouter,
  adminUsers: adminUsersRouter,
});

export type AppRouter = typeof appRouter;
