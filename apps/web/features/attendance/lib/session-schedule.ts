/**
 * A lesson's fill state, for the session list's status badge
 * (docs/07-ui-ux.md). "handedOver" is one of the teacher's own lessons an
 * accepted substitute fills instead; "upcoming" is a lesson on a later day,
 * which cannot be recorded ahead of the day; "locked" is a saved lesson
 * past the viewer's save deadline, and "missed" one that deadline closed
 * before anything was saved.
 */
export type SessionFillStatus = "empty" | "saved" | "locked" | "missed" | "handedOver" | "upcoming";

export interface FillStatusInput {
  submittedAt?: string;
  /** The lesson's date and the school's today, both "YYYY-MM-DD". */
  date: string;
  today: string;
  handedOver?: boolean;
  /**
   * The last instant the session may still be saved by whoever's fill
   * state the list shows: the viewer's own editable_until (the same
   * deadline the editor enforces), or owner_editable_until on another
   * teacher's day. Absent on a lesson that has a session means that
   * person may not save it at all.
   */
  editableUntil?: string;
  /** The business clock's current instant. */
  now: Date;
}

/**
 * Derives the badge state from what the list already has: a lesson an
 * accepted substitute fills instead is "handedOver" on any date, so the
 * handover shows ahead of the day as well; a lesson on a later day has not
 * happened, so it is "upcoming" and cannot be opened (the API refuses to
 * record it) -- even if an older build let someone submit it already.
 * Otherwise the viewer's save deadline decides: before it a saved lesson is
 * "saved" and an unsaved one "empty", still to fill; after it they are
 * "locked" and "missed". Dates compare as "YYYY-MM-DD" strings, which sort
 * correctly lexicographically.
 */
export function deriveFillStatus({
  submittedAt,
  date,
  today,
  handedOver = false,
  editableUntil,
  now,
}: FillStatusInput): SessionFillStatus {
  if (handedOver && !submittedAt) return "handedOver";
  if (date > today) return "upcoming";
  const closed = editableUntil === undefined || now.getTime() > Date.parse(editableUntil);
  if (!submittedAt) return closed ? "missed" : "empty";
  return closed ? "locked" : "saved";
}

/** A teacher's day totals for the list header. */
export interface DayFillCounts {
  saved: number;
  /** Lessons this teacher can and still has to fill. */
  pending: number;
  missed: number;
  handedOver: number;
}

/**
 * Counts a day's lessons from their fill statuses, so each lesson lands in
 * exactly one bucket and the totals agree with the row badges. A lesson on
 * a later date is in none of them, even with a submission (one saved by an
 * older build or under the time simulation): it cannot be filled yet, and
 * counting it as saved as well as not-yet-open would push "pending" below
 * zero.
 */
export function countDayFillStatuses(statuses: readonly SessionFillStatus[]): DayFillCounts {
  const count = (...wanted: SessionFillStatus[]) =>
    statuses.filter((status) => wanted.includes(status)).length;
  return {
    saved: count("saved", "locked"),
    pending: count("empty"),
    missed: count("missed"),
    handedOver: count("handedOver"),
  };
}

/** A period's clock-time span, "HH:MM:SS" (or "HH:MM"), compared as plain strings. */
export interface PeriodWindow {
  startsAt: string;
  endsAt: string;
}

export type PeriodTiming = "before" | "ongoing" | "after";

/** Where `nowHHMMSS` falls relative to one period's window. */
export function classifyPeriodTiming(nowHHMMSS: string, window: PeriodWindow): PeriodTiming {
  if (nowHHMMSS < window.startsAt) return "before";
  if (nowHHMMSS > window.endsAt) return "after";
  return "ongoing";
}

/**
 * Picks the id of the session starting soonest among those that have not
 * started yet, for the "Berikutnya" highlight -- `null` when every
 * session has already started or ended, or the list is empty.
 */
export function findNextSessionId<T>(
  sessions: T[],
  getId: (item: T) => string,
  getWindow: (item: T) => PeriodWindow,
  nowHHMMSS: string,
): string | null {
  let bestId: string | null = null;
  let bestStart: string | null = null;
  for (const item of sessions) {
    const window = getWindow(item);
    if (classifyPeriodTiming(nowHHMMSS, window) !== "before") continue;
    if (bestStart === null || window.startsAt < bestStart) {
      bestStart = window.startsAt;
      bestId = getId(item);
    }
  }
  return bestId;
}
