import { ApiError } from "@newsekolah/api-client";

/**
 * Whether a read by id failed because there is no such record, so the
 * screen shows its not-found state (with a way on) rather than a load
 * failure whose "Coba lagi" can never succeed.
 *
 * That is a 404, and also the 400 the API answers (from its request
 * validation or its route parameter binding, both the VALIDATION_FAILED
 * envelope) when the id in the path is not a well-formed id at all (a
 * truncated or hand-edited link): every detail is an INVALID_FORMAT. Meant for detail
 * screens whose request carries nothing but the id; a list with filters
 * can fail the same way for a bad filter, which is not "not found".
 */
export function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404) return true;
  const details = error.details ?? [];
  return (
    error.status === 400 &&
    error.code === "VALIDATION_FAILED" &&
    details.length > 0 &&
    details.every((detail) => detail.code === "INVALID_FORMAT")
  );
}

/**
 * Whether a read by id was refused for this reader (a 403): the record
 * exists but belongs to someone else's scope, such as a club another
 * teacher coaches or a group another guru wali mentors. A retry can never
 * succeed, so the screen shows its no-access state with a way back.
 */
export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
