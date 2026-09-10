import { ApiError } from "@newsekolah/api-client";
import { describe, expect, it } from "vitest";

import { conflictMessage } from "./conflict-message";

const lookups = {
  classMap: new Map([["c1", { id: "c1", name: "X-A" }]]),
  subjectMap: new Map([["s1", { id: "s1", name: "Matematika" }]]),
  teacherMap: new Map([["t1", { id: "t1", name: "Budi" }]]),
  periods: [
    { sequence: 1, name: "Jam 1" },
    { sequence: 2, name: "Jam 2" },
  ],
};

/** Stands in for next-intl: echoes the key and its values. */
const t = (key: string, values?: Record<string, string>) =>
  values
    ? `${key}:${Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")}`
    : key;

function conflict(code: string, details: { field: string; code: string }[]) {
  return new ApiError({ status: 409, code, message: "clash", details });
}

const fullDetails = [
  { field: "class_id", code: "c1" },
  { field: "subject_id", code: "s1" },
  { field: "teacher_user_id", code: "t1" },
  { field: "start_seq", code: "1" },
  { field: "end_seq", code: "2" },
];

describe("conflictMessage", () => {
  it("names the class, teacher, subject and period range of a class clash", () => {
    const message = conflictMessage(conflict("SCHEDULE_CONFLICT_CLASS", fullDetails), lookups, t);

    expect(message).toBe(
      "conflictClassDetail:period=Jam 1-Jam 2,class=X-A,teacher=Budi,subject=Matematika",
    );
  });

  it("uses the teacher wording for a teacher clash", () => {
    const message = conflictMessage(conflict("SCHEDULE_CONFLICT_TEACHER", fullDetails), lookups, t);

    expect(message).toContain("conflictTeacherDetail");
  });

  it("collapses the range to one period when the lesson is a single period", () => {
    const single = fullDetails.map((d) => (d.field === "end_seq" ? { ...d, code: "1" } : d));

    expect(conflictMessage(conflict("SCHEDULE_CONFLICT_CLASS", single), lookups, t)).toContain(
      "period=Jam 1,",
    );
  });

  it("returns null for an error that is not a clash, so the caller falls back", () => {
    expect(conflictMessage(conflict("VALIDATION_FAILED", fullDetails), lookups, t)).toBeNull();
    expect(conflictMessage(new Error("network"), lookups, t)).toBeNull();
  });

  it("returns null when the server sent no detail to name", () => {
    expect(conflictMessage(conflict("SCHEDULE_CONFLICT_CLASS", []), lookups, t)).toBeNull();
  });
});
