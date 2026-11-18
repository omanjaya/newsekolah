"use client";

import { todayInZone, useTodaySessionsQuery } from "../features/attendance/api";
import { minutesInZone, parseClock, pickCurrentOrNext } from "../features/dashboard/home/time";
import { useAllPeriodsQuery } from "../features/reference/api";
import { businessNow } from "../lib/simulation/clock";

/** Where "Isi presensi" leads when no session is running or next. */
export const ATTENDANCE_HREF = "/attendance";

interface SessionLike {
  id: string;
  start_period_id: string;
  end_period_id: string;
  submitted_at?: string | null;
}

interface PeriodLike {
  id: string;
  starts_at: string;
  ends_at: string;
}

/**
 * The session a teacher's "Isi presensi" opens, the one the home hero
 * offers: the session running now while it is still unsubmitted, else the
 * next one today, else the attendance list.
 */
export function currentSessionHref(
  sessions: readonly SessionLike[],
  periods: readonly PeriodLike[],
  nowMinutes: number,
): string {
  const byId = new Map(periods.map((period) => [period.id, period]));
  const ranges = sessions.map((session) => ({
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
  return picked ? `${ATTENDANCE_HREF}/${picked.item.session.id}` : ATTENDANCE_HREF;
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
