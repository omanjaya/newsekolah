import { describe, expect, it } from "vitest";

import type { MySubjectGrade } from "../api";

import {
  countScoredComponents,
  countTuntasSubjects,
  isSubjectTuntas,
  myGradesOverallAverage,
  subjectEffectiveKktp,
} from "./my-grades-tiles";

function subject(overrides: Partial<MySubjectGrade> = {}): MySubjectGrade {
  return {
    subject_id: "subj-1",
    components: [],
    ...overrides,
  };
}

describe("subjectEffectiveKktp", () => {
  it("falls back to the tenant default when no component carries its own kktp", () => {
    const s = subject({ components: [{ code: "TG1", kind: "formative", score: 80 }] });
    expect(subjectEffectiveKktp(s, 75)).toBe(75);
  });

  it("uses the first component that carries its own kktp", () => {
    const s = subject({
      components: [
        { code: "TG1", kind: "formative", score: 80 },
        { code: "TG2", kind: "formative", score: 70, kktp: 70 },
      ],
    });
    expect(subjectEffectiveKktp(s, 75)).toBe(70);
  });
});

describe("isSubjectTuntas", () => {
  it("is undefined when the subject has no score at all", () => {
    expect(isSubjectTuntas(subject(), 75)).toBeUndefined();
  });

  it("prefers report_score over average", () => {
    expect(isSubjectTuntas(subject({ average: 60, report_score: 80 }), 75)).toBe(true);
  });

  it("compares the average against the effective kktp when there is no report_score", () => {
    expect(isSubjectTuntas(subject({ average: 70 }), 75)).toBe(false);
  });
});

describe("myGradesOverallAverage", () => {
  it("is undefined with no scored subjects", () => {
    expect(myGradesOverallAverage([subject(), subject()])).toBeUndefined();
  });

  it("averages report_score (preferred) and average across subjects", () => {
    const subjects = [
      subject({ subject_id: "a", report_score: 90 }),
      subject({ subject_id: "b", average: 70 }),
    ];
    expect(myGradesOverallAverage(subjects)).toBe(80);
  });
});

describe("countTuntasSubjects", () => {
  it("counts only subjects at or above their kktp", () => {
    const subjects = [
      subject({ subject_id: "a", average: 80 }),
      subject({ subject_id: "b", average: 60 }),
      subject({ subject_id: "c" }),
    ];
    expect(countTuntasSubjects(subjects, 75)).toBe(1);
  });
});

describe("countScoredComponents", () => {
  it("sums every component across every subject", () => {
    const subjects = [
      subject({
        subject_id: "a",
        components: [
          { code: "TG1", kind: "formative", score: 80 },
          { code: "TG2", kind: "formative", score: 90 },
        ],
      }),
      subject({ subject_id: "b", components: [{ code: "TG1", kind: "formative", score: 70 }] }),
    ];
    expect(countScoredComponents(subjects)).toBe(3);
  });
});
