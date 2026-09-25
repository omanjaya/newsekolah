import type { StatusName } from "@newsekolah/ui";

/**
 * Maps a status code to its `packages/ui-tokens` design-token family, for
 * the default attendance status policy
 * (`apps/api/internal/modules/attendance/domain/policy.go`'s
 * `DefaultStatusPolicy`) plus the daily report's synthetic "INCOMPLETE"
 * aggregate. Every tenant starts on these five codes. Shared across
 * features (attendance's own roster and status controls, and other
 * screens that show a student's attendance status) so the code-to-colour
 * mapping never drifts between screens.
 *
 * A tenant that reconfigures its status policy (custom codes) has no
 * design token here; callers fall back to the status's own `color` hex
 * from the API (`AttendanceStatusDef.color`) via inline style, so an
 * unrecognised code still gets a colour, just not a themed one.
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
