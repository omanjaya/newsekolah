// The exit permit rules the student's screen needs, kept pure for tests and
// in step with the web's (apps/web/features/permits/lib/exit-return.ts and
// lesson-period-options.ts): which lessons can still be asked for, and
// where the student stands on returning after the gate.

/** "YYYY-MM-DD HH:mm" on the school's calendar and wall clock at `now`. */
function schoolDateTime(now: Date, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
  } catch {
    // An engine without time zone data: the device's own clock, which is
    // the school's for a student at school.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
}

/** "HH:mm" on the school's wall clock at `now`, in `timeZone` when known. */
export function schoolClock(now: Date, timeZone?: string): string {
  return schoolDateTime(now, timeZone).slice(11, 16);
}

/** "YYYY-MM-DD", the school's calendar day of `instant`, in `timeZone` when known. */
export function schoolDay(instant: Date | string, timeZone?: string): string {
  return schoolDateTime(typeof instant === "string" ? new Date(instant) : instant, timeZone).slice(
    0,
    10,
  );
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

/**
 * Today's permit (as the web's isTodaysPermit in exit-permits-view.tsx):
 * opened on the school's today and still on its way, approved, or through
 * the gate. The API allows one such permit a day (EXIT_PERMIT_ALREADY_TODAY),
 * so the screen offers no new request while there is one. A cancelled,
 * rejected or expired permit frees the day, and one from an earlier day is
 * history: the API no longer counts it.
 */
export function isTodaysPermit(
  permit: { status: string; opened_at: string },
  now: Date,
  timeZone?: string,
): boolean {
  return (
    (permit.status === "in_progress" ||
      permit.status === "approved" ||
      permit.status === "completed") &&
    schoolDay(permit.opened_at, timeZone) === schoolDay(now, timeZone)
  );
}

/**
 * Whether a permit's last lesson has ended on the school's clock (as the
 * web's usePermitLessonsOver): the API then refuses its stage scans and its
 * gate QR (EXIT_PERMIT_WINDOW_CLOSED). A permit opened on an earlier school
 * day is over whatever the time now, as the API reads it (the permit's own
 * local day). False while the end lesson is unknown.
 */
export function permitLessonsOver(
  permit: { opened_at: string },
  endPeriod: { ends_at: string } | undefined,
  now: Date,
  timeZone?: string,
): boolean {
  if (schoolDay(permit.opened_at, timeZone) < schoolDay(now, timeZone)) return true;
  return endPeriod ? lessonEnded(endPeriod, schoolClock(now, timeZone)) : false;
}

/**
 * The app's own key for a refusal of the student's own request, worded to
 * the student, or null to use the shared error catalog. That catalog says
 * "Siswa ini ...", which reads right for the duty teacher recording a
 * permit for someone else but not for the student (as on the web,
 * apps/web/features/permits/lib/own-exit-refusal.ts).
 */
export function ownExitRefusalKey(
  code: string | undefined,
): "permits.on_leave_today" | "permits.already_today" | null {
  switch (code) {
    case "STUDENT_ON_LEAVE_TODAY":
      return "permits.on_leave_today";
    case "EXIT_PERMIT_ALREADY_TODAY":
      return "permits.already_today";
    default:
      return null;
  }
}

/**
 * The student's own exit permit the duty desk's approval QR would approve
 * (as apps/web/features/permits/lib/desk-approval.ts): that QR names no
 * permit, and the API accepts it only for an in-progress exit permit whose
 * current stage is a QR scan any teacher may approve.
 */
export function permitAwaitingDeskApproval<
  T extends {
    status: string;
    current_stage?: { approver_rule: string; verification: string };
  },
>(permits: readonly T[]): T | undefined {
  return permits.find(
    (p) =>
      p.status === "in_progress" &&
      p.current_stage?.verification === "qr_scan" &&
      p.current_stage.approver_rule === "any_teacher",
  );
}

interface DeskStage {
  label: string;
  approver_rule: string;
  verification: string;
}

/**
 * What the desk QR means for the scanning student (as deskApprovalTarget
 * in apps/web/features/permits/lib/desk-approval.ts), so a scan that
 * approves nothing says why instead of sending them to request a permit
 * they already have: `elsewhere` names the stage the permit waits on,
 * `awaitingGate` means every stage has passed, `none` that no exit permit
 * is under way.
 */
export type DeskApprovalTarget<T> =
  | { kind: "ready"; permit: T }
  | { kind: "elsewhere"; stage: DeskStage }
  | { kind: "awaitingGate" }
  | { kind: "none" };

export function deskApprovalTarget<T extends { status: string; current_stage?: DeskStage }>(
  permits: readonly T[],
): DeskApprovalTarget<T> {
  const waiting = permitAwaitingDeskApproval(permits);
  if (waiting) return { kind: "ready", permit: waiting };
  const stage = permits.find((p) => p.status === "in_progress" && p.current_stage)?.current_stage;
  if (stage) return { kind: "elsewhere", stage };
  if (permits.some((p) => p.status === "approved")) return { kind: "awaitingGate" };
  return { kind: "none" };
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
  /**
   * The exit day ended with no return on record (due back at `due`): the
   * gate can no longer record it, so a minute count would only keep
   * growing without saying anything new.
   */
  | { kind: "unrecorded"; due: string }
  /** Back at `at`; `lateMinutes` null when there was no due time to judge it by. */
  | { kind: "returned"; at: string; lateMinutes: number | null };

function minutesLate(dueIso: string, atMs: number): number {
  const due = Date.parse(dueIso);
  if (!Number.isFinite(due) || !Number.isFinite(atMs)) return 0;
  return Math.max(0, Math.floor((atMs - due) / 60_000));
}

/**
 * Where the student stands on returning at `now`; `timeZone` is the
 * school's, whose calendar day decides when the exit day is over.
 */
export function exitReturnState(
  permit: ExitReturnFields,
  now: Date,
  timeZone?: string,
): ExitReturnState {
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
  if (schoolDay(now, timeZone) > schoolDay(permit.exited_at, timeZone)) {
    return { kind: "unrecorded", due };
  }
  return { kind: "out", due, lateMinutes: minutesLate(due, now.getTime()) };
}
