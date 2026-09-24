/** A lesson's fill state, for the session list's status badge (docs/07-ui-ux.md). */
export type SessionFillStatus = "empty" | "saved" | "locked";

/**
 * Derives the badge state from what the list already has: no submission
 * yet is always "empty"; a submission on a past date is treated as
 * "locked" because reopening it always goes through the correction
 * workflow (`session-editor.tsx`'s `isCorrection`), while a submission on
 * today's date is "saved" -- still freely revisitable for the rest of the
 * lesson. Dates compare as "YYYY-MM-DD" strings, which sort correctly
 * lexicographically.
 */
export function deriveFillStatus(
  submittedAt: string | undefined,
  date: string,
  today: string,
): SessionFillStatus {
  if (!submittedAt) return "empty";
  return date < today ? "locked" : "saved";
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
