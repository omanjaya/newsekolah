/** Per-student roster changes since the session was last saved (or opened). */
export interface RosterChanges {
  /** Total number of changed fields, for the "N unsaved changes" hint. */
  count: number;
  /** student_user_id set of rows that differ from the snapshot, for the row-level "changed" dot. */
  changedStudentIds: Set<string>;
}

/**
 * Compares the roster's live status/note/violation maps against the
 * snapshot taken when the session was opened (or last saved), one field at
 * a time so a student who only got a note added counts as one change, not
 * two, and a student untouched since save never appears in
 * `changedStudentIds` even though every keystroke elsewhere re-runs this.
 */
export function computeRosterChanges(
  statuses: Record<string, string>,
  notes: Record<string, string>,
  violations: Record<string, string[]>,
  initialStatuses: Record<string, string>,
  initialNotes: Record<string, string>,
): RosterChanges {
  let count = 0;
  const changedStudentIds = new Set<string>();
  for (const [studentId, value] of Object.entries(statuses)) {
    if (value !== initialStatuses[studentId]) {
      count += 1;
      changedStudentIds.add(studentId);
    }
  }
  for (const [studentId, value] of Object.entries(notes)) {
    if (value !== (initialNotes[studentId] ?? "")) {
      count += 1;
      changedStudentIds.add(studentId);
    }
  }
  for (const [studentId, value] of Object.entries(violations)) {
    if (value.length > 0) {
      count += 1;
      changedStudentIds.add(studentId);
    }
  }
  return { count, changedStudentIds };
}

/** How many of the journal's three fields differ from what was last saved. */
export function computeJournalChangeCount(
  topic: string,
  activities: string,
  reflection: string,
  initialTopic: string,
  initialActivities: string,
  initialReflection: string,
): number {
  let count = 0;
  if (topic !== initialTopic) count += 1;
  if (activities !== initialActivities) count += 1;
  if (reflection !== initialReflection) count += 1;
  return count;
}
