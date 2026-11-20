import type { SessionFillStatus } from "./session-schedule";

/**
 * Which control a session card in the day list shows on its right side
 * (docs/07-ui-ux.md's bento day view): the running, unsubmitted lesson gets
 * the primary "Isi presensi" action; any other unsubmitted lesson still
 * open to saving (a future period today, or any session on a different
 * date) gets the quieter "Buka"; a submitted or locked lesson -- saved,
 * locked, or missed -- shows its status badge and opens to view it.
 */
export type SessionCardAction = "fill" | "open" | "saved" | "upcoming";

export function deriveSessionCardAction(
  fillStatus: SessionFillStatus,
  timing: "ongoing" | "next" | null,
): SessionCardAction {
  // A lesson on a later day has nothing to record yet.
  if (fillStatus === "upcoming") return "upcoming";
  if (fillStatus !== "empty") return "saved";
  return timing === "ongoing" ? "fill" : "open";
}
