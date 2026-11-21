import { ApiError } from "@newsekolah/api-client";

import type { ScheduleHold } from "./api";

const HISTORY_CODES = new Set(["SCHEDULE_HAS_HISTORY", "SCHEDULE_CHANGE_BEFORE_HISTORY"]);

/**
 * The earliest "Berlaku mulai" the server would accept, when it refused a
 * change for its date: SCHEDULE_HAS_HISTORY (a change without a date on a
 * block with history) and SCHEDULE_CHANGE_BEFORE_HISTORY (a date too early)
 * both name it in their `effective_from` detail.
 */
export function earliestEffectiveFromOf(err: unknown): string | undefined {
  if (!(err instanceof ApiError) || !HISTORY_CODES.has(err.code)) return undefined;
  return err.details?.find((detail) => detail.field === "effective_from")?.message;
}

/**
 * The record that holds that earliest date there, when the refusal names
 * one: `held_by.kind` (its date as the message), `held_by.id` and, for a
 * substitution request, `held_by.status`, the error's form of
 * `MutationPolicy.held_by`.
 */
export function holdOf(err: unknown): ScheduleHold | undefined {
  if (!(err instanceof ApiError) || !HISTORY_CODES.has(err.code)) return undefined;
  const detail = (field: string) => err.details?.find((item) => item.field === field);
  const kind = detail("held_by.kind");
  const id = detail("held_by.id")?.code;
  if (!kind?.message || !id || !isHoldKind(kind.code)) return undefined;
  const status = detail("held_by.status")?.code;
  return {
    kind: kind.code,
    id,
    date: kind.message,
    ...(status === "pending" || status === "accepted" ? { status } : {}),
  };
}

function isHoldKind(value: string): value is ScheduleHold["kind"] {
  return value === "attendance" || value === "supervision" || value === "substitution";
}
