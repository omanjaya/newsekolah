import { clockRange } from "../../schedule/clock-label";

/** The fields of a timetable period an exit permit's range is picked from. */
export interface LessonPeriod {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_break: boolean;
}

export interface LessonPeriodOption {
  value: string;
  label: string;
}

/**
 * The lessons an exit permit can span, in timetable order, as
 * "Jam 1 (07.00 – 07.45)". Breaks are left out: a permit leaves lessons,
 * and a range that starts or ends on "Istirahat 1" means nothing. Both the
 * student's own request and the duty teacher's manual record use this, so
 * the same record reads the same in either form.
 */
export function lessonPeriodOptions(
  periods: readonly LessonPeriod[],
  locale: string,
): LessonPeriodOption[] {
  return periods
    .filter((p) => !p.is_break)
    .map((p) => ({
      value: p.id,
      label: `${p.name} (${clockRange(p.starts_at, p.ends_at, locale)})`,
    }));
}

/** The options a range may end on: the start lesson and every one after it. */
export function endPeriodOptions(
  options: readonly LessonPeriodOption[],
  startId: string,
): LessonPeriodOption[] {
  const start = options.findIndex((o) => o.value === startId);
  return start < 0 ? [...options] : options.slice(start);
}

/**
 * The end a range keeps once its start changes: the start itself when
 * nothing was picked yet or the old end now lies before the new start.
 */
export function endAfterStartChange(
  options: readonly LessonPeriodOption[],
  startId: string,
  endId: string,
): string {
  if (!endId) return startId;
  return endPeriodOptions(options, startId).some((o) => o.value === endId) ? endId : startId;
}
