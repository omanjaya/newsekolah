import { describe, expect, it } from "vitest";

import type { ExitPermitSummary, LeaveRequestSummary } from "../api";

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
  it("keeps separate workflow kinds sorted by opened time", () => {
    const rows = mergePermitQueues({ leave: [leave], exit: [exit] });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.type)).toEqual(["exit", "leave"]);
    expect(rows.map((row) => row.status)).toEqual(["approved", "in_progress"]);
  });

  it("accepts unavailable sources and preserves only supplied scope", () => {
    expect(mergePermitQueues({})).toEqual([]);
    expect(mergePermitQueues({ leave: [leave] })).toEqual([
      expect.objectContaining({ type: "leave", studentId: "student" }),
    ]);
  });
});
