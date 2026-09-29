import type { StepperStepState } from "@newsekolah/ui";

import type { WorkflowInstance } from "../api";

/**
 * The leave request workflow's two default stages (apps/api's
 * `domain.DefaultStages(KindLeaveRequest)`): the homeroom teacher reviews
 * first, then the counselor issues the letter. The "mine" list only has
 * `LeaveRequestSummary` (status + `current_stage_index`, no `stages`
 * array), so the compact card track can't read real per-tenant stage
 * labels the way `WorkflowStepper` does from a full `WorkflowInstance` --
 * it names the two known default stages instead, translated in the
 * component that renders this.
 */
export const LEAVE_MINE_STAGE_KEYS = ["homeroom", "counselor"] as const;
export type LeaveMineStageKey = (typeof LEAVE_MINE_STAGE_KEYS)[number];

export type MineStageTrackNodeKind = "submitted" | "stage" | "done";

export interface MineStageTrackNode {
  id: string;
  kind: MineStageTrackNodeKind;
  /** Set only for `kind: "stage"`. */
  stageKey?: LeaveMineStageKey;
  state: StepperStepState;
}

/**
 * Builds the compact horizontal track for a leave request card: "Diajukan"
 * (always already done) -> each default stage -> "Selesai" (done once the
 * letter is issued). Mirrors `WorkflowStepper`'s per-stage state rules so
 * the compact card view and the full detail view never disagree about
 * where a request stands.
 */
export function buildMineStageTrack(
  status: WorkflowInstance["status"],
  currentStageIndex: number,
): MineStageTrackNode[] {
  const terminal = status !== "in_progress" && status !== "approved" && status !== "completed";
  const currentIndex = Math.min(Math.max(currentStageIndex, 0), LEAVE_MINE_STAGE_KEYS.length - 1);

  const stageNodes: MineStageTrackNode[] = LEAVE_MINE_STAGE_KEYS.map((stageKey, index) => {
    let state: StepperStepState;
    if (status === "approved" || status === "completed") {
      state = "complete";
    } else if (index < currentIndex) {
      state = "complete";
    } else if (index === currentIndex) {
      state = terminal ? "stopped" : "current";
    } else {
      state = "upcoming";
    }
    return { id: stageKey, kind: "stage", stageKey, state };
  });

  return [
    { id: "submitted", kind: "submitted", state: "complete" },
    ...stageNodes,
    { id: "done", kind: "done", state: status === "completed" ? "complete" : "upcoming" },
  ];
}
