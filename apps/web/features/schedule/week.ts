import { isoWeekdayOf, shiftIsoDate } from "../../lib/tenant-date";

/**
 * The timetable is effective-dated: a lesson block is on the timetable
 * from `effective_from` through `effective_until` (both inclusive, absent
 * `effective_until` meaning to the end of the year), and the grid shows one
 * Monday-Sunday week at a time. These helpers work on "YYYY-MM-DD" strings,
 * the form the API and the date pickers use, and compare them as strings
 * (ISO dates sort lexically).
 */

/** The Monday of the ISO week containing `iso`. */
export function startOfIsoWeek(iso: string): string {
  return shiftIsoDate(iso, 1 - isoWeekdayOf(iso));
}

/** The seven dates, Monday through Sunday, of the week starting `weekStart`. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftIsoDate(weekStart, index));
}

/** The date of weekday `dayOfWeek` (1 Monday .. 7 Sunday) in the week starting `weekStart`. */
export function cellDate(weekStart: string, dayOfWeek: number): string {
  return shiftIsoDate(weekStart, dayOfWeek - 1);
}

/** Whether `iso` falls in the week starting `weekStart`. */
export function inWeek(weekStart: string, iso: string): boolean {
  return iso >= weekStart && iso <= shiftIsoDate(weekStart, 6);
}

/** The bounds of a block or schedule version. */
export interface EffectiveRange {
  effective_from: string;
  effective_until?: string;
}

/** Whether the block is on the timetable on `iso` (bounds inclusive; the weekday is not checked). */
export function blockActiveOn(block: EffectiveRange, iso: string): boolean {
  return (
    iso >= block.effective_from &&
    (block.effective_until === undefined || iso <= block.effective_until)
  );
}

/** The later of two dates; an absent one loses. */
function later(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a > b ? a : b;
}

/**
 * The date a new lesson or a dated change starts on by default: the
 * earliest the server accepts (`min`, for a block with history) or the
 * year's start, but never before today nor before the date the person was
 * looking at (`preferred`, the cell or week they acted on), clamped into
 * the academic year. Any bound may be unknown.
 */
export function defaultEffectiveFrom({
  today,
  preferred,
  yearStart,
  yearEnd,
  min,
}: {
  today: string;
  preferred?: string;
  yearStart?: string;
  yearEnd?: string;
  min?: string;
}): string {
  const floor = later(min ?? yearStart, today) ?? today;
  let date = later(floor, preferred) ?? floor;
  if (yearStart !== undefined && date < yearStart) date = yearStart;
  if (yearEnd !== undefined && date > yearEnd) date = yearEnd;
  return date;
}
