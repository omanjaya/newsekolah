import { describe, expect, it } from "vitest";

import { POLICY_FIELDS, visiblePolicyFields } from "./policy-fields";

const off =
  (...modules: string[]) =>
  (module: string) =>
    !modules.includes(module);

describe("visiblePolicyFields", () => {
  it("shows every field while discipline and grading are on", () => {
    expect(visiblePolicyFields(off())).toEqual(POLICY_FIELDS);
  });

  it("hides the discipline and warning-letter fields while discipline is off", () => {
    const shown = visiblePolicyFields(off("discipline"));
    expect(
      shown.filter((key) => key.startsWith("discipline_") || key.startsWith("warning_")),
    ).toEqual([]);
    expect(shown).toContain("grade_weight");
    expect(shown).toContain("attendance_weight");
  });

  it("hides the grade-trend fields while grading is off", () => {
    const shown = visiblePolicyFields(off("grading"));
    expect(shown.filter((key) => key.startsWith("grade_"))).toEqual([]);
    expect(shown).toContain("discipline_weight");
    expect(shown).toContain("watch_score");
  });
});
