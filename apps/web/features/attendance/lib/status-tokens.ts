import type { StatusName } from "@newsekolah/ui";

/**
 * Maps a status code to its `packages/ui-tokens` design-token family, for
 * the default attendance status policy
 * (`apps/api/internal/modules/attendance/domain/policy.go`'s
 * `DefaultStatusPolicy`) plus the daily report's synthetic "INCOMPLETE"
 * aggregate. Every tenant starts on these five codes, and this is the same
 * mapping `attendance-daily-sessions.tsx` already used locally before this
 * moved here to be shared with the roster's status control.
 *
 * A tenant that reconfigures its status policy (custom codes) has no
 * design token here; callers fall back to the status's own
 * `color` hex from the API (`AttendanceStatusDef.color`) via inline style,
 * so an unrecognised code still gets a colour, just not a themed one.
 */
const CODE_TOKEN: Record<string, StatusName> = {
  H: "present",
  S: "sick",
  I: "excused",
  D: "dispensation",
  A: "absent",
  INCOMPLETE: "late",
};

export function statusToken(code: string): StatusName | undefined {
  return CODE_TOKEN[code];
}

/**
 * Status families a bulk "mark everyone present" action must never
 * silently overwrite: each is a documented exception (a sick note, an
 * approved leave, an official dispensation), unlike an unmarked "absent"/
 * "late", which a bulk sweep back to present may still touch. See
 * `session-editor.tsx`'s `markAllPresent`.
 */
export const PROTECTED_BULK_TOKENS: ReadonlySet<StatusName> = new Set([
  "sick",
  "excused",
  "dispensation",
]);
