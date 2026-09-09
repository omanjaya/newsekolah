import { resolveDefaultTabGroup, resolveTabGroups, hasMultipleTabGroups } from "@/lib/auth/roles";
import type { Role } from "@/lib/api-types";

function role(slug: string, isPrimary = false): Role {
  return { id: slug, slug, name: slug, is_primary: isPrimary };
}

describe("role -> tab group mapping", () => {
  it("maps a single teacher role to the teacher group", () => {
    const me = { profile_kind: "teacher" as const, roles: [role("teacher", true)] };
    expect(resolveTabGroups(me)).toEqual(["teacher"]);
    expect(resolveDefaultTabGroup(me)).toBe("teacher");
    expect(hasMultipleTabGroups(me)).toBe(false);
  });

  it("exposes every group a multi-role account belongs to, teacher-first when teacher is primary", () => {
    const me = {
      profile_kind: "teacher" as const,
      roles: [role("teacher", true), role("parent")],
    };
    expect(resolveTabGroups(me)).toEqual(["teacher", "parent"]);
    expect(resolveDefaultTabGroup(me)).toBe("teacher");
    expect(hasMultipleTabGroups(me)).toBe(true);
  });

  it("defaults to the primary role's group even when profile_kind points elsewhere", () => {
    const me = {
      profile_kind: "student" as const,
      roles: [role("student"), role("librarian", true)],
    };
    expect(resolveDefaultTabGroup(me)).toBe("staff");
  });

  it("falls back to profile_kind when no role slug is recognized", () => {
    const me = { profile_kind: "parent" as const, roles: [role("some_custom_role")] };
    expect(resolveDefaultTabGroup(me)).toBe("parent");
  });

  it("falls back to staff when nothing resolves at all", () => {
    const me = { profile_kind: undefined, roles: [] };
    expect(resolveTabGroups(me)).toEqual(["staff"]);
    expect(resolveDefaultTabGroup(me)).toBe("staff");
  });

  it("keeps the fixed group order (student, teacher, staff, parent) regardless of role order", () => {
    const me = {
      profile_kind: undefined,
      roles: [role("parent"), role("student"), role("staff")],
    };
    expect(resolveTabGroups(me)).toEqual(["student", "staff", "parent"]);
  });
});
