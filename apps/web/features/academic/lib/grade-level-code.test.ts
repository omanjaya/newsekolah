import { describe, expect, it } from "vitest";

import { codeRepeatsName } from "./grade-level-code";

describe("codeRepeatsName", () => {
  it("is true when the name already carries the code as a word", () => {
    expect(codeRepeatsName("X", "Kelas X")).toBe(true);
    expect(codeRepeatsName("1", "Kelas 1")).toBe(true);
    expect(codeRepeatsName("xii", "Kelas XII")).toBe(true);
  });

  it("is false when the code says something the name does not", () => {
    expect(codeRepeatsName("X", "Kelas XI")).toBe(false);
    expect(codeRepeatsName("10", "Kelas Sepuluh")).toBe(false);
  });
});
