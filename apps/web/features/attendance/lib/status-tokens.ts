import type { StatusName } from "@newsekolah/ui";

// The code-to-token mapping moved to lib/attendance-status.ts once another
// screen needed the same status colours; re-exported here so every
// existing import in this feature keeps working unchanged.
export { statusToken } from "../../../lib/attendance-status";

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
