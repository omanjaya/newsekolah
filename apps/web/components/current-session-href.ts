"use client";

import { todayInZone, useTodaySessionsQuery } from "../features/attendance/api";
import { minutesInZone, parseClock, pickCurrentOrNext } from "../features/dashboard/home/time";
import { useAllPeriodsQuery } from "../features/reference/api";
import { businessNow } from "../lib/simulation/clock";

/** Where "Isi presensi" leads when no session is running or next. */
export const ATTENDANCE_HREF = "/attendance";

interface SessionLike {
  /**
   * Absent on a lesson nobody has opened yet: a later day's, or one only
   * the simulated day has reached (the list does not open it).
   */
  id?: string;
  start_period_id: string;
  end_period_id: string;
  submitted_at?: string | null;
  /** Set when an accepted substitute fills this lesson instead. */
  handed_over_to_user_id?: string | null;
}

interface PeriodLike {
  id: string;
  starts_at: string;
  ends_at: string;
}

/**
 * The session a teacher's "Isi presensi" opens, the one the home hero
 * offers: the session running now while it is still unsubmitted, else the
 * next one today, else the attendance list. A lesson handed to a
 * substitute is theirs to fill, so it is never offered here. The pick
 * counts a lesson not opened yet, as the hero does, so a later opened one
 * never stands in for it; the bar then leads to the attendance list.
 */
export function currentSessionHref(
  sessions: readonly SessionLike[],
  periods: readonly PeriodLike[],
  nowMinutes: number,
): string {
  const byId = new Map(periods.map((period) => [period.id, period]));
  const ranges = sessions
    .filter((session) => !session.handed_over_to_user_id)
    .map((session) => ({
      session,
      start: parseClock(byId.get(session.start_period_id)?.starts_at ?? "00:00"),
      end: parseClock(byId.get(session.end_period_id)?.ends_at ?? "00:00"),
    }));
  // A running session that is already submitted asks for nothing more.
  const open = ranges.filter(
    (range) =>
      range.start > nowMinutes ||
      (range.start <= nowMinutes && nowMinutes < range.end && !range.session.submitted_at),
  );
  const picked = pickCurrentOrNext(open, nowMinutes);
  return picked?.item.session.id ? `${ATTENDANCE_HREF}/${picked.item.session.id}` : ATTENDANCE_HREF;
}

/**
 * `currentSessionHref` for the signed-in teacher, from the same cached
 * queries the home hero reads (so the bar adds no request on the home
 * page). Disabled, it makes no request and returns the attendance list.
 */
export function useCurrentSessionHref(timeZone: string | undefined, enabled: boolean): string {
  const sessions = useTodaySessionsQuery({ date: todayInZone(timeZone) }, enabled);
  const periods = useAllPeriodsQuery(enabled);
  if (!enabled || !timeZone || !sessions.data || !periods.data) return ATTENDANCE_HREF;
  return currentSessionHref(
    sessions.data.data,
    periods.data.data,
    minutesInZone(businessNow(), timeZone),
  );
}
