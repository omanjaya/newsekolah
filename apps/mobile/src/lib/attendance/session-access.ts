import type { SessionDetail } from "@/lib/api/hooks";

/** How this viewer may use an attendance session's editor. */
export type SessionAccess =
  /** Fills or re-saves the lesson as its own teacher. */
  | "normal"
  /** Changes a record on someone else's lesson, with a reason. */
  | "correction"
  /** Looks only: the lesson went to an accepted substitute. */
  | "read_only";

/**
 * A lesson handed to an accepted substitute is theirs to fill: its own
 * teacher may still open it to look, and saves it only with the correction
 * rights a homeroom teacher has, in which case the API sends an
 * editable_until. Without one the server refuses any save, so the editor
 * must not invite one.
 *
 * Otherwise the API says which mode this viewer saves in (save_mode): the
 * lesson's own teacher keeps re-saving in normal mode after the first save,
 * while a homeroom teacher or corrector on someone else's lesson --
 * submitted or not -- needs correction mode and a reason. Only a response
 * without save_mode (an older API) falls back to the submitted state.
 */
export function sessionAccess(
  session: Pick<
    SessionDetail,
    "handed_over_to_user_id" | "editable_until" | "save_mode" | "submitted_at"
  >,
): SessionAccess {
  if (session.handed_over_to_user_id && session.editable_until === undefined) {
    return "read_only";
  }
  if (session.save_mode === "correction") return "correction";
  if (session.save_mode === undefined && session.submitted_at) return "correction";
  return "normal";
}
