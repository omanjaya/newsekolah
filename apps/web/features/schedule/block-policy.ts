import type { ScheduleBlock } from "./api";
import { cellDate, earlierDate } from "./week";

/**
 * What the editor may do with a lesson block, read from the policy the
 * server sends a schedule manager with every block. History no longer
 * locks a block: a block with recorded attendance, a substitution or a
 * supervision visit is changed or removed from a date after it ("Berlaku
 * mulai"). Only two blocks are locked, each with its own reason: one still
 * on the timetable whose remaining lessons all already have history (the
 * server's reason SCHEDULE_CHANGE_BEFORE_HISTORY), and one that has ended.
 * Without a policy (a reader who cannot manage the timetable) nothing is
 * offered anyway.
 */
export function blockLockedReasonKey(
  block: ScheduleBlock,
): "blockEnded" | "blockBoundByHistory" | undefined {
  const policy = block.mutation_policy;
  if (!policy || (policy.can_edit && policy.can_delete)) return undefined;
  return policy.reason === "SCHEDULE_CHANGE_BEFORE_HISTORY" ? "blockBoundByHistory" : "blockEnded";
}

/** Whether an edit or delete of the block must say from which date it takes effect. */
export function needsEffectiveDate(block: ScheduleBlock): boolean {
  return block.mutation_policy?.requires_effective_from === true;
}

/**
 * The earliest "Berlaku mulai" the server accepts for the block, when it
 * has history: after its last history date, and tomorrow rather than today
 * once today's lesson has begun.
 */
export function minEffectiveFrom(block: ScheduleBlock): string | undefined {
  return block.mutation_policy?.min_effective_from;
}

/**
 * The latest "Berlaku mulai" for the block: the year's end, or the block's
 * own last date when it already has one (a lesson removed from a later
 * date), since it no longer takes place after that.
 */
export function maxEffectiveFrom(
  block: ScheduleBlock,
  yearEnd: string | undefined,
): string | undefined {
  return earlierDate(yearEnd, block.effective_until);
}

/** What `effectiveCaption` says about a block's dates in the week shown. */
export interface EffectiveCaption {
  key: "startsOn" | "endsOn" | "onlyOn";
  /** The first date the caption names: the start, or the end for "endsOn". */
  date: string;
  /** The block's last date, for "onlyOn" (the same as `date` for one lesson). */
  until?: string;
}

/**
 * A note for a block that does not cover the whole week shown: it starts
 * after the week's Monday ("startsOn"), ends before its Sunday ("endsOn"),
 * or both ("onlyOn": a version whose every lesson falls in this week, such
 * as one lesson kept when the rest was removed from the next day on).
 * `weekStart` is the Monday of the week shown.
 */
export function effectiveCaption(block: ScheduleBlock, weekStart: string): EffectiveCaption | null {
  const starts = block.effective_from > weekStart;
  const until = block.effective_until;
  const ends = until !== undefined && until < cellDate(weekStart, 7);
  if (starts && ends) return { key: "onlyOn", date: block.effective_from, until };
  if (starts) return { key: "startsOn", date: block.effective_from };
  if (ends) return { key: "endsOn", date: until };
  return null;
}
