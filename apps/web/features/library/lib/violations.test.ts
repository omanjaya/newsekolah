import { describe, expect, it } from "vitest";

import {
  isOutstandingViolation,
  isUnpaidFine,
  isUnsettledSuspension,
  settlesByPayment,
  unpaidFineTotal,
  violationStatusLabelKey,
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

describe("library violation status label", () => {
  it("keeps the money words for a fine", () => {
    expect(settlesByPayment({ penalty: "fine" })).toBe(true);
    expect(violationStatusLabelKey({ status: "unpaid", penalty: "fine" })).toBe("unpaid");
    expect(violationStatusLabelKey({ status: "paid", penalty: "fine" })).toBe("paid");
    expect(violationStatusLabelKey({ status: "waived", penalty: "fine" })).toBe("waived");
  });

  // A suspension, a warning or a book to replace owes no money: never
  // "Belum dibayar" or "Lunas".
  it("labels a sanction without money as open or done", () => {
    for (const penalty of ["suspend", "warning", "replace_book"] as const) {
      expect(settlesByPayment({ penalty })).toBe(false);
      expect(violationStatusLabelKey({ status: "unpaid", penalty })).toBe("open");
      expect(violationStatusLabelKey({ status: "paid", penalty })).toBe("done");
    }
    for (const penalty of ["suspend", "replace_book"] as const) {
      expect(violationStatusLabelKey({ status: "waived", penalty })).toBe("waived");
    }
  });

  // A warning is stored settled when it is given and never waived by hand:
  // it read "Dibebaskan" (let off), as if it had been revoked.
  it("labels a given warning as done, also one stored waived", () => {
    expect(violationStatusLabelKey({ status: "paid", penalty: "warning" })).toBe("done");
    expect(violationStatusLabelKey({ status: "waived", penalty: "warning" })).toBe("done");
  });
});
