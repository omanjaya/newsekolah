import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../api";

import {
  EVENT_KIND_TONE,
  EVENT_KINDS,
  eventsInMonth,
  eventsOn,
  nonTeachingEventOn,
} from "./event-kinds";

function event(id: string, date: string, endDate = date): CalendarEvent {
  return { id, name: id, date, end_date: endDate, kind: "event" } as CalendarEvent;
}

describe("calendar event lookups", () => {
  const events = [
    event("uts", "2026-11-09", "2026-11-14"),
    event("hari-guru", "2026-11-25"),
    event("libur", "2026-12-22", "2027-01-02"),
    event("rapat", "2026-10-31", "2026-11-01"),
  ];

  it("finds every event that covers a day, both ends included", () => {
    expect(eventsOn(events, "2026-11-09").map((e) => e.id)).toEqual(["uts"]);
    expect(eventsOn(events, "2026-11-14").map((e) => e.id)).toEqual(["uts"]);
    expect(eventsOn(events, "2026-11-15")).toEqual([]);
  });

  it("lists a month's events, including ones that start before or end after it, earliest first", () => {
    expect(eventsInMonth(events, "2026-11").map((e) => e.id)).toEqual([
      "rapat",
      "uts",
      "hari-guru",
    ]);
    expect(eventsInMonth(events, "2027-01").map((e) => e.id)).toEqual(["libur"]);
    expect(eventsInMonth(events, "2027-02")).toEqual([]);
  });

  it("gives every kind its own colour", () => {
    const tones = EVENT_KINDS.map((kind) => EVENT_KIND_TONE[kind]);
    expect(new Set(tones).size).toBe(EVENT_KINDS.length);
  });
});

describe("nonTeachingEventOn", () => {
  const events = [
    { ...event("libur", "2026-11-25"), kind: "holiday" },
    { ...event("ujian", "2026-11-26"), kind: "exam" },
    { ...event("study-tour-x", "2026-11-27"), kind: "no_school", grade_level_ids: ["grade-x"] },
  ] as CalendarEvent[];

  it("finds a school-wide holiday but not an exam day", () => {
    expect(nonTeachingEventOn(events, "2026-11-25")?.id).toBe("libur");
    expect(nonTeachingEventOn(events, "2026-11-26")).toBeUndefined();
  });

  it("applies a grade-scoped day off only to that grade", () => {
    expect(nonTeachingEventOn(events, "2026-11-27", "grade-x")?.id).toBe("study-tour-x");
    expect(nonTeachingEventOn(events, "2026-11-27", "grade-xi")).toBeUndefined();
    expect(nonTeachingEventOn(events, "2026-11-27")).toBeUndefined();
  });
});
