import { describe, expect, it } from "vitest";

import type { GradebookStudent } from "../api";

import {
  gradebookClassAverage,
  gradebookFillPercentage,
  gradebookTuntasRate,
  gradebookUngradedCount,
  isStudentTuntas,
} from "./gradebook-stats";

function student(overrides: Partial<GradebookStudent> = {}): GradebookStudent {
  return {
    student_user_id: "s1",
    name: "Siswa",
    scores: {},
    ...overrides,
  };
}

describe("gradebookFillPercentage", () => {
  it("is 100 when there are no components or no students (nothing to fill)", () => {
    expect(gradebookFillPercentage([], 3)).toBe(100);
    expect(gradebookFillPercentage([student()], 0)).toBe(100);
  });

  it("divides filled slots by total slots, rounded", () => {
    const students = [
      student({ student_user_id: "s1", scores: { c1: 80, c2: 90 } }),
      student({ student_user_id: "s2", scores: { c1: 70 } }),
    ];
    // 3 filled out of 4 slots = 75%.
    expect(gradebookFillPercentage(students, 2)).toBe(75);
  });

  it("never counts more filled slots than components exist, for a stale score bag", () => {
    const students = [student({ scores: { c1: 1, c2: 2, c3: 3 } })];
    expect(gradebookFillPercentage(students, 2)).toBe(100);
  });
});

describe("gradebookClassAverage", () => {
  it("is undefined when nobody has an average yet", () => {
    expect(gradebookClassAverage([student(), student()])).toBeUndefined();
  });

  it("averages only the students who already have a computed average", () => {
    const students = [
      student({ student_user_id: "s1", average: 80 }),
      student({ student_user_id: "s2", average: 90 }),
      student({ student_user_id: "s3" }),
    ];
    expect(gradebookClassAverage(students)).toBe(85);
  });
});

describe("isStudentTuntas", () => {
  it("is undefined when the student has no score at all", () => {
    expect(isStudentTuntas(student(), 75)).toBeUndefined();
  });

  it("prefers report_score over average when both are present", () => {
    expect(isStudentTuntas(student({ average: 60, report_score: 80 }), 75)).toBe(true);
  });

  it("falls back to average when there is no report_score", () => {
    expect(isStudentTuntas(student({ average: 70 }), 75)).toBe(false);
  });

  it("uses the student's own final_kktp over the tenant default", () => {
    expect(isStudentTuntas(student({ average: 70, final_kktp: 65 }), 75)).toBe(true);
  });

  it("is tuntas exactly at the threshold", () => {
    expect(isStudentTuntas(student({ average: 75 }), 75)).toBe(true);
  });
});

describe("gradebookTuntasRate", () => {
  it("is 0 for an empty class", () => {
    expect(gradebookTuntasRate([], 75)).toBe(0);
  });

  it("counts an ungraded student against the rate", () => {
    const students = [
      student({ student_user_id: "s1", average: 80 }),
      student({ student_user_id: "s2" }),
    ];
    expect(gradebookTuntasRate(students, 75)).toBe(50);
  });
});

describe("gradebookUngradedCount", () => {
  it("counts students with no computed average", () => {
    const students = [
      student({ student_user_id: "s1", average: 80 }),
      student({ student_user_id: "s2" }),
      student({ student_user_id: "s3" }),
    ];
    expect(gradebookUngradedCount(students)).toBe(2);
  });
});
