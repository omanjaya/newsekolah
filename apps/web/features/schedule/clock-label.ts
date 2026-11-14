/**
 * A wall-clock time from the API ("07:00:00" or "07:00") as people read it:
 * "07.00" in Indonesian, "07:00" in English. Lesson times are school-local
 * already, so no time zone applies.
 */
export function clockLabel(time: string, locale: string): string {
  const hhmm = time.slice(0, 5);
  return locale === "id" ? hhmm.replace(":", ".") : hhmm;
}

/** "07.00 – 08.30": a lesson's span, en dash with spaces as in the school's printed timetable. */
export function clockRange(start: string, end: string, locale: string): string {
  return `${clockLabel(start, locale)} – ${clockLabel(end, locale)}`;
}
