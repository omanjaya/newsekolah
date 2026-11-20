import { isoToZonedLocal } from "../../../lib/tenant-date";
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

/**
 * The lessons a student may still ask to leave: those that have not ended
 * by `schoolTime` ("HH:mm", the school's wall clock now). The API refuses
 * a request whose first lesson is already over (EXIT_PERMIT_PERIOD_PASSED),
 * so the form offers only the running lesson and the ones still to come.
 * A lesson ending at 07:45 drops out at 07:45, as the API's check does.
 */
export function upcomingLessonPeriods<T extends LessonPeriod>(
  periods: readonly T[],
  schoolTime: string,
): T[] {
  return periods.filter((p) => !lessonEnded(p, schoolTime));
}

/**
 * Whether `period` has ended by `schoolTime` ("HH:mm", the school's wall
 * clock now). Once a permit's last lesson has ended the API refuses its
 * gate QR (EXIT_PERMIT_WINDOW_CLOSED), as it refuses a request for it.
 */
export function lessonEnded(period: Pick<LessonPeriod, "ends_at">, schoolTime: string): boolean {
  return period.ends_at.slice(0, 5) <= schoolTime;
}

/**
 * The options a range may end on: the start lesson (a one-lesson permit)
 * and every one after it.
 */
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

/**
 * Whether an exit permit's last lesson has ended on the school's clock at
 * `now`: its stages and gate QR are then refused (EXIT_PERMIT_WINDOW_CLOSED),
 * and the permit waits for the expiry job. A permit opened on an earlier
 * school day is over whatever the time now, as the API reads it (the
 * permit's own local day). False while the periods are unknown.
 */
export function permitLessonsOver(
  permit: { end_period_id: string; opened_at: string },
  periods: readonly Pick<LessonPeriod, "id" | "ends_at">[] | undefined,
  now: Date,
  timeZone?: string,
): boolean {
  const today = isoToZonedLocal(now, timeZone);
  if (isoToZonedLocal(permit.opened_at, timeZone).slice(0, 10) < today.slice(0, 10)) return true;
  const end = periods?.find((p) => p.id === permit.end_period_id);
  return end ? lessonEnded(end, today.slice(11, 16)) : false;
}
