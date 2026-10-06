// Pins the rule sheet's worked example and the exercise's self-checks:
// A1 passes at ~30.7%, A2 and A3 fail for different reasons, and only A3's
// documents disagree (2 findings).
import { describe, expect, test } from "bun:test";
import {
  ageOn,
  checkDossier,
  createMortgageService,
  formatChf,
  workedExample,
} from "./mortgage.ts";
import { DOSSIERS } from "./mortgage-dossiers.ts";
import { assess, roundChf } from "./mortgage-rules.ts";

const dossier = (id: string) => {
  const found = DOSSIERS.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`No dossier ${id}`);
  }
  return checkDossier(found);
};

test("reproduces the worked example exactly", () => {
  const costs = workedExample();
  expect(roundChf(costs.equity)).toBe(200_000);
  expect(roundChf(costs.mortgage)).toBe(800_000);
  expect(roundChf(costs.firstMortgage)).toBe(666_667);
  expect(roundChf(costs.secondMortgage)).toBe(133_333);
  expect(roundChf(costs.interest)).toBe(40_000);
  expect(roundChf(costs.maintenance)).toBe(10_000);
  expect(roundChf(costs.amortization)).toBe(8889);
  expect(roundChf(costs.yearlyCost)).toBe(58_889);
  expect(roundChf(costs.requiredIncome)).toBe(176_667);
});

test("formats francs the Swiss way", () => {
  expect(formatChf(1_250_000)).toBe("CHF 1'250'000");
  expect(formatChf(8888.89)).toBe("CHF 8'889");
});

test("ages are taken on the register date", () => {
  expect(ageOn("1988-05-11", "2026-09-15")).toBe(38);
  expect(ageOn("1984-12-03", "2026-09-15")).toBe(41);
});

describe("A1 Thomas Meier", () => {
  const result = dossier("A1");

  test("extracts salary certificate and bank statement numbers", () => {
    expect(result.extraction.figures.grossIncome).toBe(165_000);
    expect(result.extraction.figures.hardEquity).toBe(200_000);
    expect(result.extraction.figures.price).toBe(900_000);
  });

  test("passes with a cost ratio of about 30.7%", () => {
    expect(result.assessment.affordability.costRatio).toBeCloseTo(0.307, 3);
    expect(result.assessment.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.decision.outcome).toBe("approve");
  });
});

describe("A2 Nicole Baumgartner", () => {
  const result = dossier("A2");

  test("fails on hard equity, not on total equity or affordability", () => {
    const { equity, affordability } = result.assessment;
    expect(equity.totalEquityPassed).toBe(true);
    expect(equity.hardEquityPassed).toBe(false);
    expect(equity.minHardEquity - equity.hardEquity).toBe(40_000);
    expect(affordability.passed).toBe(true);
    expect(result.decision.outcome).toBe("reject");
    expect(result.decision.reasons.join(" ")).toContain("Hard equity");
  });

  test("documents agree", () => {
    expect(result.findings).toHaveLength(0);
  });
});

describe("A3 Daniel Schmid", () => {
  const result = dossier("A3");

  test("fails on affordability with the certified income", () => {
    expect(result.extraction.figures.grossIncome).toBe(175_000);
    expect(result.assessment.equity.passed).toBe(true);
    expect(result.assessment.affordability.costRatio).toBeCloseTo(0.4006, 3);
    expect(result.decision.outcome).toBe("reject");
    expect(result.decision.reasons.join(" ")).toContain("Yearly costs");
  });

  test("has exactly 2 consistency findings", () => {
    expect(result.findings).toHaveLength(2);
    expect(
      result.findings.map((finding) => finding.sources[1] ?? finding.sources[0])
    ).toEqual(["salaryCertificate", "debtRegister"]);
  });
});

test("one pass and two fails", () => {
  const outcomes = createMortgageService()
    .list()
    .map((applicant) => applicant.outcome);
  expect(outcomes).toEqual(["approve", "reject", "reject"]);
});

test("every proposed fix makes the application pass", () => {
  for (const id of ["A2", "A3"]) {
    const { decision } = dossier(id);
    expect(decision.fixes.length).toBeGreaterThan(0);
    for (const fix of decision.fixes) {
      expect(assess(fix.figures).passed).toBe(true);
    }
  }
});

test("fixes are tight: A2 needs exactly CHF 40,000 more own money", () => {
  const moreEquity = dossier("A2").decision.fixes.find(
    (fix) => fix.kind === "more-equity"
  );
  expect(moreEquity?.value).toBe(40_000);
});

test("the Kreditantrag names the applicant and the recommendation", () => {
  const { kreditantrag } = dossier("A3");
  expect(kreditantrag.title).toContain("Daniel Schmid");
  expect(kreditantrag.recommendation.startsWith("Reject")).toBe(true);
  expect(kreditantrag.sections.map((section) => section.heading)).toEqual([
    "Antragsteller",
    "Objekt",
    "Finanzierung",
    "Prüfung",
    "Antrag",
  ]);
});
