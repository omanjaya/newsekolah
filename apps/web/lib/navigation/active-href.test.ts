import { describe, expect, it } from "vitest";

import { activeNavHref, matchesHref } from "./active-href";

describe("activeNavHref", () => {
  const items = [{ href: "/dashboard" }, { href: "/library" }, { href: "/library/copies" }];

  it("prefers the longest matching href over its ancestors", () => {
    expect(activeNavHref("/library/copies", items)).toBe("/library/copies");
    expect(activeNavHref("/library/copies/123", items)).toBe("/library/copies");
  });

  it("falls back to the ancestor when no deeper item matches", () => {
    expect(activeNavHref("/library", items)).toBe("/library");
    expect(activeNavHref("/library/desk", items)).toBe("/library");
  });

  it("does not match sibling paths sharing a prefix", () => {
    expect(matchesHref("/library-x", "/library")).toBe(false);
    expect(activeNavHref("/settings", items)).toBeUndefined();
  });
});
