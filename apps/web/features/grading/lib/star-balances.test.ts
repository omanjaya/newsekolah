import { describe, expect, it } from "vitest";

import { starBalanceLabel, starBalanceOf } from "./star-balances";

describe("starBalanceLabel", () => {
  it("shows a dash while the balances are unknown, not a false zero", () => {
    expect(starBalanceLabel(null, "s1")).toBe("-");
  });

  it("shows a loaded balance, and zero for a student with no stars yet", () => {
    const balances = new Map([["s1", 3]]);
    expect(starBalanceLabel(balances, "s1")).toBe("3");
    expect(starBalanceLabel(balances, "s2")).toBe("0");
  });
});

describe("starBalanceOf", () => {
  it("is null while the balances are unknown, so a dialog cannot print a false zero", () => {
    expect(starBalanceOf(null, "s1")).toBeNull();
  });

  it("is the loaded balance, and zero for a student with no stars yet", () => {
    const balances = new Map([["s1", 3]]);
    expect(starBalanceOf(balances, "s1")).toBe(3);
    expect(starBalanceOf(balances, "s2")).toBe(0);
  });
});
