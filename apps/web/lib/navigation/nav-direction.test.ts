import { describe, expect, it } from "vitest";

import { HistoryTrail, resolveNavDirection } from "./nav-direction";

const TABS = ["/dashboard", "/schedule", "/grading", "/attendance"];

describe("resolveNavDirection", () => {
  it("enters from the right when going to a child of the page (a detail route)", () => {
    expect(
      resolveNavDirection({ from: "/attendance", to: "/attendance/session-1", tabRoots: TABS }),
    ).toBe("forward");
    expect(
      resolveNavDirection({ from: "/students", to: "/students/s-1/discipline", tabRoots: TABS }),
    ).toBe("forward");
  });

  it("enters from the left when going up to a parent", () => {
    expect(
      resolveNavDirection({ from: "/attendance/session-1", to: "/attendance", tabRoots: TABS }),
    ).toBe("back");
  });

  it("lets the route tree win over the history direction", () => {
    expect(
      resolveNavDirection({
        from: "/attendance",
        to: "/attendance/session-1",
        history: "back",
        tabRoots: TABS,
      }),
    ).toBe("forward");
  });

  it("follows the browser's back and forward between unrelated pages", () => {
    expect(
      resolveNavDirection({
        from: "/school/classes",
        to: "/dashboard",
        history: "back",
        tabRoots: TABS,
      }),
    ).toBe("back");
    expect(
      resolveNavDirection({
        from: "/dashboard",
        to: "/school/classes",
        history: "forward",
        tabRoots: TABS,
      }),
    ).toBe("forward");
  });

  it("fades plainly when switching between the bar's destinations", () => {
    expect(resolveNavDirection({ from: "/dashboard", to: "/schedule", tabRoots: TABS })).toBe(
      "tab",
    );
    // Out of a page in the menu onto a tab is a tab switch too.
    expect(resolveNavDirection({ from: "/library/desk", to: "/dashboard", tabRoots: TABS })).toBe(
      "tab",
    );
  });

  it("goes deeper when jumping straight to a detail route of another page", () => {
    const ownerOf = (path: string) =>
      path.startsWith("/attendance") ? "/attendance" : path === "/dashboard" ? path : undefined;
    expect(
      resolveNavDirection({
        from: "/dashboard",
        to: "/attendance/session-1",
        tabRoots: TABS,
        ownerOf,
      }),
    ).toBe("forward");
    // A menu entry's own page is not a detail.
    expect(
      resolveNavDirection({ from: "/schedule", to: "/dashboard", tabRoots: [], ownerOf }),
    ).toBe("neutral");
  });

  it("keeps the neutral entrance when unsure", () => {
    expect(resolveNavDirection({ from: undefined, to: "/dashboard", tabRoots: TABS })).toBe(
      "neutral",
    );
    expect(resolveNavDirection({ from: "/dashboard", to: "/dashboard", tabRoots: TABS })).toBe(
      "neutral",
    );
    expect(
      resolveNavDirection({ from: "/school/classes", to: "/library/desk", tabRoots: TABS }),
    ).toBe("neutral");
  });

  it("does not read a sibling that shares a prefix as a child", () => {
    expect(
      resolveNavDirection({ from: "/attendance", to: "/attendance-reports", tabRoots: [] }),
    ).toBe("neutral");
  });
});

describe("HistoryTrail", () => {
  it("tells a step back from a step forward", () => {
    const trail = new HistoryTrail();
    trail.push("/dashboard");
    trail.push("/attendance");
    trail.push("/attendance/session-1");
    expect(trail.pop("/attendance")).toBe("back");
    expect(trail.pop("/dashboard")).toBe("back");
    expect(trail.pop("/attendance")).toBe("forward");
  });

  it("drops the forward entries once a new page is pushed", () => {
    const trail = new HistoryTrail();
    trail.push("/dashboard");
    trail.push("/schedule");
    expect(trail.pop("/dashboard")).toBe("back");
    trail.push("/grading");
    expect(trail.pop("/schedule")).toBeUndefined();
  });

  it("does not record the same page twice in a row", () => {
    const trail = new HistoryTrail();
    trail.push("/dashboard");
    trail.push("/dashboard");
    trail.push("/schedule");
    expect(trail.pop("/dashboard")).toBe("back");
  });
});
