import { describe, expect, it } from "vitest";

import {
  POLICY_FIELDS,
  POLICY_GROUPS,
  visiblePolicyFields,
  visiblePolicyGroups,
} from "./policy-fields";

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

  it("keeps the fields in the order of the form's sections", () => {
    expect(POLICY_GROUPS.flatMap((group) => group.fields)).toEqual(POLICY_FIELDS);
  });

  it("hides the grade-trend fields while grading is off", () => {
    const shown = visiblePolicyFields(off("grading"));
    expect(shown.filter((key) => key.startsWith("grade_"))).toEqual([]);
    expect(shown).toContain("discipline_weight");
    expect(shown).toContain("watch_score");
  });
});

describe("visiblePolicyGroups", () => {
  it("drops a section whose every field belongs to a switched-off module", () => {
    const groups = visiblePolicyGroups(off("discipline"));
    expect(groups.map((group) => group.id)).toEqual([
      "window",
      "attendance",
      "gradeDrop",
      "weights",
      "totalScore",
    ]);
    expect(groups.find((group) => group.id === "weights")?.fields).toEqual([
      "attendance_weight",
      "grade_weight",
    ]);
  });
});
