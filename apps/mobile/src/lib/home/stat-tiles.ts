// Pure numeric transforms backing the student home screen's 2x2 stat grid.
// Each figure is computed from one real query's settled data; a screen only
// passes a number in here once its query has resolved, so "undefined" means
// "no data yet" and this module never fabricates a placeholder for it.
import type { CalendarDay, MySubjectGrade } from "@/lib/api/hooks";

/** Attendance percent for the days the calendar actually has a rollup for
 * (status_code !== "NONE"). `undefined` when there are no such days yet
 * (start of month, or attendance not taken yet) -- a 0/0 percent would be
 * invented, not measured. */
export function computeAttendancePercent(days: CalendarDay[]): number | undefined {
  const relevant = days.filter((d) => d.status_code !== "NONE");
  if (relevant.length === 0) return undefined;
  const present = relevant.filter((d) => d.status_code === "H").length;
  return Math.round((present / relevant.length) * 100);
}

/** Total scored components across every subject this term -- the only
 * "how many grades do I have" figure the API exposes (there is no
 * unread/"new" flag on a grade, see GET /v1/me/grades). */
export function computeGradedComponentsCount(subjects: MySubjectGrade[]): number {
  return subjects.reduce((sum, subject) => sum + subject.components.length, 0);
}
