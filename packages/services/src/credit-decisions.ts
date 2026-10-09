// Step 9 of the mortgage check: the credit officer's decision, stored.
//
// The officer decides; the rules only propose. The proposed outcome stored
// next to each decision is recomputed here from the dossier, never taken from
// the browser, so the record shows what the rules said at that moment.
// Decisions are append-only: deciding again adds a row, and the newest row is
// the current decision.
import type { Database } from "@repo/db";
import { listDecisions, recordDecision } from "@repo/db/credit-decisions";
import { type CreditDecision, DECISION_NOTE_MAX_LENGTH } from "@repo/db/shared";
import { z } from "zod";
import {
  type ApplicantTarget,
  applicantTargetInput,
  resolveTarget,
} from "./mortgage.ts";

export const recordDecisionInput = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z
    .string()
    .trim()
    .max(
      DECISION_NOTE_MAX_LENGTH,
      `The note must be at most ${DECISION_NOTE_MAX_LENGTH} characters.`
    )
    .optional(),
  target: applicantTargetInput,
});

/** One applicant's history, or (no target) the latest decisions overall. */
export const listDecisionsInput = z.object({
  target: applicantTargetInput.optional(),
});

export type RecordDecisionInput = z.input<typeof recordDecisionInput>;
export type ListDecisionsInput = z.input<typeof listDecisionsInput>;

/** A stored decision, plus whether the caller made it. */
export interface DecisionView extends CreditDecision {
  byYou: boolean;
}

const UPLOAD_KEY_PREFIX = "UP-";
const UPLOAD_KEY_HEX_CHARS = 16;

/** JSON with sorted keys, so the same dossier always hashes the same. */
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * Built-in applicants keep their id. An uploaded dossier is not stored, so it
 * is keyed by a hash of its content: uploading the same documents again finds
 * the same history.
 */
export const applicantKey = async (
  target: ApplicantTarget
): Promise<string> => {
  if (!("dossier" in target)) {
    return target.id;
  }
  const bytes = new TextEncoder().encode(canonicalJson(target.dossier));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${UPLOAD_KEY_PREFIX}${hex.slice(0, UPLOAD_KEY_HEX_CHARS)}`;
};

export interface CreditDecisionsService {
  /** Newest first. */
  list: (input: ListDecisionsInput, userId: string) => Promise<DecisionView[]>;
  /** Records the signed-in officer's decision on one applicant. */
  record: (input: RecordDecisionInput, userId: string) => Promise<DecisionView>;
}

const view = (decision: CreditDecision, userId: string): DecisionView => ({
  ...decision,
  byYou: decision.decidedBy === userId,
});

export const createCreditDecisionsService = (
  db: Database
): CreditDecisionsService => ({
  list: async (input, userId) => {
    const { target } = listDecisionsInput.parse(input);
    const key = target ? await applicantKey(target) : undefined;
    const decisions = await listDecisions(db, { applicantKey: key });
    return decisions.map((decision) => view(decision, userId));
  },
  record: async (input, userId) => {
    const { decision, note, target } = recordDecisionInput.parse(input);
    const check = resolveTarget(target);
    const stored = await recordDecision(db, {
      applicantKey: await applicantKey(target),
      applicantName: check.dossier.application.name,
      decidedBy: userId,
      decision,
      note: note ? note : null,
      proposedOutcome: check.decision.outcome,
    });
    return view(stored, userId);
  },
});
