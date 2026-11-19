import { attendanceRate } from "../../dashboard/home/time";

/** The bit of {@link CalendarDay} the month stats need -- lets tests build fixtures without the full API shape. */
export interface CalendarDayLike {
  date: string;
  status_code: string;
}

export interface MonthAttendanceStats {
  /**
   * Rounded percent of "H" (hadir) days among the month's recorded days, or
   * undefined while nothing is recorded yet (see {@link presentRate}).
   */
  presentRate: number | undefined;
  /** One count per status code seen among the month's known days (H, S, I, D, A, INCOMPLETE, MIXED). */
  counts: Record<string, number>;
}

/**
 * Day codes that record no attendance: no lesson that day (NONE), a session
 * the teacher has not filled in yet (INCOMPLETE), or nothing to base a
 * status on (MIXED). See the API's attendance/domain/daily_status.go.
 */
const UNRECORDED_DAY_CODES: ReadonlySet<string> = new Set(["NONE", "INCOMPLETE", "MIXED"]);

/**
 * The percent of present ("H") days among the days with an attendance
 * status recorded, or undefined while none has one. A day the teacher has
 * not filled in yet is not an absence, so it never lowers the rate: a month
 * that is all "belum lengkap" reads "-", not "0%" (audit teaching-3).
 * Shared by the attendance page and the home's attendance tile so both
 * show the same figure.
 */
export function presentRate(statuses: readonly string[]): number | undefined {
  return attendanceRate(
    statuses.filter((code) => !UNRECORDED_DAY_CODES.has(code)),
    ["H"],
  );
}

/**
 * {@link presentRate} over a tally of statuses (code to how many), such as
 * a homeroom class's day: students whose attendance is not filled in yet
 * ("INCOMPLETE") are left out, so a class nobody has recorded reads "not
 * recorded yet", never "0%" (audit r3-n15).
 */
export function presentRateOfCounts(counts: Readonly<Record<string, number>>): number | undefined {
  return presentRate(
    Object.entries(counts).flatMap(([code, count]) =>
      Array.from({ length: Math.max(0, count) }, () => code),
    ),
  );
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
  return { presentRate: presentRate(statuses), counts };
}
