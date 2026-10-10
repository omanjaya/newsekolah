import { describe, expect, it } from "vitest";

import { legacyQueueTarget, reviewerInboxTarget } from "./queue-redirect";

const target = (query: string, pageType = "leave") =>
  legacyQueueTarget(new URLSearchParams(query), pageType);

describe("legacyQueueTarget", () => {
  it("sends the retired all-queue view to the inbox", () => {
    expect(target("type=allQueue")).toBe("/inbox");
  });

  it("sends a per-type queue tab to the inbox filtered to the page type", () => {
    expect(target("tab=queue", "exit")).toBe("/inbox?type=exit");
  });

  it("keeps a type chosen in the link", () => {
    expect(target("type=late&tab=queue", "leave")).toBe("/inbox?type=late");
  });

  it("leaves every other URL alone", () => {
    expect(target("")).toBeNull();
    expect(target("tab=mine")).toBeNull();
    expect(target("type=exit")).toBeNull();
  });
});

describe("reviewerInboxTarget", () => {
  it("filters the inbox to the page type", () => {
    expect(reviewerInboxTarget("late")).toBe("/inbox?type=late");
    expect(reviewerInboxTarget("other")).toBe("/inbox");
  });
});
