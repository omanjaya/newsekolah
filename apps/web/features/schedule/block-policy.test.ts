import { describe, expect, it } from "vitest";

import type { ScheduleBlock, ScheduleHold } from "./api";
import { blockLockedReasonKey, effectiveCaption, lockingHold } from "./block-policy";

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

describe("lockingHold", () => {
  const request: ScheduleHold = {
    kind: "substitution",
    id: "request-1",
    date: "2026-11-26",
    status: "pending",
  };

  it("names the pending request that keeps a block locked on its last date", () => {
    const held = block({
      effective_until: "2026-11-26",
      mutation_policy: {
        can_edit: false,
        can_delete: false,
        has_history: true,
        reason: "SCHEDULE_CHANGE_BEFORE_HISTORY",
        held_by: request,
      },
    });
    expect(blockLockedReasonKey(held)).toBe("blockBoundByHistory");
    expect(lockingHold(held)).toEqual(request);
  });

  it("has none for a block that is open, ended, or locked by history without one record", () => {
    // Open: the hold only moves the earliest "Berlaku mulai", shown in the dialog.
    const open = block({
      mutation_policy: {
        can_edit: true,
        can_delete: true,
        has_history: true,
        requires_effective_from: true,
        min_effective_from: "2026-11-27",
        held_by: request,
      },
    });
    const ended = block({
      effective_until: "2026-11-16",
      mutation_policy: {
        can_edit: false,
        can_delete: false,
        has_history: true,
        reason: "SCHEDULE_ENDED",
      },
    });
    const bound = block({
      effective_until: "2026-11-26",
      mutation_policy: {
        can_edit: false,
        can_delete: false,
        has_history: true,
        reason: "SCHEDULE_CHANGE_BEFORE_HISTORY",
      },
    });
    expect(lockingHold(open)).toBeUndefined();
    expect(lockingHold(ended)).toBeUndefined();
    expect(lockingHold(bound)).toBeUndefined();
    expect(lockingHold(block())).toBeUndefined();
  });
});
