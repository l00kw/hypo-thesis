import {
  createMortgageService,
  mortgageCheckInput,
} from "@repo/services/mortgage";
import { analyzeDossierInput } from "@repo/services/mortgage-extract";
import { draftKreditantragInput } from "@repo/services/mortgage-kreditantrag";
import { publicProcedure, router } from "../init.ts";

// The mortgage service is pure (fixture dossiers, no database), so it needs
// nothing from the context. Thin on purpose: input schema plus one service call.
const mortgage = createMortgageService();

export const mortgageRouter = router({
  /** Upload: Claude reads the PDFs, then the same checks as the built-in dossiers. */
  analyze: publicProcedure
    .input(analyzeDossierInput)
    .mutation(({ ctx, input }) => ctx.services.mortgageUpload.analyze(input)),
  check: publicProcedure
    .input(mortgageCheckInput)
    .query(({ input }) => mortgage.check(input)),
  /** Step 8: Claude writes the Kreditantrag prose; the numbers come from the checks. */
  draftKreditantrag: publicProcedure
    .input(draftKreditantragInput)
    .mutation(({ ctx, input }) => ctx.services.kreditantrag.draft(input)),
  list: publicProcedure.query(() => mortgage.list()),
  workedExample: publicProcedure.query(() => mortgage.workedExample()),
});
