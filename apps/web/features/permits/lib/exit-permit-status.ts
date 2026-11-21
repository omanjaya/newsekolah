import type { WorkflowInstance } from "../api";

type WorkflowStatus = WorkflowInstance["status"];

/**
 * The status an exit permit reads as once `lessonsOver`
 * (`permitLessonsOver`: its last lesson has ended, or it is from an earlier
 * school day). A permit still on its way, or approved and never taken
 * through the gate, can then go no further (the API refuses its stages and
 * gate QR), so it reads as expired: the end the API's expiry job writes
 * after midnight, and the status the API already reports for a permit from
 * an earlier day. Any other status is the permit's own.
 */
export function exitPermitReadStatus(status: WorkflowStatus, lessonsOver: boolean): WorkflowStatus {
  return lessonsOver && (status === "in_progress" || status === "approved") ? "expired" : status;
}
