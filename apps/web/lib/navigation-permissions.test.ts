import { describe, expect, it } from "vitest";

import { canOpenPath } from "./navigation-permissions";

const grants =
  (...codes: string[]) =>
  (permission: string) =>
    codes.includes(permission);

describe("canOpenPath", () => {
  it("refuses the teaching journal to a parent, who lacks its permission", () => {
    expect(canOpenPath("/journal", grants("view_dashboard"), "parent")).toBe(false);
  });

  it("refuses the teaching journal to a student, whose profile it is not for", () => {
    expect(canOpenPath("/journal", grants("view_academic_data"), "student")).toBe(false);
  });

  it("opens the teaching journal for a teacher", () => {
    expect(canOpenPath("/journal", grants("view_academic_data"), "teacher")).toBe(true);
  });

  it("allows paths the registry does not know", () => {
    expect(canOpenPath("/not-in-the-registry", grants(), undefined)).toBe(true);
  });
});
