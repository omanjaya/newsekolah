import { Home } from "lucide-react";
import { describe, expect, it } from "vitest";

import { filterNavigation, type NavItem } from "./navigation";

const items: NavItem[] = [
  { key: "public", labelKey: "nav.home", href: "/dashboard", icon: Home },
  {
    key: "guarded",
    labelKey: "nav.home",
    href: "/guarded",
    icon: Home,
    permission: "library.manage",
  },
];

describe("filterNavigation", () => {
  it("keeps items without a permission requirement", () => {
    const result = filterNavigation(items, () => false);
    expect(result.map((item) => item.key)).toEqual(["public"]);
  });

  it("keeps a guarded item once the permission check passes", () => {
    const result = filterNavigation(items, (permission) => permission === "library.manage");
    expect(result.map((item) => item.key)).toEqual(["public", "guarded"]);
  });

  it("never mutates the input array", () => {
    const before = [...items];
    filterNavigation(items, () => true);
    expect(items).toEqual(before);
  });

  it("keeps a profile-restricted item only for a matching profile kind", () => {
    const scoped: NavItem[] = [
      {
        key: "student-only",
        labelKey: "nav.home",
        href: "/x",
        icon: Home,
        profileKinds: ["student"],
      },
    ];
    expect(filterNavigation(scoped, () => true).map((i) => i.key)).toEqual([]);
    expect(filterNavigation(scoped, () => true, "teacher").map((i) => i.key)).toEqual([]);
    expect(filterNavigation(scoped, () => true, "student").map((i) => i.key)).toEqual([
      "student-only",
    ]);
  });

  it("requires both permission and profile kind when both are set", () => {
    const scoped: NavItem[] = [
      {
        key: "student-with-permission",
        labelKey: "nav.home",
        href: "/x",
        icon: Home,
        permission: "view_x",
        profileKinds: ["student"],
      },
    ];
    expect(filterNavigation(scoped, () => false, "student")).toEqual([]);
    expect(filterNavigation(scoped, () => true, "teacher")).toEqual([]);
    expect(filterNavigation(scoped, () => true, "student").map((i) => i.key)).toEqual([
      "student-with-permission",
    ]);
  });
});
