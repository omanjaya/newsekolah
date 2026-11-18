import { describe, expect, it } from "vitest";

import { revealInStrip } from "./use-active-indicator.js";

/** A box at `left`, `width` wide (jsdom may have no DOMRect). */
function rect(left: number, width: number): DOMRect {
  return {
    left,
    right: left + width,
    x: left,
    width,
    top: 0,
    y: 0,
    bottom: 44,
    height: 44,
    toJSON: () => ({}),
  };
}

/**
 * A strip of tabs with a layout jsdom does not have: each item's span in
 * the strip's content, a viewport `width` wide, scrolled by `scrollLeft`.
 */
function strip(width: number, items: [number, number][]) {
  const container = document.createElement("div");
  const indicator = document.createElement("span");
  indicator.setAttribute("aria-hidden", "true");
  container.append(indicator);
  let scroll = 0;
  const contentWidth = Math.max(...items.map(([, end]) => end)) + 16;
  Object.defineProperties(container, {
    clientWidth: { get: () => width },
    scrollWidth: { get: () => contentWidth },
    scrollLeft: {
      get: () => scroll,
      set: (value: number) => {
        scroll = Math.max(0, Math.min(value, contentWidth - width));
      },
    },
  });
  container.getBoundingClientRect = () => rect(0, width);
  const tabs = items.map(([start, end]) => {
    const tab = document.createElement("button");
    Object.defineProperty(tab, "offsetWidth", { get: () => end - start });
    tab.getBoundingClientRect = () => rect(start - scroll, end - start);
    container.append(tab);
    return tab;
  });
  return { container, tabs, scrollLeft: () => scroll };
}

describe("revealInStrip", () => {
  // Library class loans: the tab after "Denda dan sanksi" began 6px before
  // the screen's edge, inside the end fade, and read as a ghost "K".
  it("lets the tab cut by the end peek in past the fade", () => {
    const { container, tabs, scrollLeft } = strip(390, [
      [16, 96],
      [96, 250],
      [250, 384],
      [384, 480],
    ]);
    const active = tabs[1];
    if (!active) throw new Error("no active tab");
    revealInStrip(container, active);
    // 6px of the last tab showed; it now shows 56, enough for its label to
    // clear the 48px end fade past the tab's own padding.
    expect(scrollLeft()).toBe(50);
  });

  it("never moves the active tab under the start fade for a peek", () => {
    const { container, tabs, scrollLeft } = strip(390, [
      [16, 140],
      [140, 300],
      [300, 384],
      [384, 480],
    ]);
    const active = tabs[0];
    if (!active) throw new Error("no active tab");
    revealInStrip(container, active);
    expect(scrollLeft()).toBe(0);
  });

  it("leaves a strip that fits alone", () => {
    const { container, tabs, scrollLeft } = strip(600, [
      [16, 96],
      [96, 250],
    ]);
    const active = tabs[1];
    if (!active) throw new Error("no active tab");
    revealInStrip(container, active);
    expect(scrollLeft()).toBe(0);
  });
});
