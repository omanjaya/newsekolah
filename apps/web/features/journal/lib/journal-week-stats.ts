import type { LessonDayGroup } from "./build-lesson-days";

export interface JournalWeekStats {
  /** Journals already written across the whole window (docs/07-ui-ux.md's "jurnal minggu ini"). */
  filledThisWeek: number;
  /** Lessons taught today that still have no journal entry. */
  missingToday: number;
}

/**
 * The two stat tiles on `/journal` (docs/superpowers "Hijau Segar" bento
 * redesign): both derived from the same `LessonDayGroup[]` window
 * `JournalTodayPanel` already builds (`buildLessonDays`), so no new
 * endpoint or query is needed. A lesson is either filled (counted in the
 * week total) or, only when it falls on `today`, missing.
 */
export function computeJournalWeekStats(
  groups: readonly LessonDayGroup[],
  today: string,
): JournalWeekStats {
  let filledThisWeek = 0;
  let missingToday = 0;
  for (const group of groups) {
    for (const lesson of group.lessons) {
      if (lesson.filled) {
        filledThisWeek++;
      } else if (group.date === today) {
        missingToday++;
      }
    }
  }
  return { filledThisWeek, missingToday };
}
