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
  /** student_user_id set of rows whose status differs from what was last saved (or, for a row never saved, from the default "present"), for the row-level "changed" dot. */
  changedStudentIds: Set<string>;
  /** Rows with no stored status yet: shown as present, but not recorded until saved. */
  unrecordedStudentIds: Set<string>;
  /** Every row the save sends: the changed ones and the unrecorded ones. */
  pendingStudentIds: Set<string>;
  /** How many rows changed, for "N perubahan belum disimpan". */
  count: number;
}

/** The status a member without a stored entry is shown with. */
export const DEFAULT_STATUS: AttendanceStatus = "H";

/**
 * Diffs the roster's live status map against what the server holds:
 * `savedStatuses` has an entry only for a member whose status is recorded
 * (the roster endpoint returns recorded rows only). A member without one is
 * unrecorded even while shown as present, so a meeting where everyone
 * attended still has something to save, and saving stores "Hadir" too
 * instead of only the exceptions. Mirrors attendance/lib/change-tracking.ts's
 * `computeRosterChanges` over a single status field.
 */
export function computeAttendanceChanges(
  statuses: Record<string, AttendanceStatus>,
  savedStatuses: Partial<Record<string, AttendanceStatus>>,
): AttendanceChanges {
  const changedStudentIds = new Set<string>();
  const unrecordedStudentIds = new Set<string>();
  for (const [studentId, value] of Object.entries(statuses)) {
    const saved = savedStatuses[studentId];
    if (saved === undefined) {
      unrecordedStudentIds.add(studentId);
      if (value !== DEFAULT_STATUS) changedStudentIds.add(studentId);
    } else if (value !== saved) {
      changedStudentIds.add(studentId);
    }
  }
  const pendingStudentIds = new Set([...changedStudentIds, ...unrecordedStudentIds]);
  return {
    changedStudentIds,
    unrecordedStudentIds,
    pendingStudentIds,
    count: changedStudentIds.size,
  };
}
