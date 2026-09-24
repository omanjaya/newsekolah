import { describe, expect, it } from "vitest";

import {
  computeAttendanceChanges,
  meetingStatusToken,
  studentsToMarkPresent,
} from "./meeting-status";

describe("meetingStatusToken", () => {
  it("maps every roster status code to a design-token family", () => {
    expect(meetingStatusToken("H")).toBe("present");
    expect(meetingStatusToken("I")).toBe("excused");
    expect(meetingStatusToken("S")).toBe("sick");
    expect(meetingStatusToken("A")).toBe("absent");
  });
});

describe("studentsToMarkPresent", () => {
  it("marks a student with no recorded status", () => {
    const ids = studentsToMarkPresent(["s1"], {});
    expect(ids).toEqual(["s1"]);
  });

  it("marks an already-absent student present", () => {
    const ids = studentsToMarkPresent(["s1"], { s1: "A" });
    expect(ids).toEqual(["s1"]);
  });

  it("does not overwrite an excused or sick status", () => {
    const ids = studentsToMarkPresent(["s1", "s2", "s3"], { s1: "I", s2: "S", s3: "H" });
    expect(ids).toEqual(["s3"]);
  });
});

describe("computeAttendanceChanges", () => {
  it("finds no changes when nothing differs from the snapshot", () => {
    const initial = { s1: "H" as const, s2: "A" as const };
    const changes = computeAttendanceChanges(initial, initial);
    expect(changes.count).toBe(0);
    expect(changes.changedStudentIds.size).toBe(0);
  });

  it("flags only the students whose status differs from the snapshot", () => {
    const initial = { s1: "H" as const, s2: "A" as const };
    const current = { s1: "H" as const, s2: "I" as const };
    const changes = computeAttendanceChanges(current, initial);
    expect(changes.count).toBe(1);
    expect(changes.changedStudentIds.has("s2")).toBe(true);
    expect(changes.changedStudentIds.has("s1")).toBe(false);
  });
});
