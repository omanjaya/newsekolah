import { describe, expect, it } from "vitest";

import { fromText, toText } from "./number-text";

describe("fromText", () => {
  it("keeps an empty field empty", () => {
    expect(fromText("")).toBeNull();
    expect(fromText("  ")).toBeNull();
  });

  it("reads a typed number", () => {
    expect(fromText("75")).toBe(75);
    expect(fromText("0.5")).toBe(0.5);
  });

  it("never hands back NaN", () => {
    expect(fromText("abc")).toBeNull();
  });
});

describe("toText", () => {
  it("writes a number back as text and an empty value as an empty field", () => {
    expect(toText(12)).toBe("12");
    expect(toText(null)).toBe("");
  });
});
