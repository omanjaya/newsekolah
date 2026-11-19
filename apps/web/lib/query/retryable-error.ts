import { ApiError } from "@newsekolah/api-client";

/**
 * Whether asking again could succeed. A 4xx ApiError is the server's
 * considered answer to this request (no access, a missing record, a
 * validation rule), so a retry only repeats it; a 5xx, a network failure
 * or anything else may be transient. The query client's automatic retry
 * and every "try again" button share this rule.
 */
export function isRetryableError(error: unknown): boolean {
  return !(error instanceof ApiError && error.status < 500);
}
