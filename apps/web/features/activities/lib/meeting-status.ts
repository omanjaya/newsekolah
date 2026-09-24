import type { AttendanceStatus } from "../api";

/**
 * The four codes a club-meeting roster records -- deliberately narrower
 * than the daily attendance roster's status policy (no dispensation),
 * since a club meeting's attendance is a lighter record than a full
 * teaching session's.
 */
export const STATUS_OPTIONS: AttendanceStatus[] = ["H", "I", "S", "A"];

/**
 * Design-token family for each code, matching the same colours
 * `attendance`'s roster uses for H/I/S/A (packages/ui-tokens' status
 * palette) so a status reads the same wherever it appears, without this
 * feature importing from the `attendance` feature.
 */
export type MeetingStatusToken = "present" | "excused" | "sick" | "absent";

const STATUS_TOKEN: Record<AttendanceStatus, MeetingStatusToken> = {
  H: "present",
  I: "excused",
  S: "sick",
  A: "absent",
};

export function meetingStatusToken(code: AttendanceStatus): MeetingStatusToken {
  return STATUS_TOKEN[code];
}

/** Statuses a "mark everyone present" sweep must not silently overwrite -- a recorded excuse or sick note is a documented exception, unlike an unmarked absence. */
const PROTECTED_CODES: ReadonlySet<AttendanceStatus> = new Set(["I", "S"]);

/** Which of the given students a bulk "mark all present" action should update. */
export function studentsToMarkPresent(
  studentIds: string[],
  currentStatuses: Record<string, AttendanceStatus>,
): string[] {
  return studentIds.filter((id) => !PROTECTED_CODES.has(currentStatuses[id] ?? "H"));
}

export interface AttendanceChanges {
  /** student_user_id set of rows whose status differs from what was last saved, for the row-level "changed" dot and the save payload. */
  changedStudentIds: Set<string>;
  count: number;
}

/**
 * Diffs the roster's live status map against the snapshot taken when it
 * was opened (or last saved), one student at a time. Mirrors
 * attendance/lib/change-tracking.ts's `computeRosterChanges` but only
 * over a single status field -- this roster has no notes or violations.
 */
export function computeAttendanceChanges(
  statuses: Record<string, AttendanceStatus>,
  initialStatuses: Record<string, AttendanceStatus>,
): AttendanceChanges {
  const changedStudentIds = new Set<string>();
  for (const [studentId, value] of Object.entries(statuses)) {
    if (value !== initialStatuses[studentId]) changedStudentIds.add(studentId);
  }
  return { changedStudentIds, count: changedStudentIds.size };
}
