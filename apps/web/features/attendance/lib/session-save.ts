import type { SaveEntriesRequest, SessionDetail } from "../api";

/** The names of the students whose requested status a save replaced. */
export function overriddenNames(
  ids: string[] | undefined,
  roster: SessionDetail["roster"],
): string[] {
  if (!ids || ids.length === 0) return [];
  const wanted = new Set(ids);
  return roster.filter((item) => wanted.has(item.student_user_id)).map((item) => item.name);
}

/** The session list for the lesson's own day: today's list carries no date. */
export function attendanceListHref(date: string, today: string): string {
  return date && date !== today
    ? `/attendance?${new URLSearchParams({ date }).toString()}`
    : "/attendance";
}

/**
 * The server's answer when the session can no longer be saved in the mode
 * asked for: asking again gives the same answer, so the editor locks
 * instead of offering a retry.
 */
export function isWindowClosedCode(code: string): boolean {
  return code === "ATTENDANCE_WINDOW_CLOSED" || code === "ATTENDANCE_CORRECTION_WINDOW_CLOSED";
}

/**
 * The save request for the editor's state: every row the API does not
 * block, with its note and violations when it has any, a reason when the
 * save is a correction (reason not null), and the journal when both its
 * required fields are filled. Pass no violations when discipline is off,
 * so a restored draft's picks are not sent.
 */
export function saveEntriesBody({
  roster,
  statuses,
  notes,
  violations,
  defaultCode,
  reason,
  journal,
}: {
  roster: SessionDetail["roster"];
  statuses: Record<string, string>;
  notes: Record<string, string>;
  violations: Record<string, string[]>;
  defaultCode: string;
  reason: string | null;
  journal: { topic: string; activities: string; reflection: string } | null;
}): SaveEntriesRequest {
  return {
    mode: reason === null ? "normal" : "correction",
    ...(reason === null ? {} : { reason: reason.trim() }),
    entries: roster
      .filter((item) => !item.blocked)
      .map((item) => {
        const id = item.student_user_id;
        return {
          student_user_id: id,
          status_code: statuses[id] ?? defaultCode,
          ...(notes[id] ? { notes: notes[id] } : {}),
          ...(violations[id]?.length ? { violation_ids: violations[id] } : {}),
        };
      }),
    ...(journal
      ? {
          journal: {
            topic: journal.topic.trim(),
            activities: journal.activities.trim(),
            ...(journal.reflection.trim() ? { reflection: journal.reflection.trim() } : {}),
          },
        }
      : {}),
  };
}
