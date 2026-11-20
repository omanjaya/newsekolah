import type { ScheduleBlock } from "./api";
import { cellDate } from "./week";

/**
 * What the editor may do with a lesson block, read from the policy the
 * server sends a schedule manager with every block. History no longer
 * locks a block: a block with recorded attendance or a substitution is
 * changed or removed from a date after it ("Berlaku mulai"). Only a block
 * that has ended (or whose remaining dates are all bound by history) is
 * locked. Without a policy (a reader who cannot manage the timetable)
 * nothing is offered anyway.
 */
export function blockLockedReasonKey(block: ScheduleBlock): "blockEnded" | undefined {
  const policy = block.mutation_policy;
  if (!policy || (policy.can_edit && policy.can_delete)) return undefined;
  return "blockEnded";
}

/** Whether an edit or delete of the block must say from which date it takes effect. */
export function needsEffectiveDate(block: ScheduleBlock): boolean {
  return block.mutation_policy?.requires_effective_from === true;
}

/** The earliest "Berlaku mulai" the server accepts for the block, when it has history. */
export function minEffectiveFrom(block: ScheduleBlock): string | undefined {
  return block.mutation_policy?.min_effective_from;
}

/**
 * A note for a block that does not cover the whole week shown: it starts
 * after the week's Monday, or ends before its Sunday (a lesson changed or
 * removed from a date on). `weekStart` is the Monday of the week shown.
 */
export function effectiveCaption(
  block: ScheduleBlock,
  weekStart: string,
): { key: "startsOn" | "endsOn"; date: string } | null {
  if (block.effective_from > weekStart) return { key: "startsOn", date: block.effective_from };
  if (block.effective_until !== undefined && block.effective_until < cellDate(weekStart, 7)) {
    return { key: "endsOn", date: block.effective_until };
  }
  return null;
}
