import type { SessionDetail } from "../api";

/** The names of the students whose requested status a save replaced. */
export function overriddenNames(
  ids: string[] | undefined,
  roster: SessionDetail["roster"],
): string[] {
  if (!ids || ids.length === 0) return [];
  const wanted = new Set(ids);
  return roster.filter((item) => wanted.has(item.student_user_id)).map((item) => item.name);
}

/** The session list for the lesson's own day: today's list carries no date. */
export function attendanceListHref(date: string, today: string): string {
  return date && date !== today
    ? `/attendance?${new URLSearchParams({ date }).toString()}`
    : "/attendance";
}
