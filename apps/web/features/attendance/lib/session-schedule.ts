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
   * The last instant the viewer may save the session (the list's
   * editable_until, the same deadline the editor enforces). Absent on a
   * lesson that has a session means the viewer may not save it at all.
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
