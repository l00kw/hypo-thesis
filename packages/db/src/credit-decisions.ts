import { desc, eq } from "drizzle-orm";
import { creditDecisions, type Database } from "./schema.ts";
import type { CreditDecision } from "./shared.ts";

/** How a decision is stored. Only this module sees the numeric id. */
type DecisionRow = typeof creditDecisions.$inferSelect;

const DEFAULT_LIST_LIMIT = 20;

function toDecision(row: DecisionRow): CreditDecision {
  return {
    applicantKey: row.applicantKey,
    applicantName: row.applicantName,
    createdAt: row.createdAt,
    decidedBy: row.decidedBy,
    decision: row.decision,
    id: String(row.id),
    note: row.note,
    proposedOutcome: row.proposedOutcome,
  };
}

/**
 * Newest first, for one applicant or across all of them. The id orders rows by
 * insertion, so two decisions in the same millisecond keep their order.
 */
export async function listDecisions(
  db: Database,
  options: { applicantKey?: string; limit?: number } = {}
): Promise<CreditDecision[]> {
  const query = db.select().from(creditDecisions);
  const filtered = options.applicantKey
    ? query.where(eq(creditDecisions.applicantKey, options.applicantKey))
    : query;
  const rows = await filtered
    .orderBy(desc(creditDecisions.id))
    .limit(options.limit ?? DEFAULT_LIST_LIMIT);
  return rows.map(toDecision);
}

/**
 * Stores a decision as given. Validation and the proposed outcome are the
 * caller's job: go through `@repo/services/credit-decisions`.
 */
export async function recordDecision(
  db: Database,
  input: Omit<CreditDecision, "createdAt" | "id">
): Promise<CreditDecision> {
  const [row] = await db
    .insert(creditDecisions)
    .values({ ...input, createdAt: new Date().toISOString() })
    .returning();
  if (!row) {
    throw new Error("Decision was inserted but could not be read back.");
  }
  return toDecision(row);
}
