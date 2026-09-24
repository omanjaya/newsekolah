import { describe, expect, it } from "vitest";

import { computeJournalChangeCount, computeRosterChanges } from "./change-tracking";

describe("computeRosterChanges", () => {
  it("reports no changes against an untouched snapshot", () => {
    const initial = { s1: "H", s2: "H" };
    const result = computeRosterChanges(initial, { s1: "", s2: "" }, {}, initial, {
      s1: "",
      s2: "",
    });
    expect(result.count).toBe(0);
    expect(result.changedStudentIds.size).toBe(0);
  });

  it("counts a status change and marks the row changed", () => {
    const initial = { s1: "H", s2: "H" };
    const result = computeRosterChanges({ s1: "S", s2: "H" }, {}, {}, initial, {});
    expect(result.count).toBe(1);
    expect(result.changedStudentIds).toEqual(new Set(["s1"]));
  });

  it("counts a note change independently of status", () => {
    const initial = { s1: "H" };
    const result = computeRosterChanges(initial, { s1: "demam" }, {}, initial, { s1: "" });
    expect(result.count).toBe(1);
    expect(result.changedStudentIds).toEqual(new Set(["s1"]));
  });

  it("counts status and note changes on the same student as two changes but one row", () => {
    const initial = { s1: "H" };
    const result = computeRosterChanges({ s1: "S" }, { s1: "demam" }, {}, initial, { s1: "" });
    expect(result.count).toBe(2);
    expect(result.changedStudentIds).toEqual(new Set(["s1"]));
  });

  it("counts any non-empty violation list as a change", () => {
    const initial = { s1: "H" };
    const result = computeRosterChanges(initial, {}, { s1: ["late"] }, initial, {});
    expect(result.count).toBe(1);
    expect(result.changedStudentIds).toEqual(new Set(["s1"]));
  });

  it("treats a missing initial note the same as an empty string", () => {
    const initial = { s1: "H" };
    const result = computeRosterChanges(initial, { s1: "" }, {}, initial, {});
    expect(result.count).toBe(0);
  });
});

describe("computeJournalChangeCount", () => {
  it("counts zero when nothing changed", () => {
    expect(computeJournalChangeCount("a", "b", "c", "a", "b", "c")).toBe(0);
  });

  it("counts each changed field independently", () => {
    expect(computeJournalChangeCount("a2", "b", "c2", "a", "b", "c")).toBe(2);
  });
});
