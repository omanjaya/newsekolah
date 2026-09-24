/**
 * Expands a teacher's weekly schedule into concrete lesson rows so the
 * journal page can show "what did I teach, and did I write it up" for the
 * last few days, not just the entries already saved -- an unfilled lesson
 * needs to show up too, not only the ones that already have a journal.
 */

/** One weekly timetable block: recurring every `dayOfWeek`, not tied to a date. */
export interface WeeklyLessonBlock {
  scheduleId: string;
  classId: string;
  subjectId: string;
  /** 1 (Monday) through 7 (Sunday), matching the API's day_of_week. */
  dayOfWeek: number;
}

export interface LessonDayLesson {
  scheduleId: string;
  classId: string;
  subjectId: string;
  filled: boolean;
}

export interface LessonDayGroup {
  date: string;
  lessons: LessonDayLesson[];
}

/** The key `buildLessonDays` looks up in `filledKeys` for one class/subject/date. */
export function journalEntryKey(classId: string, subjectId: string, date: string): string {
  return `${classId}|${subjectId}|${date}`;
}

/** "YYYY-MM-DD" shifted by `days` (negative goes back), staying in UTC so DST never skips a day. */
export function shiftDateISO(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** ISO weekday (1 Monday .. 7 Sunday) of a "YYYY-MM-DD" date. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Builds one group per school day in `[today - days + 1, today]` that
 * actually has a lesson, newest first. A day with no lesson at all (a
 * teacher's day off, or a weekend they do not teach) is left out entirely
 * rather than rendered as an empty row.
 */
export function buildLessonDays(
  today: string,
  days: number,
  activeWeekdays: ReadonlySet<number>,
  blocks: readonly WeeklyLessonBlock[],
  filledKeys: ReadonlySet<string>,
): LessonDayGroup[] {
  const byWeekday = new Map<number, WeeklyLessonBlock[]>();
  for (const block of blocks) {
    const list = byWeekday.get(block.dayOfWeek) ?? [];
    list.push(block);
    byWeekday.set(block.dayOfWeek, list);
  }

  const groups: LessonDayGroup[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = shiftDateISO(today, -offset);
    const weekday = isoWeekday(date);
    if (!activeWeekdays.has(weekday)) continue;
    const dayBlocks = byWeekday.get(weekday) ?? [];
    if (dayBlocks.length === 0) continue;
    const lessons = dayBlocks.map((block) => ({
      scheduleId: block.scheduleId,
      classId: block.classId,
      subjectId: block.subjectId,
      filled: filledKeys.has(journalEntryKey(block.classId, block.subjectId, date)),
    }));
    groups.push({ date, lessons });
  }
  return groups;
}
