import { createFormatter } from "next-intl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatCalendarDate, formatCalendarDateRange } from "./format-calendar-date";

// The bug: a browser in Indonesia (UTC+7 to +9) parsed "2026-07-13" at its
// own midnight, and next-intl formatted it in another zone (UTC on the
// server, inherited by every client provider), so the term read "12 Jul".
// These run with the process in WITA and the formatter in each zone a
// page can be given.
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "Asia/Makassar";
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const ZONES = ["UTC", "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"];

describe("formatCalendarDate", () => {
  it.each(ZONES)("reads a date-only value as that day with the formatter in %s", (timeZone) => {
    const format = createFormatter({ locale: "id", timeZone });
    expect(formatCalendarDate(format, "2026-07-13")).toBe("13 Jul 2026");
  });

  it("takes another date shape, still on the same day", () => {
    const format = createFormatter({ locale: "id", timeZone: "UTC" });
    expect(
      formatCalendarDate(format, "2026-11-19", { weekday: "long", day: "numeric", month: "long" }),
    ).toBe("Kamis, 19 November");
  });
});

describe("formatCalendarDateRange", () => {
  it.each(ZONES)("joins both ends with an en dash in %s", (timeZone) => {
    const format = createFormatter({ locale: "id", timeZone });
    const range = formatCalendarDateRange(format, "2026-07-13", "2027-06-18");
    expect(range).toMatch(/^13 Jul 2026\s–\s18 Jun 2027$/);
  });

  it("says a span inside one month once", () => {
    const format = createFormatter({ locale: "id", timeZone: "Asia/Jakarta" });
    expect(formatCalendarDateRange(format, "2026-11-14", "2026-11-16")).toBe("14–16 Nov 2026");
  });

  it("says a one-day span as one date", () => {
    const format = createFormatter({ locale: "id", timeZone: "Asia/Jakarta" });
    expect(formatCalendarDateRange(format, "2026-11-14", "2026-11-14")).toBe("14 Nov 2026");
  });
});
