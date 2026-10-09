import { protectedProcedure, router } from "./init.ts";
import { decisionsRouter } from "./routers/decisions.ts";
import { mortgageRouter } from "./routers/mortgage.ts";

export const appRouter = router({
  decisions: decisionsRouter,
  /** The caller's user id. The example protected procedure. */
  me: protectedProcedure.query(({ ctx }) => ({ userId: ctx.userId })),
  mortgage: mortgageRouter,
});

export type AppRouter = typeof appRouter;
