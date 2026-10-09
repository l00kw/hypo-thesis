import {
  listDecisionsInput,
  recordDecisionInput,
} from "@repo/services/credit-decisions";
import { protectedProcedure, router } from "../init.ts";

// Step 9: only signed-in users may see or record a credit officer decision.
// The user id comes from the Clerk session, never from the input.
export const decisionsRouter = router({
  list: protectedProcedure
    .input(listDecisionsInput)
    .query(({ ctx, input }) => ctx.services.decisions.list(input, ctx.userId)),
  record: protectedProcedure
    .input(recordDecisionInput)
    .mutation(({ ctx, input }) =>
      ctx.services.decisions.record(input, ctx.userId)
    ),
});
