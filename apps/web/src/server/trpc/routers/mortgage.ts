import {
  createMortgageService,
  mortgageCheckInput,
} from "@repo/services/mortgage";
import { analyzeDossierInput } from "@repo/services/mortgage-extract";
import { publicProcedure, router } from "../init.ts";

// The mortgage service is pure (fixture dossiers, no database), so it needs
// nothing from the context. Thin on purpose, like routers/notes.ts.
const mortgage = createMortgageService();

export const mortgageRouter = router({
  /** Upload: Claude reads the PDFs, then the same checks as the built-in dossiers. */
  analyze: publicProcedure
    .input(analyzeDossierInput)
    .mutation(({ ctx, input }) => ctx.services.mortgageUpload.analyze(input)),
  check: publicProcedure
    .input(mortgageCheckInput)
    .query(({ input }) => mortgage.check(input)),
  list: publicProcedure.query(() => mortgage.list()),
  workedExample: publicProcedure.query(() => mortgage.workedExample()),
});
