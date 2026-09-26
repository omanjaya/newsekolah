import { describe, expect, it } from "vitest";

import { resolvePersonas } from "./personas";
import type { Me } from "./types";

const base = {
  id: "u",
  username: "u",
  name: "U",
  roles: [],
  permissions: [],
  must_change_password: false,
  tenant: {},
} as unknown as Me;

// `profile_kind` also accepts "parent" here even though Me's enum only lists
// "student" | "teacher" | "staff": a parent account has no profile_kind value
// in the real API, but the fixture needs some kind resolvePersonas is
// guaranteed to reject, so the test documents that case explicitly.
type MePatch = Partial<Omit<Me, "profile_kind">> & {
  profile_kind?: Me["profile_kind"] | "parent";
};

const me = (patch: MePatch): Me => ({ ...base, ...patch }) as unknown as Me;

describe("resolvePersonas", () => {
  it("combines teacher and homeroom for a homeroom teacher", () => {
    const p = resolvePersonas(
      me({
        profile_kind: "teacher",
        permissions: ["manage_attendance"],
        duties: [{ slug: "homeroom", scope_kind: "class", scope_id: "c1", scope_label: "X-A" }],
      }),
    );
    expect([...p].sort()).toEqual(["homeroom", "teacher"]);
  });
  it("does not treat a picket staff member as a teacher", () => {
    const p = resolvePersonas(
      me({
        profile_kind: "staff",
        permissions: ["manage_attendance"],
        duties: [{ slug: "picket", scope_kind: "school" }],
      }),
    );
    expect([...p]).toEqual(["picket"]);
  });
  it("recognises a student", () => {
    expect([...resolvePersonas(me({ profile_kind: "student" }))]).toEqual(["student"]);
  });
  it("maps admin and principal roles to leadership", () => {
    expect(
      resolvePersonas(
        me({
          roles: [{ id: "r", slug: "principal", name: "Kepala Sekolah", is_primary: true }],
        }),
      ).has("leadership"),
    ).toBe(true);
    expect(
      resolvePersonas(
        me({ roles: [{ id: "r", slug: "admin", name: "Admin", is_primary: true }] }),
      ).has("leadership"),
    ).toBe(true);
  });
  it("detects librarian and counselor", () => {
    const p = resolvePersonas(
      me({
        permissions: ["manage_library_circulation"],
        duties: [{ slug: "counselor", scope_kind: "school" }],
      }),
    );
    expect([...p].sort()).toEqual(["counselor", "librarian"]);
  });
  it("returns nothing for a parent", () => {
    expect(resolvePersonas(me({ profile_kind: "parent" })).size).toBe(0);
  });
});
