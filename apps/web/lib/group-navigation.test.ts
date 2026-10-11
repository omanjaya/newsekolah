import { Home } from "lucide-react";
import { describe, expect, it } from "vitest";

import { splitSidebarGroups } from "./group-navigation";
import type { NavItem } from "./navigation";
import { NAV_GROUP } from "./navigation-groups";

function item(key: string, group?: string): NavItem {
  return { key, labelKey: key, href: `/${key}`, icon: Home, group };
}

describe("splitSidebarGroups", () => {
  it("keeps groups with several pages and orders them by navGroupOrder", () => {
    const { groups } = splitSidebarGroups([
      item("catalogue", NAV_GROUP.library),
      item("circulation", NAV_GROUP.library),
      item("schedule", NAV_GROUP.academic),
      item("attendance", NAV_GROUP.academic),
    ]);
    expect(groups.map(([group]) => group)).toEqual([NAV_GROUP.academic, NAV_GROUP.library]);
  });

  it("lifts the only page of a group into the top-level links, after ungrouped pages", () => {
    const { ungrouped, groups } = splitSidebarGroups([
      item("dashboard"),
      item("billing", NAV_GROUP.administration),
      item("schedule", NAV_GROUP.academic),
      item("attendance", NAV_GROUP.academic),
    ]);
    expect(ungrouped.map((entry) => entry.key)).toEqual(["dashboard", "billing"]);
    expect(groups.map(([group]) => group)).toEqual([NAV_GROUP.academic]);
  });
});
