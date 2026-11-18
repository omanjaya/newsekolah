import { describe, expect, it } from "vitest";

import "../messages/features";

import { getMessages } from "./i18n/get-messages";
import { navigation, navGroupLabelKey, type NavProfileKind } from "./navigation";
import { filterNavigationFixture } from "./navigation-access.fixture";
import { registryLabelKey } from "./navigation-labels";
import { consolidateNavigation } from "./navigation-workspaces";

function lookup(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, messages);
}

const PROFILES: (NavProfileKind | undefined)[] = ["staff", "teacher", "student", undefined];

/** Every label key the sidebar, tab bar and menu can render, for a reader holding every permission. */
function shellLabelKeys(): Set<string> {
  const keys = new Set<string>();
  for (const profileKind of PROFILES) {
    const can = () => true;
    const items = consolidateNavigation(filterNavigationFixture(navigation, can, profileKind), {
      profileKind,
      duties: [{ slug: "homeroom" }],
      canManageSchool: true,
      can,
    });
    for (const item of items) {
      keys.add(item.labelKey);
      if (item.tabLabelKey) keys.add(item.tabLabelKey);
      if (item.groupLabelKey) keys.add(item.groupLabelKey);
      if (item.group) keys.add(navGroupLabelKey(item.group));
    }
  }
  return keys;
}

describe.each(["id", "en"] as const)("shell navigation labels (%s)", (locale) => {
  const messages = getMessages(locale);

  it("resolves every menu, group and tab label", () => {
    const missing = [...shellLabelKeys()].filter(
      (key) => typeof lookup(messages, key) !== "string",
    );
    expect(missing).toEqual([]);
  });

  it("joins words in every rendered menu label with 'dan', never '&'", () => {
    const withAmpersand = [...shellLabelKeys()]
      .map((key) => lookup(messages, key))
      .filter((label) => typeof label === "string" && label.includes("&"));
    expect(withAmpersand).toEqual([]);
  });

  it("writes menu labels in sentence case with 'dan', never '&'", () => {
    const shellLabels = Object.values(
      lookup(messages, "app.shell.nav.items") as Record<string, string>,
    );
    for (const label of shellLabels) {
      expect(label).not.toContain("&");
      // Only the first word is capitalised, apart from acronyms such as BK.
      const later = label.split(" ").slice(1);
      expect(later.filter((word) => /^[A-Z][a-z]/.test(word))).toEqual([]);
    }
  });

  it("keeps every tab bar label short enough for five slots on a 360px phone", () => {
    const short = lookup(messages, "app.shell.nav.short") as Record<string, string>;
    for (const label of Object.values(short)) expect(label.length).toBeLessThanOrEqual(10);
  });
});

describe("registryLabelKey", () => {
  it("gives an entry's own label key, the one its menu entry and page title read", () => {
    expect(registryLabelKey("visitors-board")).toBe("nav.visitors.items.board");
    expect(registryLabelKey("analytics")).toBe("app.analytics.navLabel");
  });

  it("throws on a key the registry does not have", () => {
    expect(() => registryLabelKey("no-such-page")).toThrow(/no-such-page/);
  });
});
