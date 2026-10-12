// Mortgage application check (Exercise 4): documents -> extracted figures ->
// consistency findings -> rule-sheet checks -> decision proposal with fixes ->
// draft Kreditantrag. The rule sheet decides the numbers (mortgage-rules.ts);
// the credit officer makes the final call in the UI.
import { z } from "zod";
import { UserFacingError } from "./errors.ts";
import {
  DOCUMENTS,
  DOSSIERS,
  type DocumentKey,
  type Dossier,
  dossierSchema,
  REFERENCE_DATE,
} from "./mortgage-dossiers.ts";
import {
  type ApplicantFigures,
  type Assessment,
  assess,
  type CostBreakdown,
  calculateCosts,
  type Fix,
  proposeFixes,
  RULES,
  roundChf,
} from "./mortgage-rules.ts";

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/** Swiss style, whole francs: 1'250'000. Same output on server and client. */
export const formatChf = (amount: number): string =>
  `CHF ${roundChf(amount).toString().replace(THOUSANDS, "'")}`;

export const formatPercent = (ratio: number): string =>
  `${(ratio * 100).toFixed(1)}%`;

/** Full years between an ISO birth date and an ISO reference date. */
export const ageOn = (birthDate: string, onDate: string): number => {
  const [by = 0, bm = 0, bd = 0] = birthDate.split("-").map(Number);
  const [y = 0, m = 0, d = 0] = onDate.split("-").map(Number);
  const hadBirthday = m > bm || (m === bm && d >= bd);
  return y - by - (hadBirthday ? 0 : 1);
};

export interface ExtractedValue {
  kind: "chf" | "text" | "years";
  label: string;
  source: DocumentKey;
  value: number | string;
}

export interface Extraction {
  figures: ApplicantFigures;
  values: ExtractedValue[];
}

/**
 * The figures the rules run on, each from the document a bank trusts for it:
 * income from the salary certificate (not the applicant's own statement),
 * hard equity from the bank statement, pension money from the pension fund,
 * the price from the sales documentation.
 */
export const extract = (dossier: Dossier): Extraction => {
  const age = ageOn(dossier.application.birthDate, REFERENCE_DATE);
  const figures: ApplicantFigures = {
    age,
    grossIncome: dossier.salaryCertificate.grossSalary,
    hardEquity: dossier.bankStatement.total,
    pensionEquity: dossier.pension.requestedWithdrawal,
    price: dossier.salesDocumentation.price,
  };
  const values: ExtractedValue[] = [
    {
      kind: "text",
      label: "Applicant",
      source: "application",
      value: dossier.application.name,
    },
    { kind: "years", label: "Age", source: "application", value: age },
    {
      kind: "chf",
      label: "Purchase price",
      source: "salesDocumentation",
      value: figures.price,
    },
    {
      kind: "chf",
      label: "Gross salary (certified)",
      source: "salaryCertificate",
      value: figures.grossIncome,
    },
    {
      kind: "chf",
      label: "Gross income (stated by applicant)",
      source: "application",
      value: dossier.application.statedGrossIncome,
    },
    {
      kind: "chf",
      label: "Net salary",
      source: "salaryCertificate",
      value: dossier.salaryCertificate.netSalary,
    },
    {
      kind: "chf",
      label: "Bank assets (hard equity)",
      source: "bankStatement",
      value: figures.hardEquity,
    },
    {
      kind: "chf",
      label: "Pension withdrawal (WEF)",
      source: "pension",
      value: figures.pensionEquity,
    },
    {
      kind: "chf",
      label: "Pension assets",
      source: "pension",
      value: dossier.pension.retirementAssets,
    },
    {
      kind: "chf",
      label: "Debts",
      source: "taxReturn",
      value: dossier.taxReturn.debts,
    },
    {
      kind: "text",
      label: "Debt enforcement entries",
      source: "debtRegister",
      value: String(dossier.debtRegister.entries.length),
    },
  ];
  return { figures, values };
};

export interface Finding {
  detail: string;
  sources: DocumentKey[];
  title: string;
}

interface Comparison {
  a: { label: string; source: DocumentKey; value: number };
  b: { label: string; source: DocumentKey; value: number };
  title: string;
}

const AMOUNT_TOLERANCE_CHF = 1;

const compare = ({ a, b, title }: Comparison): Finding | null => {
  if (Math.abs(a.value - b.value) <= AMOUNT_TOLERANCE_CHF) {
    return null;
  }
  return {
    detail: `${a.label} ${formatChf(a.value)} (${DOCUMENTS[a.source]}) vs ${b.label} ${formatChf(b.value)} (${DOCUMENTS[b.source]}).`,
    sources: [a.source, b.source],
    title,
  };
};

/** Where the documents disagree with each other, plus debt enforcement entries. */
export const checkConsistency = (dossier: Dossier): Finding[] => {
  const { application: app } = dossier;
  const comparisons: Comparison[] = [
    {
      a: {
        label: "stated gross income",
        source: "application",
        value: app.statedGrossIncome,
      },
      b: {
        label: "certified gross salary",
        source: "salaryCertificate",
        value: dossier.salaryCertificate.grossSalary,
      },
      title: "Stated income does not match the salary certificate",
    },
    {
      a: {
        label: "net salary",
        source: "salaryCertificate",
        value: dossier.salaryCertificate.netSalary,
      },
      b: {
        label: "net salary",
        source: "taxReturn",
        value: dossier.taxReturn.netSalary,
      },
      title: "Net salary differs between salary certificate and tax return",
    },
    {
      a: {
        label: "bank and securities",
        source: "application",
        value: app.bankAndSavings + app.securities,
      },
      b: {
        label: "total assets",
        source: "bankStatement",
        value: dossier.bankStatement.total,
      },
      title: "Stated own funds do not match the bank statement",
    },
    {
      a: {
        label: "total assets",
        source: "bankStatement",
        value: dossier.bankStatement.total,
      },
      b: {
        label: "taxable assets",
        source: "taxReturn",
        value: dossier.taxReturn.taxableAssets + dossier.taxReturn.debts,
      },
      title: "Assets differ between bank statement and tax return",
    },
    {
      a: {
        label: "WEF withdrawal",
        source: "application",
        value: app.pensionWithdrawal,
      },
      b: {
        label: "requested WEF withdrawal",
        source: "pension",
        value: dossier.pension.requestedWithdrawal,
      },
      title: "Pension withdrawal differs from the pension fund statement",
    },
    {
      a: { label: "price", source: "application", value: app.price },
      b: {
        label: "sales price",
        source: "salesDocumentation",
        value: dossier.salesDocumentation.price,
      },
      title: "Purchase price differs from the sales documentation",
    },
  ];
  const findings = comparisons
    .map(compare)
    .filter((finding): finding is Finding => finding !== null);

  const incomeFinding = findings.find(
    (finding) =>
      finding.sources.includes("application") &&
      finding.sources.includes("salaryCertificate")
  );
  if (incomeFinding && app.statedIncomeNote) {
    incomeFinding.detail += ` The application says "${app.statedIncomeNote}", but the salary certificate shows a bonus of ${formatChf(dossier.salaryCertificate.bonus)}. Only certified income counts.`;
  }

  if (dossier.pension.requestedWithdrawal > dossier.pension.maxWithdrawal) {
    findings.push({
      detail: `Requested ${formatChf(dossier.pension.requestedWithdrawal)}, maximum ${formatChf(dossier.pension.maxWithdrawal)}.`,
      sources: ["pension"],
      title: "Pension withdrawal exceeds the allowed maximum",
    });
  }

  for (const entry of dossier.debtRegister.entries) {
    findings.push({
      detail: `${entry.date}: ${entry.creditor}, ${formatChf(entry.amount)}. Status: ${entry.status}.`,
      sources: ["debtRegister"],
      title: "Entry in the debt enforcement register",
    });
  }
  return findings;
};

export interface DescribedFix extends Fix {
  description: string;
}

export type Outcome = "approve" | "approve-with-conditions" | "reject";

export interface Decision {
  conditions: string[];
  fixes: DescribedFix[];
  outcome: Outcome;
  reasons: string[];
}

const describeFailures = (assessment: Assessment): string[] => {
  const { equity, affordability } = assessment;
  const reasons: string[] = [];
  if (!equity.totalEquityPassed) {
    reasons.push(
      `Equity ${formatChf(equity.equity)} is ${formatPercent(equity.equityShare)} of the price; the minimum is 20% (${formatChf(equity.minEquity)}).`
    );
  }
  if (!equity.hardEquityPassed) {
    reasons.push(
      `Hard equity (own money, not pension) ${formatChf(equity.hardEquity)} is ${formatPercent(equity.hardEquityShare)} of the price; the minimum is 10% (${formatChf(equity.minHardEquity)}). Short by ${formatChf(equity.minHardEquity - equity.hardEquity)}.`
    );
  }
  if (!affordability.passed) {
    reasons.push(
      `Yearly costs ${formatChf(affordability.yearlyCost)} are ${formatPercent(affordability.costRatio)} of the certified gross income ${formatChf(affordability.grossIncome)}; the limit is 33.3% (${formatChf(affordability.maxYearlyCost)}).`
    );
  }
  return reasons;
};

export const describeFix = (fix: Fix): string => {
  switch (fix.kind) {
    case "lower-price":
      return `Lower the purchase price to ${formatChf(fix.value)}.`;
    case "more-equity":
      return `Bring ${formatChf(fix.value)} more own money (savings, gift or inheritance; not pension).`;
    case "co-borrower":
      return `Add a co-borrower with at least ${formatChf(fix.value)} gross income per year.`;
    default:
      return "";
  }
};

export const proposeDecision = (
  figures: ApplicantFigures,
  assessment: Assessment,
  findings: Finding[]
): Decision => {
  if (!assessment.passed) {
    return {
      conditions: [],
      fixes: proposeFixes(figures).map((fix) => ({
        ...fix,
        description: describeFix(fix),
      })),
      outcome: "reject",
      reasons: describeFailures(assessment),
    };
  }
  const reasons = [
    `Equity ${formatPercent(assessment.equity.equityShare)} (hard ${formatPercent(assessment.equity.hardEquityShare)}) meets the 20% / 10% rule.`,
    `Cost ratio ${formatPercent(assessment.affordability.costRatio)} is within the 33.3% limit.`,
  ];
  if (findings.length === 0) {
    return { conditions: [], fixes: [], outcome: "approve", reasons };
  }
  return {
    conditions: findings.map(
      (finding) => `Clarify: ${finding.title.toLowerCase()}.`
    ),
    fixes: [],
    outcome: "approve-with-conditions",
    reasons,
  };
};

export interface KreditantragSection {
  heading: string;
  rows: { label: string; value: string }[];
}

export interface Kreditantrag {
  date: string;
  recommendation: string;
  sections: KreditantragSection[];
  title: string;
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  approve: "Approve",
  "approve-with-conditions": "Approve with conditions",
  reject: "Reject",
};

export const draftKreditantrag = (
  dossier: Dossier,
  assessment: Assessment,
  findings: Finding[],
  decision: Decision
): Kreditantrag => {
  const { costs, equity, affordability } = assessment;
  const app = dossier.application;
  const pass = (ok: boolean) => (ok ? "erfüllt" : "nicht erfüllt");
  return {
    date: REFERENCE_DATE,
    recommendation: `${OUTCOME_LABEL[decision.outcome]}. ${decision.reasons.join(" ")}`,
    sections: [
      {
        heading: "Antragsteller",
        rows: [
          { label: "Name", value: app.name },
          {
            label: "Geburtsdatum / Alter",
            value: `${app.birthDate} / ${ageOn(app.birthDate, REFERENCE_DATE)}`,
          },
          {
            label: "Beruf, Arbeitgeber",
            value: `${app.occupation}, ${app.employer}`,
          },
          {
            label: "Bruttolohn (Lohnausweis)",
            value: formatChf(affordability.grossIncome),
          },
        ],
      },
      {
        heading: "Objekt",
        rows: [
          {
            label: "Objekt",
            value: `${dossier.property.description}, ${dossier.property.address}`,
          },
          { label: "Kaufpreis", value: formatChf(costs.price) },
          { label: "Nutzung", value: "selbstbewohnt" },
        ],
      },
      {
        heading: "Finanzierung",
        rows: [
          { label: "Harte Eigenmittel", value: formatChf(equity.hardEquity) },
          {
            label: "Vorbezug Pensionskasse (WEF)",
            value: formatChf(equity.pensionEquity),
          },
          { label: "Hypothek total", value: formatChf(costs.mortgage) },
          {
            label: "1. Hypothek (bis 2/3)",
            value: formatChf(costs.firstMortgage),
          },
          {
            label: "2. Hypothek",
            value: `${formatChf(costs.secondMortgage)}, amortisiert in ${costs.amortizationYears} Jahren`,
          },
        ],
      },
      {
        heading: "Prüfung",
        rows: [
          {
            label: "Eigenmittel ≥ 20%",
            value: `${formatPercent(equity.equityShare)}: ${pass(equity.totalEquityPassed)}`,
          },
          {
            label: "Harte Eigenmittel ≥ 10%",
            value: `${formatPercent(equity.hardEquityShare)}: ${pass(equity.hardEquityPassed)}`,
          },
          {
            label: "Tragbarkeit ≤ 33.3%",
            value: `${formatPercent(affordability.costRatio)} (${formatChf(affordability.yearlyCost)} p.a.): ${pass(affordability.passed)}`,
          },
          {
            label: "Befunde Konsistenzprüfung",
            value:
              findings.length === 0
                ? "keine"
                : findings.map((f) => f.title).join("; "),
          },
        ],
      },
      {
        heading: "Antrag",
        rows: [
          { label: "Empfehlung", value: OUTCOME_LABEL[decision.outcome] },
          ...decision.conditions.map((condition) => ({
            label: "Auflage",
            value: condition,
          })),
          ...decision.fixes.map((fix) => ({
            label: "Lösungsvorschlag",
            value: fix.description,
          })),
        ],
      },
    ],
    title: `Kreditantrag ${dossier.id}: ${app.name}`,
  };
};

/** The rule sheet's worked example: CHF 1,000,000 with 20% equity. */
export const WORKED_EXAMPLE = { equity: 200_000, price: 1_000_000 } as const;

export const workedExample = (): CostBreakdown =>
  calculateCosts(WORKED_EXAMPLE);

export interface MortgageCheck {
  assessment: Assessment;
  decision: Decision;
  /** Document labels by key, so the UI can name sources without importing this module. */
  documents: typeof DOCUMENTS;
  dossier: Dossier;
  extraction: Extraction;
  findings: Finding[];
  kreditantrag: Kreditantrag;
}

export const checkDossier = (dossier: Dossier): MortgageCheck => {
  const extraction = extract(dossier);
  const findings = checkConsistency(dossier);
  const assessment = assess(extraction.figures);
  const decision = proposeDecision(extraction.figures, assessment, findings);
  return {
    assessment,
    decision,
    documents: DOCUMENTS,
    dossier,
    extraction,
    findings,
    kreditantrag: draftKreditantrag(dossier, assessment, findings, decision),
  };
};

const dossierIds = DOSSIERS.map((dossier) => dossier.id) as [
  string,
  ...string[],
];

/** Also the tRPC input schema, so the router and the service agree. */
export const mortgageCheckInput = z.object({
  id: z.enum(dossierIds, "Unknown applicant."),
});

export interface ApplicantSummary {
  id: string;
  name: string;
  outcome: Outcome;
  price: number;
}

export interface MortgageService {
  check: (input: z.input<typeof mortgageCheckInput>) => MortgageCheck;
  list: () => ApplicantSummary[];
  rules: () => typeof RULES;
  workedExample: () => CostBreakdown;
}

export const createMortgageService = (): MortgageService => ({
  check: (input) => {
    const { id } = mortgageCheckInput.parse(input);
    const dossier = DOSSIERS.find((candidate) => candidate.id === id);
    if (!dossier) {
      throw new UserFacingError("Unknown applicant.");
    }
    return checkDossier(dossier);
  },
  list: () =>
    DOSSIERS.map((dossier) => ({
      id: dossier.id,
      name: dossier.application.name,
      outcome: checkDossier(dossier).decision.outcome,
      price: dossier.salesDocumentation.price,
    })),
  rules: () => RULES,
  workedExample,
});

/** A built-in applicant by id, or an uploaded dossier the server re-checks. */
export const applicantTargetInput = z.union([
  z.object({ id: z.string().max(20) }),
  z.object({ dossier: dossierSchema }),
]);

export type ApplicantTarget = z.output<typeof applicantTargetInput>;

/** Uploaded: never trust a client-sent result, re-run every check here. */
export const resolveTarget = (target: ApplicantTarget): MortgageCheck => {
  if ("dossier" in target) {
    return checkDossier(target.dossier);
  }
  const dossier = DOSSIERS.find((candidate) => candidate.id === target.id);
  if (!dossier) {
    throw new UserFacingError("Unknown applicant.");
  }
  return checkDossier(dossier);
};
