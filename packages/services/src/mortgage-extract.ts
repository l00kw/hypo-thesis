// Steps 1-3 of the mortgage process: receive uploaded PDFs, let Claude read
// them into the dossier shape (step 2, AI extract), and check that all seven
// documents are there (step 3, completeness). A complete dossier then runs
// through the same rules as the built-in ones (mortgage.ts).
//
// Claude only reads and copies numbers. It does not decide anything: the
// consistency check, the rule sheet and the decision stay in code, so the
// result for a dossier is the same whether it was typed in or uploaded.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { checkDossier, type MortgageCheck } from "./mortgage.ts";
import {
  DOCUMENTS,
  type DocumentKey,
  type Dossier,
} from "./mortgage-dossiers.ts";

export const EXTRACTION_MODEL = "claude-opus-5-5";

/** Base64 grows a file by a third: this allows PDFs up to about 7.5 MB. */
const MAX_FILE_BASE64_CHARS = 10_000_000;
const MAX_FILES = 12;
const PDF_NAME = /\.pdf$/i;

export const analyzeDossierInput = z.object({
  files: z
    .array(
      z.object({
        /** The PDF, base64-encoded, without a data: prefix. */
        data: z
          .string()
          .min(1)
          .max(MAX_FILE_BASE64_CHARS, "A file is larger than 7.5 MB."),
        name: z.string().regex(PDF_NAME, "Only PDF files can be checked."),
      })
    )
    .min(1, "Add the applicant's documents.")
    .max(MAX_FILES, `Upload at most ${MAX_FILES} files.`),
});

export type AnalyzeDossierInput = z.input<typeof analyzeDossierInput>;

const DOCUMENT_KEYS = Object.keys(DOCUMENTS) as [DocumentKey, ...DocumentKey[]];

const isoDate = z
  .string()
  .describe("ISO date YYYY-MM-DD, converted from the document's DD.MM.YYYY");
const chf = z
  .number()
  .describe("CHF amount as printed, e.g. 144780.45 for CHF 144'780.45");

/** What Claude returns. Every document section is null when that document was not uploaded. */
export const extractionSchema = z.object({
  application: z
    .object({
      address: z.string(),
      bankAndSavings: chf,
      birthDate: isoDate,
      employer: z.string(),
      name: z.string(),
      occupation: z.string(),
      pensionWithdrawal: chf,
      price: chf,
      propertyAddress: z.string(),
      propertyDescription: z.string(),
      requestedMortgage: chf,
      securities: chf,
      statedGrossIncome: chf,
      statedIncomeNote: z
        .string()
        .nullable()
        .describe(
          "Any remark printed next to the stated income, e.g. 'inkl. erwarteter Bonus'"
        ),
      totalEquity: chf,
    })
    .nullable(),
  bankStatement: z
    .object({
      asOf: isoDate,
      privateAccount: chf,
      savingsAccount: chf,
      securities: chf,
      total: chf,
    })
    .nullable(),
  debtRegister: z
    .object({
      asOf: isoDate.describe("Stichtag"),
      entries: z
        .array(
          z.object({
            amount: chf,
            creditor: z.string(),
            date: isoDate,
            status: z.string(),
          })
        )
        .describe(
          "Every listed debt enforcement; empty when the extract says keine Betreibungen"
        ),
      office: z.string(),
    })
    .nullable(),
  documents: z
    .array(
      z.object({
        fileName: z.string(),
        type: z.enum([...DOCUMENT_KEYS, "other"]),
      })
    )
    .describe(
      "One entry per uploaded file: which of the seven documents it is"
    ),
  pension: z
    .object({
      fund: z.string(),
      insuredSalary: chf,
      maxWithdrawal: chf,
      requestedWithdrawal: chf.describe("Beantragter WEF-Vorbezug"),
      retirementAssets: chf.describe("Altersguthaben"),
    })
    .nullable(),
  salaryCertificate: z
    .object({
      bonus: chf.describe("3. Unregelmässige Leistungen (Bonus)"),
      employer: z.string(),
      grossSalary: chf.describe("8. Bruttolohn total"),
      netSalary: chf.describe("11. Nettolohn"),
      year: z.number(),
    })
    .nullable(),
  salesDocumentation: z
    .object({
      area: z.string(),
      builtYear: z.number(),
      price: chf.describe("Verkaufspreis"),
      rooms: z.number(),
    })
    .nullable(),
  taxReturn: z
    .object({
      bankAssets: chf,
      debts: chf,
      netSalary: chf,
      securities: chf,
      taxableAssets: chf,
    })
    .nullable(),
});

export type Extracted = z.infer<typeof extractionSchema>;

const SYSTEM_PROMPT = `You read Swiss mortgage application documents for a bank's credit department.

An applicant's dossier has seven documents: the mortgage application form (Hypothekarantrag), the salary certificate (Lohnausweis), the tax return summary (Steuererklärung), the debt enforcement register extract (Betreibungsregisterauszug), the pension fund statement (Vorsorgeausweis), the bank statement of assets (Vermögensausweis) and the property sales documentation (Verkaufsdokumentation).

Identify which document each uploaded file is, and copy the requested fields exactly as printed in that document. Each section comes only from its own document: take the salary from the salary certificate, the stated income from the application, and so on.

The documents may disagree with each other, for example a stated income that differs from the salary certificate. Do not reconcile or correct them: a separate check compares the documents, and it needs each one's own value. Set a section to null when its document is not among the files. Amounts are CHF; Swiss formatting uses ' as the thousands separator.`;

export interface DocumentFile {
  data: string;
  name: string;
}

export const buildExtractionRequest = (files: DocumentFile[]) => ({
  betas: ["server-side-fallback-2026-07-01"],
  // A safety-classifier decline is retried on Anthropic's recommended model.
  fallbacks: "default" as const,
  max_tokens: 16_000,
  messages: [
    {
      content: [
        ...files.map((file) => ({
          source: {
            data: file.data,
            media_type: "application/pdf" as const,
            type: "base64" as const,
          },
          title: file.name,
          type: "document" as const,
        })),
        {
          text: `These are the ${files.length} uploaded files, in order: ${files.map((file) => file.name).join(", ")}. Extract the dossier.`,
          type: "text" as const,
        },
      ],
      role: "user" as const,
    },
  ],
  model: EXTRACTION_MODEL,
  output_config: {
    // Reading printed tables needs care but little reasoning.
    effort: "medium" as const,
    format: betaZodOutputFormat(extractionSchema),
  },
  system: SYSTEM_PROMPT,
});

export interface IncompleteDossier {
  documents: Extracted["documents"];
  missing: DocumentKey[];
  missingLabels: string[];
  status: "incomplete";
}

export interface AnalyzedDossier {
  check: MortgageCheck;
  documents: Extracted["documents"];
  status: "complete";
}

export type AnalysisResult = AnalyzedDossier | IncompleteDossier;

const UPLOAD_ID = "UP";

/** Step 3: either the full dossier, or the list of documents to request. */
export const toDossier = (
  extracted: Extracted
): { dossier: Dossier } | { missing: DocumentKey[] } => {
  const {
    application,
    salaryCertificate,
    taxReturn,
    debtRegister,
    pension,
    bankStatement,
    salesDocumentation,
  } = extracted;
  if (
    application &&
    salaryCertificate &&
    taxReturn &&
    debtRegister &&
    pension &&
    bankStatement &&
    salesDocumentation
  ) {
    const { propertyAddress, propertyDescription, statedIncomeNote, ...app } =
      application;
    return {
      dossier: {
        application: {
          ...app,
          statedIncomeNote: statedIncomeNote ?? undefined,
        },
        bankStatement,
        debtRegister,
        id: UPLOAD_ID,
        pension,
        property: {
          address: propertyAddress,
          description: propertyDescription,
        },
        salaryCertificate,
        salesDocumentation,
        taxReturn,
      },
    };
  }
  const missing = DOCUMENT_KEYS.filter((key) => extracted[key] === null);
  return { missing };
};

export const analyzeExtraction = (extracted: Extracted): AnalysisResult => {
  const result = toDossier(extracted);
  if ("missing" in result) {
    return {
      documents: extracted.documents,
      missing: result.missing,
      missingLabels: result.missing.map((key) => DOCUMENTS[key]),
      status: "incomplete",
    };
  }
  return {
    check: checkDossier(result.dossier),
    documents: extracted.documents,
    status: "complete",
  };
};

export interface MortgageUploadService {
  /** Reads the PDFs with Claude, then runs the completeness, consistency and rule checks. */
  analyze: (input: AnalyzeDossierInput) => Promise<AnalysisResult>;
}

/**
 * `apiKey` comes from the caller (the tRPC context reads the Worker secret);
 * the service never reads env. Without a key, analyze() rejects with a clear
 * message instead of failing at startup, so the rest of the app still works.
 */
export const createMortgageUploadService = (
  apiKey: string | undefined
): MortgageUploadService => ({
  analyze: async (input) => {
    const { files } = analyzeDossierInput.parse(input);
    if (!apiKey) {
      throw new Error(
        "Document upload needs ANTHROPIC_API_KEY, which is not configured on this server."
      );
    }
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.parse(
      buildExtractionRequest(files)
    );
    if (response.stop_reason === "refusal") {
      throw new Error(
        "The documents could not be read: the model declined the request."
      );
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      throw new Error(
        "The documents could not be read completely. Try again with fewer files."
      );
    }
    return analyzeExtraction(response.parsed_output);
  },
});
