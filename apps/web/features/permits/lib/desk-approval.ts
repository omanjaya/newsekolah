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

/**
 * What the desk QR means for the scanning student, so a scan that cannot
 * approve anything says why instead of sending them to request a permit
 * they already have:
 * - `ready`: a permit waits on the desk; the scan approves it.
 * - `elsewhere`: the permit in progress waits on another stage (Guru BK,
 *   say), whose own QR the student must scan.
 * - `awaitingGate`: every stage has passed; the gate QR comes next.
 * - `none`: no exit permit is under way.
 */
export type DeskApprovalTarget<T> =
  | { kind: "ready"; permit: T }
  | { kind: "elsewhere"; stage: WorkflowStage }
  | { kind: "awaitingGate" }
  | { kind: "none" };

export function deskApprovalTarget<T extends { status: string; current_stage?: WorkflowStage }>(
  permits: readonly T[],
): DeskApprovalTarget<T> {
  const waiting = permitAwaitingDeskApproval(permits);
  if (waiting) return { kind: "ready", permit: waiting };
  const stage = permits.find((p) => p.status === "in_progress" && p.current_stage)?.current_stage;
  if (stage) return { kind: "elsewhere", stage };
  if (permits.some((p) => p.status === "approved")) return { kind: "awaitingGate" };
  return { kind: "none" };
}

/**
 * The stage a successful stage scan just approved, read from the instance
 * the API returns: the index moves past it while the permit is still in
 * progress, and stays on the last stage once every stage has passed
 * (domain.Definition.NextIndex).
 */
export function stageJustApproved(instance: {
  status: string;
  current_stage_index: number;
  stages: readonly WorkflowStage[];
}): WorkflowStage | undefined {
  const index =
    instance.status === "in_progress"
      ? instance.current_stage_index - 1
      : instance.current_stage_index;
  return instance.stages[index];
}
