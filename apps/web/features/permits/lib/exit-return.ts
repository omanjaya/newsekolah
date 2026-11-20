/**
 * The student's return after an exit permit. The API stores when the
 * student is due back (the end of the permit's last lesson, set at the gate
 * scan) and when security recorded them back; a return after the due time
 * is late.
 */

/** Whole minutes `at` lies past `dueIso`, 0 when it is not past it. */
export function minutesLate(dueIso: string, at: Date | string): number {
  const due = Date.parse(dueIso);
  const when = typeof at === "string" ? Date.parse(at) : at.getTime();
  if (!Number.isFinite(due) || !Number.isFinite(when)) return 0;
  return Math.max(0, Math.floor((when - due) / 60_000));
}

/** The return fields an exit permit carries, in the detail and in the student's list. */
export interface ExitReturnFields {
  exited_at?: string;
  return_required: boolean;
  expected_return_at?: string;
  returned_at?: string;
}

export type ExitReturnState =
  /**
   * Not through the gate yet, no return expected, or a permit that exited
   * before returns were tracked (no due time, no recorded return): whether
   * that student came back is unknown.
   */
  | { kind: "none" }
  /** Out, due back at `due`; `lateMinutes` > 0 once that has passed. */
  | { kind: "out"; due: string; lateMinutes: number }
  /**
   * Recorded back at `at`, `lateMinutes` after the due time (0: on time).
   * `lateMinutes` is null for a return with no due time to judge it by (one
   * imported from SION, which never judged returns).
   */
  | { kind: "returned"; at: string; lateMinutes: number | null };

/** Where the student stands on returning, at `now` on the school's clock. */
export function exitReturnState(permit: ExitReturnFields, now: Date): ExitReturnState {
  if (!permit.exited_at || !permit.return_required) return { kind: "none" };
  const due = permit.expected_return_at;
  if (permit.returned_at) {
    return {
      kind: "returned",
      at: permit.returned_at,
      lateMinutes: due ? minutesLate(due, permit.returned_at) : null,
    };
  }
  if (!due) return { kind: "none" };
  return { kind: "out", due, lateMinutes: minutesLate(due, now) };
}
