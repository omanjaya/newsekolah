import { describe, expect, it } from "vitest";

import type { ExitPermitSummary, LateArrivalSummary, LeaveRequestSummary } from "../api";

import { mergePermitQueues } from "./permit-queue";

const leave: LeaveRequestSummary = {
  instance_id: "overlapping-id",
  student_user_id: "student",
  student_name: "Siswa",
  class_name: "7A",
  status: "in_progress",
  current_stage_index: 0,
  category: "sick",
  starts_on: "2026-09-29",
  ends_on: "2026-09-29",
  opened_at: "2026-09-29T08:00:00Z",
  school_days: 1,
};
const exit: ExitPermitSummary = {
  instance_id: "overlapping-id",
  student_user_id: "student",
  student_name: "Siswa",
  status: "approved",
  current_stage_index: 1,
  destination: "Klinik",
  opened_at: "2026-09-29T07:00:00Z",
};

describe("combined permit queue", () => {
  it("keeps the leave summary on its row, so the card can show the leave dates", () => {
    const [row] = mergePermitQueues({ leave: [leave] });
    expect(row).toMatchObject({ type: "leave", leave: { starts_on: "2026-09-29" } });
  });

  it("keeps separate workflow kinds sorted by opened time", () => {
    const rows = mergePermitQueues({ leave: [leave], exit: [exit] });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.type)).toEqual(["exit", "leave"]);
    expect(rows.map((row) => row.status)).toEqual(["approved", "in_progress"]);
  });

  it("carries a late arrival's class, so the class filter and card see it", () => {
    const late: LateArrivalSummary = {
      instance_id: "late-id",
      student_user_id: "student",
      class_name: "7B",
      status: "in_progress",
      current_stage_index: 0,
      current_stage: {
        key: "duty_teacher",
        label: "Guru piket",
        approver_rule: "any_teacher",
        verification: "manual",
      },
      reason: "Macet",
      occurrence_number: 1,
      required_action: "none",
      opened_at: "2026-09-29T06:00:00Z",
    };
    expect(mergePermitQueues({ late: [late] })).toEqual([
      expect.objectContaining({ type: "late", className: "7B" }),
    ]);
  });

  it("accepts unavailable sources and preserves only supplied scope", () => {
    expect(mergePermitQueues({})).toEqual([]);
    expect(mergePermitQueues({ leave: [leave] })).toEqual([
      expect.objectContaining({ type: "leave", studentId: "student" }),
    ]);
  });
});
