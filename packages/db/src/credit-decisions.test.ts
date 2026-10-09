// Same setup as notes.test.ts: a fresh in-memory SQLite database with the
// real migrations, so the new table's migration is exercised too.
import { Database as Sqlite } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { listDecisions, recordDecision } from "./credit-decisions.ts";
import type { Database } from "./schema.ts";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../migrations");

let db: Database;

beforeEach(() => {
  const sqlite = drizzle(new Sqlite(":memory:"));
  migrate(sqlite, { migrationsFolder: MIGRATIONS_FOLDER });
  db = sqlite;
});

const decision = (applicantKey: string, value: "approved" | "rejected") => ({
  applicantKey,
  applicantName: `Applicant ${applicantKey}`,
  decidedBy: "user_1",
  decision: value,
  note: null,
  proposedOutcome: "reject" as const,
});

test("recordDecision stores the decision and returns plain JSON", async () => {
  const stored = await recordDecision(db, {
    ...decision("A3", "rejected"),
    note: "agreed",
  });
  expect(stored.decision).toBe("rejected");
  expect(stored.note).toBe("agreed");
  expect(typeof stored.id).toBe("string");
  expect(new Date(stored.createdAt).toISOString()).toBe(stored.createdAt);
});

test("decisions are kept, newest first, and filter by applicant", async () => {
  await recordDecision(db, decision("A2", "rejected"));
  await recordDecision(db, decision("A3", "approved"));
  await recordDecision(db, decision("A3", "rejected"));

  const a3 = await listDecisions(db, { applicantKey: "A3" });
  expect(a3.map((row) => row.decision)).toEqual(["rejected", "approved"]);
  expect(await listDecisions(db)).toHaveLength(3);
  expect(await listDecisions(db, { limit: 1 })).toHaveLength(1);
});
