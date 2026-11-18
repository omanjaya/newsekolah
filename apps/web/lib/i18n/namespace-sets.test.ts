import { describe, expect, it } from "vitest";

import "../../messages/features";

import { navigation } from "../navigation";
import { libraryNavItems } from "../navigation-library";
import { WORKSPACE_MEMBER_KEYS } from "../navigation-workspaces";

import { getMessagesForNamespaces } from "./get-messages";
import { LIBRARY_NAMESPACES } from "./namespace-sets";

function lookup(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, messages);
}

const libraryKeys = new Set(libraryNavItems.map((item) => item.key));

describe.each(["id", "en"] as const)("library provider (%s)", (locale) => {
  const messages = getMessagesForNamespaces(locale, LIBRARY_NAMESPACES);

  it("labels every tab of a strip that holds a library page", () => {
    // The reports hub puts the library report beside the school's reports
    // and the visitors' recap: on /library/reports every one of them needs
    // its label, or the tab would show its raw key.
    const labelKeys = WORKSPACE_MEMBER_KEYS.filter((members) =>
      members.some((key) => libraryKeys.has(key)),
    )
      .flat()
      .map((key) => navigation.find((item) => item.key === key)?.labelKey)
      .filter((labelKey): labelKey is string => labelKey !== undefined);
    expect(labelKeys).toContain("app.reports.navLabel");
    expect(labelKeys.filter((key) => typeof lookup(messages, key) !== "string")).toEqual([]);
  });

  it("does not carry the rest of the school's reports catalog", () => {
    expect(Object.keys(lookup(messages, "app.reports") as object)).toEqual(["navLabel"]);
  });
});
