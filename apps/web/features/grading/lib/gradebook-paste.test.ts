import { describe, expect, it } from "vitest";

import { isMultiCellPaste, parsePastedGrid } from "./gradebook-paste";

describe("parsePastedGrid", () => {
  it("splits a single Excel column (newline-separated) into one column of rows", () => {
    expect(parsePastedGrid("80\n90\n75")).toEqual([["80"], ["90"], ["75"]]);
  });

  it("splits a multi-column Excel range (tab within each newline-separated row)", () => {
    expect(parsePastedGrid("80\t90\n75\t60")).toEqual([
      ["80", "90"],
      ["75", "60"],
    ]);
  });

  it("drops a trailing newline Excel appends to a copied column", () => {
    expect(parsePastedGrid("80\n90\n")).toEqual([["80"], ["90"]]);
  });

  it("treats a single pasted value as a 1x1 grid", () => {
    expect(parsePastedGrid("80")).toEqual([["80"]]);
  });

  it("treats empty clipboard text as a single empty cell", () => {
    expect(parsePastedGrid("")).toEqual([[""]]);
  });
});

describe("isMultiCellPaste", () => {
  it("is false for a single value", () => {
    expect(isMultiCellPaste([["80"]])).toBe(false);
  });

  it("is true for multiple rows", () => {
    expect(isMultiCellPaste([["80"], ["90"]])).toBe(true);
  });

  it("is true for multiple columns in one row", () => {
    expect(isMultiCellPaste([["80", "90"]])).toBe(true);
  });
});
