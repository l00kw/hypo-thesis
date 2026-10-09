// Runs against a throwaway in-memory SQLite database with the same migrations
// D1 gets, like notes.test.ts.
import { Database as Sqlite } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
  applicantKey,
  type CreditDecisionsService,
  createCreditDecisionsService,
} from "./credit-decisions.ts";
import { DOSSIERS, type Dossier } from "./mortgage-dossiers.ts";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../db/migrations");

let decisions: CreditDecisionsService;

beforeEach(() => {
  const db = drizzle(new Sqlite(":memory:"));
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  decisions = createCreditDecisionsService(db);
});

const uploaded = (): Dossier => ({ ...(DOSSIERS[2] as Dossier), id: "UP" });

test("records who decided and what the rules proposed", async () => {
  const stored = await decisions.record(
    {
      decision: "rejected",
      note: "  Tragbarkeit nicht gegeben  ",
      target: { id: "A3" },
    },
    "user_officer"
  );
  expect(stored.applicantKey).toBe("A3");
  expect(stored.applicantName).toBe("Daniel Schmid");
  expect(stored.proposedOutcome).toBe("reject");
  expect(stored.decidedBy).toBe("user_officer");
  expect(stored.note).toBe("Tragbarkeit nicht gegeben");
  expect(stored.byYou).toBe(true);
});

test("the officer may overrule the rules, and both are kept", async () => {
  const stored = await decisions.record(
    { decision: "approved", target: { id: "A2" } },
    "user_officer"
  );
  expect(stored.decision).toBe("approved");
  expect(stored.proposedOutcome).toBe("reject");
  expect(stored.note).toBeNull();
});

test("deciding again keeps the history, newest first", async () => {
  await decisions.record(
    { decision: "approved", target: { id: "A1" } },
    "user_a"
  );
  await decisions.record(
    { decision: "rejected", target: { id: "A1" } },
    "user_b"
  );
  await decisions.record(
    { decision: "rejected", target: { id: "A3" } },
    "user_a"
  );

  const a1 = await decisions.list({ target: { id: "A1" } }, "user_a");
  expect(a1.map((row) => [row.decision, row.byYou])).toEqual([
    ["rejected", false],
    ["approved", true],
  ]);
  expect(await decisions.list({}, "user_a")).toHaveLength(3);
});

test("an uploaded dossier is found again by its content", async () => {
  await decisions.record(
    { decision: "rejected", target: { dossier: uploaded() } },
    "user_a"
  );
  const again = await decisions.list(
    { target: { dossier: uploaded() } },
    "user_a"
  );
  expect(again).toHaveLength(1);
  expect(again.every((row) => row.applicantKey.startsWith("UP-"))).toBe(true);

  const changed = {
    ...uploaded(),
    salesDocumentation: { ...uploaded().salesDocumentation, price: 1 },
  };
  expect(await applicantKey({ dossier: changed })).not.toBe(
    await applicantKey({ dossier: uploaded() })
  );
});

test("rejects unknown applicants and overlong notes", async () => {
  await expect(
    decisions.record({ decision: "approved", target: { id: "ZZ" } }, "user_a")
  ).rejects.toThrow("Unknown applicant.");
  await expect(
    decisions.record(
      { decision: "approved", note: "x".repeat(501), target: { id: "A1" } },
      "user_a"
    )
  ).rejects.toThrow("at most 500 characters");
});
