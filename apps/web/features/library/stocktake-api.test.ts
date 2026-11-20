import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api/client", () => ({ useApiClient: vi.fn() }));
vi.mock("../../lib/api/access-token", () => ({ getAccessToken: () => null }));

import { stocktakeReportFileName } from "./stocktake-api";

describe("stocktakeReportFileName", () => {
  // The report downloaded as "laporan-opname-<uuid>.xlsx".
  it("names the report after the session and its start date", () => {
    expect(
      stocktakeReportFileName({
        id: "01a1fa0f-63e6-7f40-9089-b48b0e7abc80",
        name: "Opname Semester 1 / 2026",
        started_on: "2026-11-02",
      }),
    ).toBe("laporan-opname-opname-semester-1-2026-2026-11-02.xlsx");
  });

  it("falls back to the start date when the name leaves nothing usable", () => {
    expect(stocktakeReportFileName({ id: "st-1", name: "///", started_on: "2026-11-02" })).toBe(
      "laporan-opname-2026-11-02.xlsx",
    );
  });
});
