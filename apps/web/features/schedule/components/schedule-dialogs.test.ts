import { describe, expect, it } from "vitest";

import type { ScheduleBlock } from "../api";

import { editDateConfig } from "./schedule-dialogs";

const dates = {
  today: "2026-11-20",
  weekStart: "2026-11-16",
  yearStart: "2026-07-13",
  yearEnd: "2027-06-30",
};

const block: ScheduleBlock = {
  schedule_ids: ["schedule-1"],
  class_id: "class-1",
  subject_id: "subject-1",
  teacher_user_id: "teacher-1",
  day_of_week: 4,
  start_seq: 1,
  end_seq: 1,
  source: "admin",
  effective_from: "2026-07-16",
  has_history: true,
  mutation_policy: {
    can_edit: true,
    can_delete: true,
    has_history: true,
    requires_effective_from: true,
    min_effective_from: "2026-11-21",
  },
};

describe("editDateConfig", () => {
  it("dates a change to a block with history from the server's earliest date", () => {
    expect(editDateConfig(dates, block)).toEqual({
      mode: "dated",
      defaultValue: "2026-11-21",
      min: "2026-11-21",
      max: "2027-06-30",
      today: "2026-11-20",
    });
  });

  it("offers no date after a planned end the block already has", () => {
    const ending = { ...block, effective_until: "2026-12-03" };
    const config = editDateConfig({ ...dates, weekStart: "2026-12-14" }, ending);
    expect(config.max).toBe("2026-12-03");
    expect(config.defaultValue).toBe("2026-12-03");
  });

  it("asks no date of a block without history", () => {
    const fresh = {
      ...block,
      has_history: false,
      mutation_policy: { can_edit: true, can_delete: true },
    };
    expect(editDateConfig(dates, fresh).mode).toBe("none");
  });
});
