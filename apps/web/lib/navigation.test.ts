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
});
