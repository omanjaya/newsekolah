// The exit permit rules the student's screen needs, kept pure for tests and
// in step with the web's (apps/web/features/permits/lib/exit-return.ts and
// lesson-period-options.ts): which lessons can still be asked for, and
// where the student stands on returning after the gate.

/** "HH:mm" on the school's wall clock at `now`, in `timeZone` when known. */
export function schoolClock(now: Date, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    return `${part("hour")}:${part("minute")}`;
  } catch {
    // An engine without time zone data: the device's own clock, which is
    // the school's for a student at school.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
}

/** Whether a lesson ending at `ends_at` ("HH:mm:ss") is over at `clock` ("HH:mm"). */
export function lessonEnded(period: { ends_at: string }, clock: string): boolean {
  return period.ends_at.slice(0, 5) <= clock;
}

/**
 * The lessons a student may still ask to leave: not breaks, and not over
 * at `clock`. The API refuses a request whose first lesson has ended
 * (EXIT_PERMIT_PERIOD_PASSED).
 */
export function upcomingLessons<T extends { ends_at: string; is_break: boolean }>(
  periods: readonly T[],
  clock: string,
): T[] {
  return periods.filter((p) => !p.is_break && !lessonEnded(p, clock));
}

/** The lessons a range may end on: the start (a one-lesson permit) and every one after it. */
export function endLessons<T extends { id: string }>(lessons: readonly T[], startId: string): T[] {
  const start = lessons.findIndex((p) => p.id === startId);
  return start < 0 ? [...lessons] : lessons.slice(start);
}

export interface ExitReturnFields {
  exited_at?: string;
  return_required: boolean;
  expected_return_at?: string;
  returned_at?: string;
}

export type ExitReturnState =
  /** Not through the gate, or exited before returns were tracked: nothing to say. */
  | { kind: "none" }
  /** Went home: not expected back. */
  | { kind: "no_return" }
  /** Out, due back at `due`; `lateMinutes` > 0 once that has passed. */
  | { kind: "out"; due: string; lateMinutes: number }
  /** Back at `at`; `lateMinutes` null when there was no due time to judge it by. */
  | { kind: "returned"; at: string; lateMinutes: number | null };

function minutesLate(dueIso: string, atMs: number): number {
  const due = Date.parse(dueIso);
  if (!Number.isFinite(due) || !Number.isFinite(atMs)) return 0;
  return Math.max(0, Math.floor((atMs - due) / 60_000));
}

/** Where the student stands on returning at `now`. */
export function exitReturnState(permit: ExitReturnFields, now: Date): ExitReturnState {
  if (!permit.exited_at) return { kind: "none" };
  if (!permit.return_required) return { kind: "no_return" };
  const due = permit.expected_return_at;
  if (permit.returned_at) {
    return {
      kind: "returned",
      at: permit.returned_at,
      lateMinutes: due ? minutesLate(due, Date.parse(permit.returned_at)) : null,
    };
  }
  if (!due) return { kind: "none" };
  return { kind: "out", due, lateMinutes: minutesLate(due, now.getTime()) };
}
