import { describe, expect, it } from "vitest";

import { studentsToMarkPresent } from "./bulk-actions";

const roster = [
  { student_user_id: "s1" },
  { student_user_id: "s2" },
  { student_user_id: "s3" },
  { student_user_id: "s4" },
  { student_user_id: "s5", blocked: true },
];

describe("studentsToMarkPresent", () => {
  it("includes every unblocked student when nothing is marked yet", () => {
    expect(studentsToMarkPresent(roster, {}, "H")).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("excludes a blocked (leave/permit-locked) row", () => {
    const result = studentsToMarkPresent(roster, {}, "H");
    expect(result).not.toContain("s5");
  });

  it("does not overwrite sick, excused, or dispensation", () => {
    const statuses = { s1: "S", s2: "I", s3: "D", s4: "H" };
    expect(studentsToMarkPresent(roster, statuses, "H")).toEqual(["s4"]);
  });

  it("sweeps an unmarked absence back to present", () => {
    const statuses = { s1: "A" };
    expect(studentsToMarkPresent(roster, statuses, "H")).toContain("s1");
  });
});
