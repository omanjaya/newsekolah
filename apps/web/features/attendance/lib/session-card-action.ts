import type { SessionFillStatus } from "./session-schedule";

/**
 * Which control a session card in the day list shows on its right side
 * (docs/07-ui-ux.md's bento day view): the running, unsubmitted lesson gets
 * the primary "Isi presensi" action; any other unsubmitted lesson (a future
 * period today, or any session on a different date) gets the quieter
 * "Buka"; a submitted lesson -- saved or locked -- always shows the
 * "Tersimpan" badge, which stays clickable to open or correct it.
 */
export type SessionCardAction = "fill" | "open" | "saved";

export function deriveSessionCardAction(
  fillStatus: SessionFillStatus,
  timing: "ongoing" | "next" | null,
): SessionCardAction {
  if (fillStatus !== "empty") return "saved";
  return timing === "ongoing" ? "fill" : "open";
}
