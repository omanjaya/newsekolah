import { ApiError } from "@newsekolah/api-client";

/**
 * The earliest "Berlaku mulai" the server would accept, when it refused a
 * change for its date: SCHEDULE_HAS_HISTORY (a change without a date on a
 * block with history) and SCHEDULE_CHANGE_BEFORE_HISTORY (a date too early)
 * both name it in their `effective_from` detail.
 */
export function earliestEffectiveFromOf(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  if (err.code !== "SCHEDULE_HAS_HISTORY" && err.code !== "SCHEDULE_CHANGE_BEFORE_HISTORY") {
    return undefined;
  }
  return err.details?.find((detail) => detail.field === "effective_from")?.message;
}
