import { resolveDefaultTabGroup, resolveTabGroups, hasMultipleTabGroups } from "@/lib/auth/roles";
import type { Role } from "@/lib/api/types";

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
      roles: [role("teacher", true), role("librarian")],
    };
    expect(resolveTabGroups(me)).toEqual(["teacher", "staff"]);
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
    const me = { profile_kind: "staff" as const, roles: [role("some_custom_role")] };
    expect(resolveDefaultTabGroup(me)).toBe("staff");
  });

  it("keeps the fixed group order (student, teacher, staff) regardless of role order", () => {
    const me = {
      profile_kind: undefined,
      roles: [role("librarian"), role("student"), role("staff")],
    };
    expect(resolveTabGroups(me)).toEqual(["student", "staff"]);
  });

  it("resolves to no group at all when nothing recognized is present -- the caller shows a clear message instead of guessing a home", () => {
    const me = { profile_kind: undefined, roles: [] };
    expect(resolveTabGroups(me)).toEqual([]);
    expect(resolveDefaultTabGroup(me)).toBeNull();
  });

  it("resolves to no group when every role slug is unrecognized and profile_kind is absent", () => {
    const me = { profile_kind: undefined, roles: [role("retired_role")] };
    expect(resolveTabGroups(me)).toEqual([]);
    expect(resolveDefaultTabGroup(me)).toBeNull();
    expect(hasMultipleTabGroups(me)).toBe(false);
  });
});
