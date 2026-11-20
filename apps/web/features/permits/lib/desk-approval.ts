import type { components } from "@newsekolah/api-client";

type WorkflowStage = components["schemas"]["WorkflowStage"];

/**
 * Whether the duty desk's rotating approval QR can approve `stage`. That
 * QR names no permit (the scan supplies it), so the API accepts it only
 * for a QR-scan stage any active teacher may approve
 * (domain.AcceptsUnboundApproval); every other stage needs a QR from the
 * permit's own approver.
 */
export function acceptsDeskApproval(stage: WorkflowStage | undefined): boolean {
  return stage?.verification === "qr_scan" && stage.approver_rule === "any_teacher";
}

/**
 * The student's own exit permit the desk QR would approve: the one still
 * in progress whose current stage takes that QR (`acceptsDeskApproval`). A
 * student has at most one exit permit in progress, so this is unambiguous.
 */
export function permitAwaitingDeskApproval<
  T extends { status: string; current_stage?: WorkflowStage },
>(permits: readonly T[]): T | undefined {
  return permits.find(
    (permit) => permit.status === "in_progress" && acceptsDeskApproval(permit.current_stage),
  );
}
