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
 *   say), which the desk QR cannot approve.
 * - `awaitingGate`: every stage has passed; the gate QR comes next.
 * - `none`: no exit permit is under way.
 */
export type DeskApprovalTarget<T> =
  | { kind: "ready"; permit: T }
  | { kind: "elsewhere"; permit: T; stage: WorkflowStage }
  | { kind: "awaitingGate"; permit: T }
  | { kind: "none" };

export function deskApprovalTarget<T extends { status: string; current_stage?: WorkflowStage }>(
  permits: readonly T[],
): DeskApprovalTarget<T> {
  const waiting = permitAwaitingDeskApproval(permits);
  if (waiting) return { kind: "ready", permit: waiting };
  const inProgress = permits.find((p) => p.status === "in_progress" && p.current_stage);
  if (inProgress?.current_stage) {
    return { kind: "elsewhere", permit: inProgress, stage: inProgress.current_stage };
  }
  const approved = permits.find((p) => p.status === "approved");
  if (approved) return { kind: "awaitingGate", permit: approved };
  return { kind: "none" };
}

/**
 * Why a desk QR scan approved nothing, as the student should hear it:
 * - `scanStage`: the permit waits on a QR-scan stage, whose own QR (from
 *   that stage's approver) the student must scan.
 * - `awaitingReview`: the permit waits on a stage the approver decides on
 *   their own screen (manual or automatic): there is no QR to scan.
 * - `awaitingGate`: every stage has passed; the gate QR comes next.
 * - `lessonsOver`: the permit's last lesson has ended, so the API refuses
 *   every further stage and its gate QR (EXIT_PERMIT_WINDOW_CLOSED) until
 *   the expiry job closes it. Neither the next stage nor the gate applies.
 * - `none`: no exit permit is under way.
 */
export type DeskRefusal =
  | { reason: "scanStage" | "awaitingReview"; stage: string }
  | { reason: "awaitingGate" | "lessonsOver" | "none" };

export function deskRefusal(
  target: Exclude<DeskApprovalTarget<unknown>, { kind: "ready" }>,
  lessonsOver: boolean,
): DeskRefusal {
  if (target.kind === "none") return { reason: "none" };
  if (lessonsOver) return { reason: "lessonsOver" };
  if (target.kind === "awaitingGate") return { reason: "awaitingGate" };
  return {
    reason: target.stage.verification === "qr_scan" ? "scanStage" : "awaitingReview",
    stage: target.stage.label,
  };
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
