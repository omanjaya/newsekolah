import { describe, expect, it } from "vitest";

import { formatBillPeriod } from "./bill-period";

describe("formatBillPeriod", () => {
  it("shows a monthly period as its month", () => {
    expect(formatBillPeriod("2026-11", "id")).toBe("November 2026");
    expect(formatBillPeriod("2027-01", "en")).toBe("January 2027");
  });

  it("keeps a one-off fee's own label as typed", () => {
    expect(formatBillPeriod("2026-07-uang-pangkal", "id")).toBe("2026-07-uang-pangkal");
    expect(formatBillPeriod("Uang pangkal 2026", "id")).toBe("Uang pangkal 2026");
  });

  it("does not read an impossible month as a date", () => {
    expect(formatBillPeriod("2026-13", "id")).toBe("2026-13");
  });
});
