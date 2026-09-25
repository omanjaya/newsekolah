import { describe, expect, it } from "vitest";

import { selectDailyTask } from "./daily-task-shortcut";

const noPermissions = {
  canManageAttendance: false,
  canManageCirculation: false,
  canIssueScanTokens: false,
  canViewAcademicData: false,
  canViewOwnGrades: false,
};

describe("selectDailyTask", () => {
  it("prioritizes the teacher's attendance work", () => {
    expect(
      selectDailyTask({ ...noPermissions, canManageAttendance: true, profileKind: "teacher" }),
    ).toBe("attendance");
  });

  it("only offers operational shortcuts with their required permission", () => {
    expect(selectDailyTask({ ...noPermissions, canManageCirculation: true })).toBe("circulation");
    expect(selectDailyTask({ ...noPermissions, canIssueScanTokens: true })).toBe("duty");
    expect(selectDailyTask({ ...noPermissions, profileKind: "staff" })).toBeNull();
    expect(
      selectDailyTask({ ...noPermissions, profileKind: "student", canViewOwnGrades: true }),
    ).toBe("grades");
    expect(
      selectDailyTask({ ...noPermissions, profileKind: "staff", canViewAcademicData: true }),
    ).toBe("schoolData");
  });
});
