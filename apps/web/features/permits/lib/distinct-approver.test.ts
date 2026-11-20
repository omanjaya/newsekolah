import type { components } from "@newsekolah/api-client";
import { describe, expect, it } from "vitest";

import { approvedDistinctStage } from "./distinct-approver";

type WorkflowInstance = components["schemas"]["WorkflowInstance"];
type WorkflowEvent = components["schemas"]["WorkflowEvent"];

const homeroom = {
  key: "homeroom",
  label: "Wali kelas",
  approver_rule: "homeroom_of_student",
  verification: "manual" as const,
};
const counselor = {
  key: "counselor",
  label: "Guru BK",
  approver_rule: "duty:counselor",
  verification: "manual" as const,
  distinct_from: ["homeroom"],
};

function event(stage: string, actor: string, at: string): WorkflowEvent {
  return {
    id: `${stage}-${at}`,
    stage_key: stage,
    to_status: "in_progress",
    actor_user_id: actor,
    verification: "manual",
    system_note: false,
    occurred_at: at,
  };
}

function atCounselor(events: WorkflowEvent[]): WorkflowInstance {
  return {
    id: "leave-1",
    kind: "leave_request",
    status: "in_progress",
    current_stage_index: 1,
    current_stage: counselor,
    stages: [homeroom, counselor],
    subject_user_id: "student-1",
    opened_at: "2026-12-01T00:00:00Z",
    events,
  };
}

describe("approvedDistinctStage", () => {
  it("names the stage the reader approved when the current stage must be someone else", () => {
    const inst = atCounselor([event("homeroom", "teacher-1", "2026-12-01T01:00:00Z")]);
    expect(approvedDistinctStage(inst, "teacher-1")).toBe("Wali kelas");
  });

  it("leaves another counselor free to act", () => {
    const inst = atCounselor([event("homeroom", "teacher-1", "2026-12-01T01:00:00Z")]);
    expect(approvedDistinctStage(inst, "counselor-2")).toBeUndefined();
  });

  it("reads the stage's latest event as its approver, as the API does", () => {
    const inst = atCounselor([
      event("homeroom", "teacher-1", "2026-12-01T01:00:00Z"),
      event("homeroom", "teacher-2", "2026-12-01T02:00:00Z"),
    ]);
    expect(approvedDistinctStage(inst, "teacher-1")).toBeUndefined();
    expect(approvedDistinctStage(inst, "teacher-2")).toBe("Wali kelas");
  });

  it("blocks nobody when the stage names no distinct stage, or the reader is unknown", () => {
    const inst = atCounselor([event("homeroom", "teacher-1", "2026-12-01T01:00:00Z")]);
    const open = { ...inst, current_stage: { ...counselor, distinct_from: undefined } };
    expect(approvedDistinctStage(open, "teacher-1")).toBeUndefined();
    expect(approvedDistinctStage(inst, undefined)).toBeUndefined();
  });
});
