// Pure joins/formatting for the student home screen's "Pelajaran
// berikutnya" hero card and "Hari ini" list. Kept free of React and of the
// API client so it is trivial to unit test with hand-built fixtures instead
// of mocked hooks (see __tests__/student-schedule.test.ts).
import type { Period, ScheduleBlock } from "@/lib/api/hooks";

export interface ScheduleRow {
  key: string;
  startSeq: number;
  endSeq: number;
  /** "10.15" (Indonesian clock notation, a colon replaced by a dot). */
  startLabel: string;
  endLabel: string;
  startsAt: Date;
  endsAt: Date;
  subjectName: string;
  roomName: string | null;
  teacherName: string | null;
}

export interface NextLesson {
  row: ScheduleRow;
  /** Lesson has already started and hasn't ended yet. */
  inProgress: boolean;
  minutesUntilStart: number;
}

/** 1 (Monday) through 7 (Sunday), matching the /v1/schedules query
 * (`day_of_week`) -- JS's own `Date#getDay` is Sunday-first (0-6). */
export function isoDayOfWeek(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** "08:40" -> "08.40" (Indonesian clock notation used throughout the
 * reference mockup). */
export function formatClockLabel(hhmm: string): string {
  return hhmm.replace(":", ".");
}

function timeOnDate(date: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return result;
}

/**
 * Joins schedule blocks (start_seq/end_seq, subject/room/teacher ids) with
 * the period template (sequence -> starts_at/ends_at) and the name lookups
 * the caller already has from other reference-data hooks. A block whose
 * start or end sequence has no matching period is dropped rather than
 * guessing a time -- it should not happen (schedules are only ever built
 * from the active period template) but the screen must not invent a time.
 */
export function buildScheduleRows(
  blocks: ScheduleBlock[],
  periods: Period[],
  today: Date,
  subjectNames: Map<string, string>,
  roomNames: Map<string, string>,
  teacherNames: Map<string, string>,
): ScheduleRow[] {
  const bySequence = new Map(periods.map((p) => [p.sequence, p]));
  const rows: ScheduleRow[] = [];

  for (const block of blocks) {
    const startPeriod = bySequence.get(block.start_seq);
    const endPeriod = bySequence.get(block.end_seq);
    if (!startPeriod || !endPeriod) continue;

    rows.push({
      key: block.schedule_ids.join("-"),
      startSeq: block.start_seq,
      endSeq: block.end_seq,
      startLabel: formatClockLabel(startPeriod.starts_at),
      endLabel: formatClockLabel(endPeriod.ends_at),
      startsAt: timeOnDate(today, startPeriod.starts_at),
      endsAt: timeOnDate(today, endPeriod.ends_at),
      subjectName: subjectNames.get(block.subject_id) ?? "-",
      roomName: block.room_id ? (roomNames.get(block.room_id) ?? null) : null,
      teacherName: teacherNames.get(block.teacher_user_id) ?? null,
    });
  }

  return rows.sort((a, b) => a.startSeq - b.startSeq);
}

/** The first row that has not finished yet -- in progress or still to come.
 * `null` once every lesson for the day is over (or there is none), so the
 * hero card can show an honest "no more lessons today" state instead of
 * stale or invented data. */
export function pickNextLesson(rows: ScheduleRow[], now: Date): NextLesson | null {
  for (const row of rows) {
    if (now >= row.endsAt) continue;
    const inProgress = now >= row.startsAt;
    const minutesUntilStart = inProgress
      ? 0
      : Math.max(1, Math.round((row.startsAt.getTime() - now.getTime()) / 60_000));
    return { row, inProgress, minutesUntilStart };
  }
  return null;
}
