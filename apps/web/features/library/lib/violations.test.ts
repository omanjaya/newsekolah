import { describe, expect, it } from "vitest";

import {
  isOutstandingViolation,
  isUnpaidFine,
  isUnsettledSuspension,
  unpaidFineTotal,
} from "./violations";

describe("library violation settlement", () => {
  it("never reads a warning or a suspension as an unpaid fine", () => {
    const warning = { status: "unpaid", penalty: "warning", amount: 0 } as const;
    const suspension = { status: "unpaid", penalty: "suspend", amount: 0 } as const;
    for (const violation of [warning, suspension]) {
      expect(isUnpaidFine(violation)).toBe(false);
      expect(isOutstandingViolation(violation)).toBe(false);
    }
    expect(unpaidFineTotal([warning, suspension])).toBe(0);
  });

  it("counts an unpaid fine with an amount and a book to replace as outstanding", () => {
    const fine = { status: "unpaid", penalty: "fine", amount: 1500 } as const;
    const replace = { status: "unpaid", penalty: "replace_book", amount: 0 } as const;
    const paid = { status: "paid", penalty: "fine", amount: 2000 } as const;
    const zeroFine = { status: "unpaid", penalty: "fine", amount: 0 } as const;

    expect(isOutstandingViolation(fine)).toBe(true);
    expect(isOutstandingViolation(replace)).toBe(true);
    expect(isUnpaidFine(replace)).toBe(false);
    expect(isOutstandingViolation(paid)).toBe(false);
    expect(isOutstandingViolation(zeroFine)).toBe(false);
    expect(unpaidFineTotal([fine, replace, paid, zeroFine])).toBe(1500);
  });

  it("keeps only an unpaid suspension as an unsettled suspension", () => {
    expect(isUnsettledSuspension({ status: "unpaid", penalty: "suspend", amount: 0 })).toBe(true);
    expect(isUnsettledSuspension({ status: "paid", penalty: "suspend", amount: 0 })).toBe(false);
    expect(isUnsettledSuspension({ status: "unpaid", penalty: "fine", amount: 1500 })).toBe(false);
  });
});
