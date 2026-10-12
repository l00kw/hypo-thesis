// What both Claude calls of the mortgage check share: the model, the
// refusal fallback, and turning a response that can't be used into a
// message the credit officer can act on.
import Anthropic from "@anthropic-ai/sdk";
import { UserFacingError } from "./errors.ts";

export const MORTGAGE_MODEL = "claude-opus-5-5";

/** A safety-classifier decline is retried on Anthropic's recommended model. */
export const FALLBACK_PARAMS = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

/**
 * Without a key the feature rejects with a clear message instead of failing
 * at startup, so the rest of the app keeps working.
 */
export const requireClient = (
  apiKey: string | undefined,
  feature: string
): Anthropic => {
  if (!apiKey) {
    throw new UserFacingError(
      `${feature} needs ANTHROPIC_API_KEY, which is not configured on this server.`
    );
  }
  return new Anthropic({ apiKey });
};

interface ParsedResponse<T> {
  parsed_output: T | null;
  stop_reason: string | null;
}

export const readParsed = <T>(response: ParsedResponse<T>, task: string): T => {
  if (response.stop_reason === "refusal") {
    throw new UserFacingError(
      `${task} failed: the model declined the request.`
    );
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new UserFacingError(`${task} did not complete. Try again.`);
  }
  return response.parsed_output;
};
