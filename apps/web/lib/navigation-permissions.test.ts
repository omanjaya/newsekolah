import { describe, expect, it } from "vitest";

import { canOpenPathFixture, navAccessFixture } from "./navigation-access.fixture";
import { pathAccess } from "./navigation-permissions";

const grants =
  (...codes: string[]) =>
  (permission: string) =>
    codes.includes(permission);

describe("canOpenPath", () => {
  it("refuses the teaching journal to staff who lack its permission", () => {
    expect(canOpenPathFixture("/journal", grants("view_dashboard"), "staff")).toBe(false);
  });

  it("refuses the teaching journal to a student, whose profile it is not for", () => {
    expect(canOpenPathFixture("/journal", grants("view_academic_data"), "student")).toBe(false);
  });

  it("opens the teaching journal for a teacher", () => {
    expect(canOpenPathFixture("/journal", grants("view_academic_data"), "teacher")).toBe(true);
  });

  it("opens the teaching journal for staff who are not librarians", () => {
    expect(canOpenPathFixture("/journal", grants("view_academic_data"), "staff", ["staff"])).toBe(
      true,
    );
  });

  it("refuses the teaching journal to a librarian even though their staff profile and view_academic_data would otherwise open it", () => {
    expect(
      canOpenPathFixture("/journal", grants("view_academic_data"), "staff", ["librarian"]),
    ).toBe(false);
  });

  it("allows paths the registry does not know", () => {
    expect(canOpenPathFixture("/not-in-the-registry", grants(), undefined)).toBe(true);
  });
});

describe("pathAccess with disabled modules", () => {
  const allowAll = () => true;

  it("opens a module page while the module is on", () => {
    expect(pathAccess("/library/catalogue", navAccessFixture(allowAll, "staff"))).toBe("ok");
  });

  it("reports module-disabled for a reader who would otherwise be allowed in", () => {
    const access = navAccessFixture(allowAll, "staff", [], ["library"]);
    expect(pathAccess("/library/catalogue", access)).toBe("module-disabled");
    expect(canOpenPathFixture("/library/catalogue", allowAll, "staff", [], ["library"])).toBe(
      false,
    );
  });

  it("covers detail routes below a registered page", () => {
    const access = navAccessFixture(allowAll, "teacher", [], ["discipline"]);
    expect(pathAccess("/discipline/students/abc", access)).toBe("module-disabled");
    expect(
      pathAccess(
        "/supervision/observations/abc",
        navAccessFixture(allowAll, "teacher", [], ["supervision"]),
      ),
    ).toBe("module-disabled");
  });

  it("keeps saying forbidden when the reader lacks the permission, module on or off", () => {
    expect(
      pathAccess(
        "/library/catalogue",
        navAccessFixture(() => false, "staff", [], ["library"]),
      ),
    ).toBe("forbidden");
    expect(
      pathAccess(
        "/library/catalogue",
        navAccessFixture(() => false, "staff"),
      ),
    ).toBe("forbidden");
  });

  it("leaves pages of other modules and always-on pages alone", () => {
    const access = navAccessFixture(allowAll, "staff", [], ["library"]);
    expect(pathAccess("/billing", access)).toBe("ok");
    expect(pathAccess("/school/classes", access)).toBe("ok");
    expect(pathAccess("/not-in-the-registry", access)).toBe("ok");
  });
});
