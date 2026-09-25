import { describe, expect, it } from "vitest";

import { canOpenPath } from "./navigation-permissions";

const grants =
  (...codes: string[]) =>
  (permission: string) =>
    codes.includes(permission);

describe("canOpenPath", () => {
  it("refuses the teaching journal to staff who lack its permission", () => {
    expect(canOpenPath("/journal", grants("view_dashboard"), "staff")).toBe(false);
  });

  it("refuses the teaching journal to a student, whose profile it is not for", () => {
    expect(canOpenPath("/journal", grants("view_academic_data"), "student")).toBe(false);
  });

  it("opens the teaching journal for a teacher", () => {
    expect(canOpenPath("/journal", grants("view_academic_data"), "teacher")).toBe(true);
  });

  it("opens the teaching journal for staff who are not librarians", () => {
    expect(canOpenPath("/journal", grants("view_academic_data"), "staff", ["staff"])).toBe(true);
  });

  it("refuses the teaching journal to a librarian even though their staff profile and view_academic_data would otherwise open it", () => {
    expect(canOpenPath("/journal", grants("view_academic_data"), "staff", ["librarian"])).toBe(
      false,
    );
  });

  it("allows paths the registry does not know", () => {
    expect(canOpenPath("/not-in-the-registry", grants(), undefined)).toBe(true);
  });
});
