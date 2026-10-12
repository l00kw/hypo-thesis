/**
 * An error whose message is written for the person using the app ("the key
 * is not configured", "unknown applicant"). The tRPC layer shows these
 * messages in production; any other error is reported only as "Internal
 * server error", because its text can carry internals.
 */
export class UserFacingError extends Error {
  override readonly name = "UserFacingError";
}
