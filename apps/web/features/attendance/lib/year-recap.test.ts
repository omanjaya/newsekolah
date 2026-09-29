import { describe, expect, it } from "vitest";

import { yearRecapParts } from "./year-recap";

const STATUSES = [
  { code: "H", label: "Hadir", counts_as_present: true },
  { code: "S", label: "Sakit", counts_as_present: false },
  { code: "I", label: "Izin", counts_as_present: false },
  { code: "D", label: "Dispensasi", counts_as_present: false },
  { code: "A", label: "Alpha", counts_as_present: false },
];

describe("yearRecapParts", () => {
  it("keeps only the non-present statuses with a count above zero", () => {
    expect(yearRecapParts(STATUSES, { S: 1, I: 0, D: 3, A: 0 })).toEqual([
      { code: "S", label: "Sakit", count: 1 },
      { code: "D", label: "Dispensasi", count: 3 },
    ]);
  });

  it("returns an empty list when yearCounts is undefined", () => {
    expect(yearRecapParts(STATUSES, undefined)).toEqual([]);
  });

  it("returns an empty list when every count is zero", () => {
    expect(yearRecapParts(STATUSES, { S: 0, I: 0, D: 0, A: 0 })).toEqual([]);
  });

  it("ignores the present status even if it were given a count", () => {
    expect(yearRecapParts(STATUSES, { H: 20, S: 2 })).toEqual([
      { code: "S", label: "Sakit", count: 2 },
    ]);
  });

  it("returns an empty list when the policy has no exception statuses", () => {
    expect(
      yearRecapParts([{ code: "H", label: "Hadir", counts_as_present: true }], { H: 5 }),
    ).toEqual([]);
  });
});
