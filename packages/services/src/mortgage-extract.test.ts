// The network call is not tested here (it needs a key and costs money); what
// is tested is everything around it: the request shape, the schema, the
// completeness check, and that an extraction of the same documents gives the
// same result as the built-in dossiers.
import { describe, expect, test } from "bun:test";
import { DOCUMENTS, DOSSIERS, type Dossier } from "./mortgage-dossiers.ts";
import {
  analyzeDossierInput,
  analyzeExtraction,
  buildExtractionRequest,
  createMortgageUploadService,
  type Extracted,
  extractionSchema,
} from "./mortgage-extract.ts";

/** What a correct extraction of a built-in dossier's PDFs looks like. */
const asExtraction = (dossier: Dossier): Extracted => ({
  application: {
    ...dossier.application,
    propertyAddress: dossier.property.address,
    propertyDescription: dossier.property.description,
    statedIncomeNote: dossier.application.statedIncomeNote ?? null,
  },
  bankStatement: dossier.bankStatement,
  debtRegister: dossier.debtRegister,
  documents: Object.entries(DOCUMENTS).map(([type, label]) => ({
    fileName: `${label}.pdf`,
    type: type as keyof typeof DOCUMENTS,
  })),
  pension: dossier.pension,
  salaryCertificate: dossier.salaryCertificate,
  salesDocumentation: dossier.salesDocumentation,
  taxReturn: dossier.taxReturn,
});

describe("a complete extraction", () => {
  for (const dossier of DOSSIERS) {
    test(`${dossier.id} gives the same result as the built-in dossier`, () => {
      const extraction = asExtraction(dossier);
      expect(extractionSchema.parse(extraction)).toEqual(extraction);
      const result = analyzeExtraction(extraction);
      if (result.status !== "complete") {
        throw new Error("expected a complete dossier");
      }
      const { check } = result;
      expect(check.dossier.application.name).toBe(dossier.application.name);
      expect(check.findings).toHaveLength(dossier.id === "A3" ? 2 : 0);
      expect(check.decision.outcome).toBe(
        dossier.id === "A1" ? "approve" : "reject"
      );
    });
  }
});

test("missing documents are listed instead of checked", () => {
  const extraction: Extracted = {
    ...asExtraction(DOSSIERS[0] as Dossier),
    debtRegister: null,
    pension: null,
  };
  const result = analyzeExtraction(extraction);
  expect(result.status).toBe("incomplete");
  if (result.status === "incomplete") {
    expect(result.missing).toEqual(["debtRegister", "pension"]);
    expect(result.missingLabels).toEqual([
      "04 Betreibungsregisterauszug",
      "05 Vorsorgeausweis",
    ]);
  }
});

test("the request sends every PDF as a document, on Opus 5.5 with fallbacks", () => {
  const request = buildExtractionRequest([
    { data: "AAAA", name: "02_Lohnausweis_2025.pdf" },
    { data: "BBBB", name: "06_Vermoegensausweis_Bank.pdf" },
  ]);
  expect(request.model).toBe("claude-opus-5-5");
  expect(request.fallbacks).toBe("default");
  const kinds = request.messages.flatMap((message) =>
    message.content.map((block) => block.type)
  );
  expect(kinds).toEqual(["document", "document", "text"]);
});

test("only PDFs are accepted", () => {
  expect(() =>
    analyzeDossierInput.parse({ files: [{ data: "AAAA", name: "notes.docx" }] })
  ).toThrow("Only PDF files can be checked.");
  expect(() => analyzeDossierInput.parse({ files: [] })).toThrow(
    "Add the applicant's documents."
  );
});

test("without an API key, analyze explains what is missing", async () => {
  const service = createMortgageUploadService(undefined);
  expect(service.configured).toBe(false);
  expect(createMortgageUploadService("sk-test").configured).toBe(true);
  await expect(
    service.analyze({ files: [{ data: "AAAA", name: "a.pdf" }] })
  ).rejects.toThrow("ANTHROPIC_API_KEY");
});
