import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addDays,
  addIsoMonths,
  addMonths,
  formatIsoDate,
  formatIsoDateRange,
  localTodayIso,
  monthWeeks,
  parseIsoDate,
  weekdayIndex,
  weekdayNames,
} from "./iso-date.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("iso-date", () => {
  it("rejects strings that are not real calendar dates", () => {
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("14/11/2026")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });

  it("does day and month arithmetic across month, year and leap boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-15", -15)).toBe("2024-12-15");
    expect(addIsoMonths("2026-11", 2)).toBe("2027-01");
  });

  it("starts weeks on Monday", () => {
    expect(weekdayIndex("2026-11-16")).toBe(0);
    expect(weekdayIndex("2026-11-15")).toBe(6);
    const weeks = monthWeeks("2026-11");
    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.[0]).toBe("2026-10-26");
    expect(weeks[5]?.[6]).toBe("2026-12-06");
    expect(weekdayNames("id-ID", "short")).toEqual([
      "Sen",
      "Sel",
      "Rab",
      "Kam",
      "Jum",
      "Sab",
      "Min",
    ]);
  });

  it("keeps the calendar date whatever timezone the device is in", () => {
    const offsets = new Set<number>();
    for (const zone of ["Asia/Jakarta", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      // Node re-reads TZ when it changes, so the local zone really moves.
      vi.stubEnv("TZ", zone);
      offsets.add(new Date(2026, 10, 14).getTimezoneOffset());
      expect(formatIsoDate("2026-11-14", "id-ID")).toBe("14 November 2026");
      expect(addDays("2026-11-14", 1)).toBe("2026-11-15");
      expect(weekdayIndex("2026-11-14")).toBe(5);
    }
    expect(offsets.size).toBe(3);
  });

  it("formats dates and ranges per locale", () => {
    expect(formatIsoDate("2026-11-14", "en-US")).toBe("November 14, 2026");
    expect(
      formatIsoDateRange("2026-11-01", "2026-11-14", "id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    ).toBe("1–14 Nov 2026");
  });

  it("reads the local date from the device clock's own parts", () => {
    expect(localTodayIso(new Date(2026, 10, 14, 23, 59))).toBe("2026-11-14");
  });
});
