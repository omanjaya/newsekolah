import { describe, expect, it } from "vitest";

import type { AssessmentComponent, GradebookStudent } from "../api";

import {
  computeLiveAverage,
  countMissingComponents,
  countMissingForComponent,
  isScoreOutOfRange,
  mergeStudentScores,
  parseScoreInput,
  scoreProblem,
  withCellEdit,
} from "./gradebook-scores";

function component(id: string, weight: number): AssessmentComponent {
  return {
    id,
    class_id: "class-1",
    subject_id: "subject-1",
    term_id: "term-1",
    code: id.toUpperCase(),
    kind: "formative",
    weight,
    sequence: 1,
  };
}

function student(scores: Record<string, number>): GradebookStudent {
  return { student_user_id: "s1", name: "Siswa Satu", scores };
}

describe("mergeStudentScores", () => {
  it("keeps the saved score when there is no edit for that component", () => {
    const merged = mergeStudentScores(student({ c1: 80 }), {});
    expect(merged).toEqual({ c1: 80 });
  });

  it("overrides a saved score with a pending edit", () => {
    const merged = mergeStudentScores(student({ c1: 80 }), { c1: { s1: "90" } });
    expect(merged).toEqual({ c1: 90 });
  });

  it("treats a blank edit as clearing the score", () => {
    const merged = mergeStudentScores(student({ c1: 80 }), { c1: { s1: "" } });
    expect(merged).toEqual({});
  });

  it("ignores a non-numeric edit rather than corrupting the merged value", () => {
    const merged = mergeStudentScores(student({ c1: 80 }), { c1: { s1: "abc" } });
    expect(merged).toEqual({ c1: 80 });
  });

  it("adds a brand-new score that was never saved", () => {
    const merged = mergeStudentScores(student({}), { c1: { s1: "70" } });
    expect(merged).toEqual({ c1: 70 });
  });
});

describe("computeLiveAverage", () => {
  it("weighs each graded component by its own weight", () => {
    const components = [component("c1", 1), component("c2", 3)];
    // (80*1 + 90*3) / 4 = 87.5
    expect(computeLiveAverage(components, { c1: 80, c2: 90 })).toBeCloseTo(87.5);
  });

  it("skips an ungraded component instead of treating it as zero", () => {
    const components = [component("c1", 1), component("c2", 3)];
    expect(computeLiveAverage(components, { c1: 80 })).toBe(80);
  });

  it("is undefined when nothing is graded yet", () => {
    const components = [component("c1", 1)];
    expect(computeLiveAverage(components, {})).toBeUndefined();
  });
});

describe("countMissingComponents / countMissingForComponent", () => {
  const components = [component("c1", 1), component("c2", 1), component("c3", 1)];

  it("counts how many of a student's components have no score yet", () => {
    expect(countMissingComponents(components, { c1: 80 })).toBe(2);
  });

  it("counts how many students are missing one particular component", () => {
    const students = [student({ c1: 80 }), student({}), student({ c1: 70 })];
    expect(countMissingForComponent("c1", students, {})).toBe(1);
  });

  it("counts a pending edit as filled even before it is saved", () => {
    const students = [student({})];
    expect(countMissingForComponent("c1", students, { c1: { s1: "80" } })).toBe(0);
  });
});

describe("isScoreOutOfRange", () => {
  it("is false for a blank value (nothing to validate yet)", () => {
    expect(isScoreOutOfRange("", 0, 100)).toBe(false);
  });

  it("is false for a value inside the scale", () => {
    expect(isScoreOutOfRange("85", 0, 100)).toBe(false);
  });

  it("is true for a value above the scale maximum", () => {
    expect(isScoreOutOfRange("105", 0, 100)).toBe(true);
  });

  it("is true for a value below the scale minimum", () => {
    expect(isScoreOutOfRange("-5", 0, 100)).toBe(true);
  });

  it("is true for a non-numeric value", () => {
    expect(isScoreOutOfRange("abc", 0, 100)).toBe(true);
  });

  it("accepts a comma decimal as an Indonesian spreadsheet copies it", () => {
    expect(isScoreOutOfRange("78,5", 0, 100)).toBe(false);
  });
});

describe("parseScoreInput", () => {
  it("reads a comma or a point as the decimal separator", () => {
    expect(parseScoreInput("78,5")).toBe(78.5);
    expect(parseScoreInput("91,25")).toBe(91.25);
    expect(parseScoreInput("8,5")).toBe(8.5);
    expect(parseScoreInput(" 77.55 ")).toBe(77.55);
    expect(parseScoreInput("90")).toBe(90);
  });

  it("treats a blank cell as no score", () => {
    expect(parseScoreInput("")).toBeNull();
    expect(parseScoreInput("   ")).toBeNull();
  });

  it("refuses text it would have to guess at", () => {
    expect(parseScoreInput("abc")).toBe("invalid");
    expect(parseScoreInput("1.234,5")).toBe("invalid");
    expect(parseScoreInput("7,5,1")).toBe("invalid");
    expect(parseScoreInput("8 5")).toBe("invalid");
  });
});

describe("scoreProblem", () => {
  it("tells an unreadable value from one outside the scale", () => {
    expect(scoreProblem("abc", 0, 100)).toBe("format");
    expect(scoreProblem("105", 0, 100)).toBe("range");
    expect(scoreProblem("78,5", 0, 100)).toBeNull();
    expect(scoreProblem("", 0, 100)).toBeNull();
  });
});

describe("withCellEdit", () => {
  it("records a changed score, including a cleared one", () => {
    expect(withCellEdit({}, "c1", "s1", "80", 82)).toEqual({ c1: { s1: "80" } });
    expect(withCellEdit({}, "c1", "s1", "", 82)).toEqual({ c1: { s1: "" } });
  });

  it("drops the edit once the cell reads as the saved score again", () => {
    expect(withCellEdit({ c1: { s1: "80", s2: "70" } }, "c1", "s1", "82", 82)).toEqual({
      c1: { s2: "70" },
    });
    expect(withCellEdit({ c1: { s1: "8" } }, "c1", "s1", "82,0", 82)).toEqual({});
  });

  it("leaves nothing pending for a cell typed into and cleared again", () => {
    expect(withCellEdit({ c1: { s1: "65" } }, "c1", "s1", "", undefined)).toEqual({});
    expect(withCellEdit({ c1: { s1: "65" }, c2: { s1: "70" } }, "c1", "s1", "", undefined)).toEqual(
      { c2: { s1: "70" } },
    );
    const untouched = {};
    expect(withCellEdit(untouched, "c1", "s1", "", undefined)).toBe(untouched);
  });
});
