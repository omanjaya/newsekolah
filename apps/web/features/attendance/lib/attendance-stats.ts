import { attendanceRate } from "../../dashboard/home/time";

/** The bit of {@link CalendarDay} the month stats need -- lets tests build fixtures without the full API shape. */
export interface CalendarDayLike {
  date: string;
  status_code: string;
}

export interface MonthAttendanceStats {
  /** Rounded percent of "H" (hadir) days among the month's known days, or undefined with none yet. */
  presentRate: number | undefined;
  /** One count per status code seen among the month's known days (H, S, I, D, A, INCOMPLETE, MIXED). */
  counts: Record<string, number>;
}

/**
 * Tallies a student's month calendar into the home-screen attendance stats:
 * the four tiles (hadir%, sakit, izin, alpha) come straight out of `counts`,
 * plus the fuller legend (also INCOMPLETE, MIXED, and D for dispensasi,
 * which stays its own status and is never folded into izin -- the codebase
 * treats S/I/D as three separate protected statuses everywhere else, see
 * `lib/attendance-status.ts` and `lib/status-tokens.ts`).
 *
 * A day counts only once it has happened (`date <= today`) and has a
 * schedule at all (`status_code !== "NONE"`) -- the same rule the dashboard's
 * own attendance tile uses (`features/dashboard/home/blocks/student.tsx`),
 * so a day that has not started yet, or a weekend/holiday with no lesson,
 * never drags the rate down or pads the legend.
 */
export function monthAttendanceStats(
  days: readonly CalendarDayLike[],
  today: string,
): MonthAttendanceStats {
  const known = days.filter((day) => day.date <= today && day.status_code !== "NONE");
  const statuses = known.map((day) => day.status_code);
  const counts: Record<string, number> = {};
  for (const code of statuses) counts[code] = (counts[code] ?? 0) + 1;
  return { presentRate: attendanceRate(statuses, ["H"]), counts };
}
