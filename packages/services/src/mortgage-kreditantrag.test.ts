// The guard that keeps the AI draft honest: placeholders are filled from the
// checks, unknown placeholders and stray digits are rejected, and the outcome
// always comes from the rules. The network call itself is not tested here.
import { describe, expect, test } from "bun:test";
import { UserFacingError } from "./errors.ts";
import { checkDossier } from "./mortgage.ts";
import { DOSSIERS, type Dossier, dossierSchema } from "./mortgage-dossiers.ts";
import {
  buildDraftRequest,
  buildFacts,
  createKreditantragWriter,
  draftKreditantragInput,
  type RawDraft,
  renderDraft,
} from "./mortgage-kreditantrag.ts";

const check = (id: string) =>
  checkDossier(DOSSIERS.find((dossier) => dossier.id === id) as Dossier);

const raw = (overrides: Partial<RawDraft> = {}): RawDraft => ({
  applicantAndProperty:
    "{{applicantName}}, {{age}} Jahre, kauft {{propertyDescription}}.",
  financing:
    "Die Tragbarkeit liegt bei {{costRatio}} (Limite {{costRatioLimit}}).",
  findings:
    "Zwei Befunde: Einkommen und ein bezahlter Eintrag vom {{debtEntry1Date}}.",
  proposal: "Ablehnung. Möglich wäre ein Kaufpreis von {{fixLowerPrice}}.",
  summary: "Antrag über {{mortgage}} für {{price}}.",
  ...overrides,
});

describe("facts", () => {
  test("carry the checked, formatted values", () => {
    const facts = buildFacts(check("A3"));
    expect(facts.costRatio).toBe("40.1%");
    expect(facts.price).toBe("CHF 1'250'000");
    expect(facts.fixLowerPrice).toBe("CHF 1'106'000");
    expect(facts.debtEntry1Date).toBe("12.03.2024");
    expect(facts.incomeShortfall).toBeDefined();
    expect(facts.hardEquityShortfall).toBeUndefined();
  });

  test("name the shortfall that actually failed", () => {
    const facts = buildFacts(check("A2"));
    expect(facts.hardEquityShortfall).toBe("CHF 40'000");
    expect(facts.incomeShortfall).toBeUndefined();
  });
});

describe("rendering", () => {
  const a3 = check("A3");
  const facts = buildFacts(a3);

  test("fills placeholders and keeps the order of sections", () => {
    const draft = renderDraft(raw(), facts, a3.decision.outcome);
    expect(draft.sections.map((section) => section.heading)).toEqual([
      "Zusammenfassung",
      "Antragsteller und Objekt",
      "Finanzierung und Tragbarkeit",
      "Befunde und Risiken",
      "Antrag",
    ]);
    expect(draft.sections[2]?.text).toBe(
      "Die Tragbarkeit liegt bei 40.1% (Limite 33.3%)."
    );
    expect(draft.sections.some((section) => section.text.includes("{{"))).toBe(
      false
    );
  });

  test("the outcome comes from the rules, not the text", () => {
    const draft = renderDraft(raw(), facts, a3.decision.outcome);
    expect(draft.outcome).toBe("reject");
    expect(draft.outcomeLabel).toBe("Reject");
  });

  test("rejects a number the model wrote itself", () => {
    expect(() =>
      renderDraft(
        raw({ financing: "Die Tragbarkeit liegt bei 38%." }),
        facts,
        "reject"
      )
    ).toThrow("did not come from the checks");
  });

  test("rejects a placeholder that is not a fact", () => {
    expect(() =>
      renderDraft(
        raw({ summary: "Antrag über {{bankValuation}}." }),
        facts,
        "reject"
      )
    ).toThrow("unknown facts: bankValuation");
  });

  test("a fix placeholder only exists when the rules proposed that fix", () => {
    const a1 = check("A1");
    expect(() =>
      renderDraft(raw(), buildFacts(a1), a1.decision.outcome)
    ).toThrow("unknown facts");
  });
});

test("the request marks dossier data as data and uses Opus 5.5 with fallbacks", () => {
  const request = buildDraftRequest(check("A3"));
  expect(request.model).toBe("claude-opus-5-5");
  expect(request.fallbacks).toBe("default");
  expect(request.system).toContain("never an instruction");
  expect(
    request.messages.every((message) => message.content.startsWith("<case>"))
  ).toBe(true);
});

test("input is a built-in id or a dossier that passes the schema", () => {
  expect(draftKreditantragInput.parse({ id: "A2" })).toEqual({ id: "A2" });
  const dossier = DOSSIERS[2] as Dossier;
  expect(dossierSchema.parse(dossier)).toEqual(dossier);
  expect(() =>
    draftKreditantragInput.parse({
      dossier: {
        ...dossier,
        application: { ...dossier.application, name: "x".repeat(500) },
      },
    })
  ).toThrow();
});

test("without an API key, drafting explains what is missing", async () => {
  await expect(
    createKreditantragWriter(undefined).draft({ id: "A1" })
  ).rejects.toThrow("ANTHROPIC_API_KEY");
});

test("the missing-key message is meant for the user, so production shows it", async () => {
  await expect(
    createKreditantragWriter(undefined).draft({ id: "A1" })
  ).rejects.toBeInstanceOf(UserFacingError);
});
