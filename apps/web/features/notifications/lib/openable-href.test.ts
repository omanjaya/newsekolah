import { describe, expect, it } from "vitest";

import { navAccessFixture } from "../../../lib/navigation-access.fixture";

import { openableHref } from "./openable-href";

const allow = () => true;

describe("openableHref", () => {
  it("keeps a link to a page that is available", () => {
    expect(openableHref("/leave-requests/abc?tab=mine", navAccessFixture(allow, "teacher"))).toBe(
      "/leave-requests/abc?tab=mine",
    );
  });

  it("drops the link when the page's module is off, keeping the row usable", () => {
    const access = navAccessFixture(allow, "teacher", [], ["permits"]);
    expect(openableHref("/leave-requests/abc?tab=mine", access)).toBeUndefined();
    expect(openableHref("/leave-requests/abc", access)).toBeUndefined();
  });

  it("leaves links to other pages and missing links alone", () => {
    const access = navAccessFixture(allow, "teacher", [], ["permits"]);
    expect(openableHref("/attendance", access)).toBe("/attendance");
    expect(openableHref(undefined, access)).toBeUndefined();
    expect(openableHref(null, access)).toBeUndefined();
  });
});
