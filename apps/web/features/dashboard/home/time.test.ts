import { describe, expect, it } from "vitest";

import {
  attendanceRate,
  isoWeekdayInZone,
  minutesInZone,
  parseClock,
  pickCurrentOrNext,
} from "./time";

describe("time helpers", () => {
  it("reads minutes in the tenant zone", () => {
    // 2026-09-26T01:40:00Z is 08:40 in Asia/Jakarta (UTC+7)
    expect(minutesInZone(new Date("2026-09-26T01:40:00Z"), "Asia/Jakarta")).toBe(520);
  });
  it("gives ISO weekday in zone", () => {
    // Saturday 26 Sep 2026 in Jakarta
    expect(isoWeekdayInZone(new Date("2026-09-26T01:40:00Z"), "Asia/Jakarta")).toBe(6);
    // Sunday 00:30 Jakarta is still Saturday in UTC
    expect(isoWeekdayInZone(new Date("2026-09-26T17:30:00Z"), "Asia/Jakarta")).toBe(7);
  });
  it("parses clock strings", () => {
    expect(parseClock("08:40")).toBe(520);
    expect(parseClock("08:40:00")).toBe(520);
  });
  it("picks the running item, else the next one", () => {
    const items = [
      { id: 1, start: 420, end: 500 },
      { id: 2, start: 520, end: 600 },
    ];
    expect(pickCurrentOrNext(items, 530)).toEqual({ item: items[1], state: "now" });
    expect(pickCurrentOrNext(items, 505)).toEqual({ item: items[1], state: "next" });
    expect(pickCurrentOrNext(items, 610)).toBeUndefined();
  });
  it("computes attendance rate over days that have a status", () => {
    expect(attendanceRate(["present", "late", "sick", null, "absent"], ["present", "late"])).toBe(
      50,
    );
    expect(attendanceRate([null, undefined], ["present"])).toBeUndefined();
  });
});
