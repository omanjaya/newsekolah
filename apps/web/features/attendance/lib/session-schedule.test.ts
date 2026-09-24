import { describe, expect, it } from "vitest";

import { classifyPeriodTiming, deriveFillStatus, findNextSessionId } from "./session-schedule";

describe("deriveFillStatus", () => {
  it("is empty when nothing has been submitted", () => {
    expect(deriveFillStatus(undefined, "2026-09-24", "2026-09-24")).toBe("empty");
  });

  it("is saved when submitted today", () => {
    expect(deriveFillStatus("2026-09-24T07:12:00Z", "2026-09-24", "2026-09-24")).toBe("saved");
  });

  it("is locked when submitted on a date before today", () => {
    expect(deriveFillStatus("2026-09-20T07:12:00Z", "2026-09-20", "2026-09-24")).toBe("locked");
  });
});

describe("classifyPeriodTiming", () => {
  const window = { startsAt: "07:00:00", endsAt: "07:45:00" };

  it("is before when now precedes the start", () => {
    expect(classifyPeriodTiming("06:59:59", window)).toBe("before");
  });

  it("is ongoing within the window, inclusive of both ends", () => {
    expect(classifyPeriodTiming("07:00:00", window)).toBe("ongoing");
    expect(classifyPeriodTiming("07:45:00", window)).toBe("ongoing");
  });

  it("is after when now is past the end", () => {
    expect(classifyPeriodTiming("07:45:01", window)).toBe("after");
  });
});

describe("findNextSessionId", () => {
  const sessions = [
    { id: "b", startsAt: "09:00:00", endsAt: "09:45:00" },
    { id: "a", startsAt: "07:00:00", endsAt: "07:45:00" },
    { id: "c", startsAt: "10:00:00", endsAt: "10:45:00" },
  ];
  const getWindow = (s: (typeof sessions)[number]) => ({ startsAt: s.startsAt, endsAt: s.endsAt });

  it("picks the soonest session that has not started yet", () => {
    expect(findNextSessionId(sessions, (s) => s.id, getWindow, "08:00:00")).toBe("b");
  });

  it("returns null once every session has started", () => {
    expect(findNextSessionId(sessions, (s) => s.id, getWindow, "11:00:00")).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(
      findNextSessionId([], (s: (typeof sessions)[number]) => s.id, getWindow, "08:00:00"),
    ).toBeNull();
  });
});
