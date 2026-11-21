import { describe, expect, it } from "vitest";

import type { ScheduleBlock } from "./api";
import { effectiveCaption } from "./block-policy";

// The week of Monday 23 to Sunday 29 November 2026.
const WEEK = "2026-11-23";

function block(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    schedule_ids: ["schedule-1"],
    class_id: "class-1",
    subject_id: "subject-1",
    teacher_user_id: "teacher-1",
    day_of_week: 4,
    start_seq: 1,
    end_seq: 2,
    source: "admin",
    effective_from: "2026-07-13",
    ...overrides,
  };
}

describe("effectiveCaption", () => {
  it("says nothing for a block that covers the whole week", () => {
    expect(effectiveCaption(block(), WEEK)).toBeNull();
    expect(effectiveCaption(block({ effective_until: "2026-11-29" }), WEEK)).toBeNull();
    expect(effectiveCaption(block({ effective_from: WEEK }), WEEK)).toBeNull();
  });

  it("names the start of a block that begins after the week's Monday", () => {
    expect(effectiveCaption(block({ effective_from: "2026-11-26" }), WEEK)).toEqual({
      key: "startsOn",
      date: "2026-11-26",
    });
  });

  it("names the end of a block that stops before the week's Sunday", () => {
    expect(effectiveCaption(block({ effective_until: "2026-11-26" }), WEEK)).toEqual({
      key: "endsOn",
      date: "2026-11-26",
    });
  });

  // A lesson kept on its one recorded date when the rest of it was removed
  // from the next day on used to read only "Mulai Kam, 26 Nov", as if it
  // carried on: nothing in the week said it stops.
  it("says a version that starts and ends in the week takes place only then", () => {
    expect(
      effectiveCaption(
        block({ effective_from: "2026-11-26", effective_until: "2026-11-26" }),
        WEEK,
      ),
    ).toEqual({ key: "onlyOn", date: "2026-11-26", until: "2026-11-26" });
  });

  it("keeps both bounds of a version spanning several days of the week", () => {
    expect(
      effectiveCaption(
        block({ effective_from: "2026-11-24", effective_until: "2026-11-27" }),
        WEEK,
      ),
    ).toEqual({ key: "onlyOn", date: "2026-11-24", until: "2026-11-27" });
  });
});
