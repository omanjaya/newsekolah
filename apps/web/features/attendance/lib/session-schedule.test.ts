import { describe, expect, it } from "vitest";

import {
  classifyPeriodTiming,
  countDayFillStatuses,
  deriveFillStatus,
  findNextSessionId,
} from "./session-schedule";

describe("deriveFillStatus", () => {
  const TODAY = "2026-09-24";
  // 10:00 on the 24th in Makassar (UTC+8).
  const NOW = new Date("2026-09-24T02:00:00Z");
  const OPEN = "2026-10-01T23:59:59+08:00";
  const base = { date: TODAY, today: TODAY, now: NOW, editableUntil: OPEN };

  it("is empty when nothing has been submitted and the viewer may still save", () => {
    expect(deriveFillStatus(base)).toBe("empty");
  });

  it("is saved when submitted and still within the viewer's save deadline", () => {
    expect(deriveFillStatus({ ...base, submittedAt: "2026-09-24T07:12:00Z" })).toBe("saved");
  });

  it("stays saved on an earlier date while the deadline is open, since the editor still saves it", () => {
    expect(
      deriveFillStatus({
        ...base,
        date: "2026-09-20",
        submittedAt: "2026-09-20T07:12:00Z",
        editableUntil: "2026-09-27T23:59:59+08:00",
      }),
    ).toBe("saved");
  });

  it("stays empty on an earlier date while the deadline is open", () => {
    expect(
      deriveFillStatus({ ...base, date: "2026-09-20", editableUntil: "2026-09-27T23:59:59+08:00" }),
    ).toBe("empty");
  });

  it("is locked once the deadline has passed for a submitted session", () => {
    expect(
      deriveFillStatus({
        ...base,
        date: "2026-09-10",
        submittedAt: "2026-09-10T07:12:00Z",
        editableUntil: "2026-09-17T23:59:59+08:00",
      }),
    ).toBe("locked");
  });

  it("is missed, not still to fill, once the deadline closed an unsaved session", () => {
    expect(
      deriveFillStatus({ ...base, date: "2026-09-10", editableUntil: "2026-09-17T23:59:59+08:00" }),
    ).toBe("missed");
  });

  it("treats a session the viewer may not save at all as closed", () => {
    expect(deriveFillStatus({ ...base, editableUntil: undefined })).toBe("missed");
    expect(
      deriveFillStatus({ ...base, editableUntil: undefined, submittedAt: "2026-09-24T01:00:00Z" }),
    ).toBe("locked");
  });

  it("is handed over when an accepted substitute fills it instead", () => {
    expect(deriveFillStatus({ ...base, handedOver: true })).toBe("handedOver");
  });

  it("shows the handover on a later day too, not only on the day itself", () => {
    expect(
      deriveFillStatus({ ...base, date: "2026-09-25", handedOver: true, editableUntil: undefined }),
    ).toBe("handedOver");
  });

  it("is upcoming for a lesson on a later day, which cannot be filled yet", () => {
    expect(deriveFillStatus({ ...base, date: "2026-09-25", editableUntil: undefined })).toBe(
      "upcoming",
    );
  });

  it("stays upcoming for a later-day lesson that was already submitted", () => {
    expect(
      deriveFillStatus({ ...base, date: "2026-09-25", submittedAt: "2026-09-24T02:09:48Z" }),
    ).toBe("upcoming");
  });
});

describe("countDayFillStatuses", () => {
  it("counts each lesson once, by its status, so nothing goes negative", () => {
    expect(
      countDayFillStatuses(["saved", "locked", "empty", "missed", "handedOver", "upcoming"]),
    ).toEqual({ saved: 2, pending: 1, missed: 1, handedOver: 1 });
  });

  it("leaves a submitted lesson on a later date out of saved and pending alike", () => {
    const status = deriveFillStatus({
      submittedAt: "2026-09-24T07:12:00Z",
      date: "2026-09-25",
      today: "2026-09-24",
      editableUntil: "2026-10-01T23:59:59+08:00",
      now: new Date("2026-09-24T14:30:00Z"),
    });
    expect(countDayFillStatuses([status])).toEqual({
      saved: 0,
      pending: 0,
      missed: 0,
      handedOver: 0,
    });
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
