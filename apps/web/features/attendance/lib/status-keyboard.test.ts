import { describe, expect, it } from "vitest";

import { resolveStatusKey } from "./status-keyboard";

describe("resolveStatusKey", () => {
  it("moves forward on ArrowRight and ArrowDown, wrapping past the last status", () => {
    expect(resolveStatusKey("ArrowRight", 0, 3)).toEqual({ type: "select", index: 1 });
    expect(resolveStatusKey("ArrowDown", 2, 3)).toEqual({ type: "select", index: 0 });
  });

  it("moves backward on ArrowLeft and ArrowUp, wrapping before the first status", () => {
    expect(resolveStatusKey("ArrowLeft", 1, 3)).toEqual({ type: "select", index: 0 });
    expect(resolveStatusKey("ArrowUp", 0, 3)).toEqual({ type: "select", index: 2 });
  });

  it("jumps to the first and last status on Home and End", () => {
    expect(resolveStatusKey("Home", 2, 5)).toEqual({ type: "select", index: 0 });
    expect(resolveStatusKey("End", 0, 5)).toEqual({ type: "select", index: 4 });
  });

  it("jumps straight to the nth status on a digit key", () => {
    expect(resolveStatusKey("1", 0, 5)).toEqual({ type: "select", index: 0 });
    expect(resolveStatusKey("3", 0, 5)).toEqual({ type: "select", index: 2 });
  });

  it("ignores a digit beyond the number of statuses", () => {
    expect(resolveStatusKey("9", 0, 3)).toEqual({ type: "none" });
  });

  it("ignores an unrelated key", () => {
    expect(resolveStatusKey("Tab", 0, 3)).toEqual({ type: "none" });
    expect(resolveStatusKey("a", 0, 3)).toEqual({ type: "none" });
  });

  it("never selects out of an empty group", () => {
    expect(resolveStatusKey("ArrowRight", 0, 0)).toEqual({ type: "none" });
  });
});
