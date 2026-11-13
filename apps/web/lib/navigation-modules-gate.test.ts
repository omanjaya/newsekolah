import { readdirSync } from "node:fs";
import path from "node:path";

import { Home } from "lucide-react";
import { describe, expect, it } from "vitest";

import { FEATURE_MODULES, type FeatureModule } from "./modules/feature-modules";
import { navigation, type NavItem, type NavProfileKind } from "./navigation";
import { filterNavigationFixture, navAccessFixture } from "./navigation-access.fixture";
import { pathAccess } from "./navigation-permissions";
import { sectionModules } from "./navigation-sections";
import { consolidateNavigation } from "./navigation-workspaces";
import { availableQuickActions } from "./quick-actions";

/**
 * The route prefixes each toggleable module owns: every page under them
 * calls only that module's endpoints, so the registry entry that guards the
 * page must carry the module. A new page under one of these prefixes without
 * a `module` fails below instead of silently staying reachable.
 */
const MODULE_ROUTE_PREFIXES: Record<FeatureModule, string[]> = {
  library: ["/library"],
  discipline: ["/discipline", "/my-discipline"],
  grading: ["/grading", "/my-grades"],
  permits: [
    "/leave-requests",
    "/exit-permits",
    "/late-arrivals",
    "/duty",
    "/classroom-entry",
    "/settings/workflows",
  ],
  announcements: ["/announcements"],
  reports: ["/reports"],
  activities: ["/activities"],
  mentoring: ["/mentoring"],
  supervision: ["/supervision"],
  staff_attendance: ["/staff-attendance", "/check-in"],
  visitors: ["/visitors"],
  billing: ["/billing"],
};

/**
 * Registry entries under a module prefix that deliberately carry no module.
 * Empty on purpose: add an entry here, with the reason, only for a page that
 * mixes an always-on module with an optional one.
 */
const UNMARKED_ALLOWLIST: string[] = [];

/** The modules an entry is guarded by: its one module, or its sections' modules. */
function entryModules(item: NavItem): FeatureModule[] {
  if (item.module) return [item.module];
  return item.moduleSections ? sectionModules(item.moduleSections) : [];
}

/** The registry entry that guards a route (longest href prefix, as pathAccess). */
function guardingEntry(route: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of navigation) {
    if (route !== item.href && !route.startsWith(`${item.href}/`)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best;
}

function moduleForHref(href: string): FeatureModule | undefined {
  for (const [module, prefixes] of Object.entries(MODULE_ROUTE_PREFIXES)) {
    if (prefixes.some((prefix) => href === prefix || href.startsWith(`${prefix}/`))) {
      return module as FeatureModule;
    }
  }
  return undefined;
}

describe("navigation modules", () => {
  it("marks every entry under a module's route prefix with that module", () => {
    const wrong = navigation
      .filter((item) => !UNMARKED_ALLOWLIST.includes(item.key))
      .flatMap((item) => {
        const expected = moduleForHref(item.href);
        return expected && !entryModules(item).includes(expected)
          ? [`${item.key} (${item.href}): expected ${expected}, got ${item.module ?? "none"}`]
          : [];
      });
    expect(wrong).toEqual([]);
  });

  it("never marks an entry whose route is outside the module's prefixes", () => {
    const stray = navigation
      .filter((item) => item.module && moduleForHref(item.href) !== item.module)
      .map((item) => `${item.key} (${item.href}) -> ${item.module}`);
    expect(stray).toEqual([]);
  });

  it("covers every toggleable module with at least one entry", () => {
    const covered = new Set(navigation.flatMap(entryModules));
    expect([...FEATURE_MODULES].filter((module) => !covered.has(module))).toEqual([]);
  });

  it("refuses every page route under a module prefix when that module is off", () => {
    const appDir = path.resolve(__dirname, "../app/(app)");
    const routes = pageRoutes(appDir).filter((route) => moduleForHref(route));
    expect(routes.length).toBeGreaterThan(30);
    const kinds: NavProfileKind[] = ["student", "teacher", "staff"];
    const reachable = routes.flatMap((route) => {
      const module = moduleForHref(route);
      if (!module) return [route];
      // A page made of sections stays open while any section's module is
      // on, so it is refused only once all of them are off.
      const entry = guardingEntry(route);
      const disabled = entry?.moduleSections ? entryModules(entry) : [module];
      const outcomes = kinds.map((kind) =>
        pathAccess(
          route,
          navAccessFixture(() => true, kind, [], disabled),
        ),
      );
      // Some entries are scoped to one profile kind; the others answer
      // "forbidden" for the rest. What must never happen is "ok".
      return outcomes.includes("ok") || !outcomes.includes("module-disabled") ? [route] : [];
    });
    expect(reachable).toEqual([]);
  });
});

describe("filterNavigation with disabled modules", () => {
  const items: NavItem[] = [
    { key: "always", labelKey: "nav.home", href: "/dashboard", icon: Home },
    { key: "lib", labelKey: "nav.home", href: "/library", icon: Home, module: "library" },
    { key: "bill", labelKey: "nav.home", href: "/billing", icon: Home, module: "billing" },
  ];

  it("keeps every entry while nothing is disabled", () => {
    expect(filterNavigationFixture(items, () => true).map((i) => i.key)).toEqual([
      "always",
      "lib",
      "bill",
    ]);
  });

  it("drops entries of a disabled module whatever the permissions", () => {
    expect(
      filterNavigationFixture(items, () => true, undefined, [], ["library"]).map((i) => i.key),
    ).toEqual(["always", "bill"]);
  });

  it("ignores module names it does not know", () => {
    expect(
      filterNavigationFixture(items, () => true, undefined, [], ["something_else"]),
    ).toHaveLength(3);
  });

  it("drops the real library entries and keeps the school ones", () => {
    const keys = filterNavigationFixture(navigation, () => true, "staff", [], ["library"]).map(
      (item) => item.key,
    );
    expect(keys.filter((key) => key.startsWith("library-"))).toEqual([]);
    expect(keys).toContain("school-classes");
    expect(keys).toContain("visitors-board");
  });
});

describe("consolidated workspaces with disabled modules", () => {
  function workspaces(disabled: string[]) {
    const can = () => true;
    return consolidateNavigation(filterNavigationFixture(navigation, can, "staff", [], disabled), {
      profileKind: "staff",
      can,
    });
  }

  it("keeps the reports workspace on /reports while another report domain is on", () => {
    const reports = workspaces(["reports"]).find((item) => item.key === "reports");
    expect(reports?.href).toBe("/reports");
    expect(reports?.aliases).toEqual(["reports", "library-reports", "visitors-recap"]);
    expect(reports?.module).toBeUndefined();
  });

  it("drops a workspace whose every destination is off", () => {
    const keys = workspaces(["library", "reports", "visitors"]).map((item) => item.key);
    expect(keys).not.toContain("reports");
  });

  it("keeps the leave workspace reachable through its always-on members", () => {
    const withPermits = workspaces([]).find((item) => item.key === "leave-requests");
    expect(withPermits).toBeDefined();
    expect(workspaces(["permits"]).find((item) => item.key === "leave-requests")).toBeUndefined();
  });

  it("keeps the counseling workspace on early-warning monitoring when discipline is off", () => {
    const counseling = workspaces(["discipline"]).find((item) => item.key === "counseling");
    expect(counseling?.href).toBe("/analytics");
  });
});

describe("pages made of sections from several modules", () => {
  const all = () => true;
  const only =
    (...codes: string[]) =>
    (code: string) =>
      codes.includes(code);
  const access = (path: string, can: (code: string) => boolean, disabled: string[]) =>
    pathAccess(path, navAccessFixture(can, "staff", [], disabled));
  const listed = (key: string, can: (code: string) => boolean, disabled: string[]) =>
    filterNavigationFixture(navigation, can, "staff", [], disabled).some(
      (item) => item.key === key,
    );

  it("opens /reports while any granted report domain is on", () => {
    expect(access("/reports", all, ["reports"])).toBe("ok");
    expect(listed("reports", all, ["reports"])).toBe(true);
    expect(access("/reports", all, ["reports", "library", "visitors"])).toBe("module-disabled");
    expect(listed("reports", all, ["reports", "library", "visitors"])).toBe(false);
  });

  it("judges /reports by the reader's own grants, not every domain", () => {
    const schoolOnly = only("view_reports");
    expect(access("/reports", schoolOnly, ["reports"])).toBe("module-disabled");
    expect(listed("reports", schoolOnly, ["reports"])).toBe(false);
    const libraryOnly = only("view_library_reports");
    expect(access("/reports", libraryOnly, ["reports"])).toBe("ok");
    expect(listed("reports", libraryOnly, ["reports"])).toBe(true);
    expect(access("/reports", only("manage_settings"), [])).toBe("forbidden");
  });

  it("opens /scan while permits or library is on", () => {
    for (const kind of ["student", "teacher", "staff"] as const) {
      expect(pathAccess("/scan", navAccessFixture(all, kind, [], ["permits"]))).toBe("ok");
      expect(pathAccess("/scan", navAccessFixture(all, kind, [], ["library"]))).toBe("ok");
      expect(pathAccess("/scan", navAccessFixture(all, kind, [], ["permits", "library"]))).toBe(
        "module-disabled",
      );
    }
    expect(listed("scan", all, ["permits"])).toBe(true);
    expect(listed("scan", all, ["permits", "library"])).toBe(false);
    const quick = (disabled: string[]) =>
      availableQuickActions(navAccessFixture(all, "teacher", [], disabled)).map(
        (action) => action.id,
      );
    expect(quick(["permits"])).toContain("scan-qr");
    expect(quick(["permits", "library"])).not.toContain("scan-qr");
  });

  it("keeps the action inbox while permits or discipline is on", () => {
    expect(access("/inbox", all, ["permits"])).toBe("ok");
    expect(listed("inbox", all, ["discipline"])).toBe(true);
    expect(access("/inbox", all, ["permits", "discipline"])).toBe("module-disabled");
    expect(listed("inbox", all, ["permits", "discipline"])).toBe(false);
  });

  it("keeps document templates while any issuing module is on, workflows with permits only", () => {
    expect(access("/settings/document-templates", all, ["permits"])).toBe("ok");
    expect(listed("settings-document-templates", all, ["permits"])).toBe(true);
    expect(access("/settings/document-templates", all, ["permits", "discipline", "visitors"])).toBe(
      "module-disabled",
    );
    expect(listed("settings-document-templates", all, ["permits", "discipline", "visitors"])).toBe(
      false,
    );
    expect(access("/settings/workflows", all, ["permits"])).toBe("module-disabled");
    expect(listed("settings-workflows", all, ["permits"])).toBe(false);
  });
});

function pageRoutes(root: string, prefix = ""): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      const segment = entry.name.replace(/^\[.+\]$/, "x");
      return pageRoutes(path.join(root, entry.name), `${prefix}/${segment}`);
    }
    return entry.name === "page.tsx" ? [prefix || "/"] : [];
  });
}
