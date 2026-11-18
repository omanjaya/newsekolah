import { afterEach, describe, expect, it, vi } from "vitest";

import { attachSheetDrag, SHEET_DRAG, sheetDragOutcome } from "./overlay-drag.js";

describe("sheetDragOutcome", () => {
  it("dismisses past 30% of the sheet's height", () => {
    expect(sheetDragOutcome({ distance: 90, velocity: 0, height: 300 })).toBe("dismiss");
    expect(sheetDragOutcome({ distance: 89, velocity: 0, height: 300 })).toBe("settle");
  });

  it("never asks for more than 160px on a tall sheet", () => {
    expect(SHEET_DRAG.maxDistance).toBe(160);
    expect(sheetDragOutcome({ distance: 160, velocity: 0, height: 800 })).toBe("dismiss");
    expect(sheetDragOutcome({ distance: 159, velocity: 0, height: 800 })).toBe("settle");
  });

  it("dismisses on a downward flick once the sheet has moved 24px", () => {
    expect(sheetDragOutcome({ distance: 24, velocity: 0.5, height: 800 })).toBe("dismiss");
    expect(sheetDragOutcome({ distance: 23, velocity: 2, height: 800 })).toBe("settle");
    expect(sheetDragOutcome({ distance: 60, velocity: 0.49, height: 800 })).toBe("settle");
  });

  it("settles when the finger was already moving back up, or nothing moved", () => {
    expect(sheetDragOutcome({ distance: 200, velocity: -0.3, height: 400 })).toBe("settle");
    expect(sheetDragOutcome({ distance: 0, velocity: 1, height: 400 })).toBe("settle");
  });
});

/** A touch event at one point and time (jsdom has no Touch constructor). */
function touch(type: string, y: number, t: number, x = 20): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y };
  Object.defineProperty(event, "touches", {
    value: type === "touchend" || type === "touchcancel" ? [] : [point],
  });
  Object.defineProperty(event, "timeStamp", { value: t });
  return event;
}

function mountSheet({ scrolled = 0 }: { scrolled?: number } = {}) {
  const scrim = document.createElement("div");
  scrim.setAttribute("data-overlay-scrim", "");
  const content = document.createElement("div");
  content.setAttribute("data-state", "open");
  Object.defineProperty(content, "offsetHeight", { value: 600 });
  const handle = document.createElement("div");
  handle.setAttribute("data-sheet-drag", "");
  const body = document.createElement("div");
  body.className = "dialog-body";
  Object.defineProperty(body, "scrollTop", { value: scrolled });
  const row = document.createElement("button");
  body.append(row);
  content.append(handle, body);
  document.body.append(scrim, content);
  return { scrim, content, handle, row };
}

function drag(target: Element, points: [y: number, t: number][]) {
  const [start, ...moves] = points;
  if (!start) return;
  target.dispatchEvent(touch("touchstart", start[0], start[1]));
  for (const [y, t] of moves) target.dispatchEvent(touch("touchmove", y, t));
  target.dispatchEvent(touch("touchend", 0, moves.at(-1)?.[1] ?? 0));
}

describe("attachSheetDrag", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("follows the finger down from the handle and dismisses past the distance", () => {
    const { content, handle, scrim } = mountSheet();
    const dismiss = vi.fn();
    const detach = attachSheetDrag(content, { enabled: () => true, dismiss });

    handle.dispatchEvent(touch("touchstart", 100, 0));
    handle.dispatchEvent(touch("touchmove", 140, 40));
    // Past the 8px slop the sheet follows, less the slop, so it never jumps.
    expect(content.style.transform).toBe("translateY(32px)");
    expect(Number(scrim.style.opacity)).toBeLessThan(1);
    handle.dispatchEvent(touch("touchmove", 400, 600));
    handle.dispatchEvent(touch("touchend", 0, 600));

    expect(dismiss).toHaveBeenCalledTimes(1);
    detach();
  });

  it("settles back when let go short of the distance, slowly", () => {
    const { content, handle } = mountSheet();
    const dismiss = vi.fn();
    attachSheetDrag(content, { enabled: () => true, dismiss });

    drag(handle, [
      [100, 0],
      [150, 300],
      [160, 600],
    ]);

    expect(dismiss).not.toHaveBeenCalled();
    expect(content.style.transform).toBe("translateY(0px)");
    expect(content.style.transition).toContain("var(--duration-slow)");
    expect(content.style.transition).toContain("var(--ease-sheet)");
  });

  it("dismisses on a quick flick", () => {
    const { content, handle } = mountSheet();
    const dismiss = vi.fn();
    attachSheetDrag(content, { enabled: () => true, dismiss });

    drag(handle, [
      [100, 0],
      [112, 10],
      [150, 40],
    ]);

    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("drags from the body only while it is scrolled to the top", () => {
    const top = mountSheet();
    const dismissTop = vi.fn();
    attachSheetDrag(top.content, { enabled: () => true, dismiss: dismissTop });
    drag(top.row, [
      [100, 0],
      [300, 600],
      [400, 700],
    ]);
    expect(dismissTop).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";

    const scrolled = mountSheet({ scrolled: 40 });
    const dismissScrolled = vi.fn();
    attachSheetDrag(scrolled.content, { enabled: () => true, dismiss: dismissScrolled });
    drag(scrolled.row, [
      [100, 0],
      [300, 600],
      [400, 700],
    ]);
    expect(dismissScrolled).not.toHaveBeenCalled();
    expect(scrolled.content.style.transform).toBe("");
  });

  // Cancelling the first touchmove cancels native scrolling for the whole
  // touch, so a swipe up in the body that starts with a small downward
  // jitter must not be held while the sheet decides.
  it("leaves the body's early moves to native scrolling until a drag is clear", () => {
    const { content, row } = mountSheet();
    const dismiss = vi.fn();
    attachSheetDrag(content, { enabled: () => true, dismiss });

    row.dispatchEvent(touch("touchstart", 300, 0));
    const still = touch("touchmove", 300, 10);
    row.dispatchEvent(still);
    const jitter = touch("touchmove", 302, 20);
    row.dispatchEvent(jitter);
    expect(still.defaultPrevented).toBe(false);
    expect(jitter.defaultPrevented).toBe(false);
    const up = touch("touchmove", 200, 120);
    row.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(false);
    row.dispatchEvent(touch("touchend", 0, 120));
    expect(dismiss).not.toHaveBeenCalled();
    expect(content.style.transform).toBe("");

    // A clear downward drag past the slop is still the sheet's.
    row.dispatchEvent(touch("touchstart", 100, 200));
    const down = touch("touchmove", 140, 240);
    row.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(content.style.transform).toBe("translateY(32px)");
  });

  it("holds the page still from the first move on the handle", () => {
    const { content, handle } = mountSheet();
    attachSheetDrag(content, { enabled: () => true, dismiss: vi.fn() });
    handle.dispatchEvent(touch("touchstart", 100, 0));
    const early = touch("touchmove", 102, 10);
    handle.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(true);
  });

  it("leaves an upward or sideways swipe to the page", () => {
    const { content, handle } = mountSheet();
    const dismiss = vi.fn();
    attachSheetDrag(content, { enabled: () => true, dismiss });

    drag(handle, [
      [300, 0],
      [100, 300],
    ]);
    handle.dispatchEvent(touch("touchstart", 100, 0, 20));
    handle.dispatchEvent(touch("touchmove", 120, 100, 200));
    handle.dispatchEvent(touch("touchend", 0, 100));

    expect(dismiss).not.toHaveBeenCalled();
    expect(content.style.transform).toBe("");
  });

  it("does nothing while the panel is not a bottom sheet", () => {
    const { content, handle } = mountSheet();
    const dismiss = vi.fn();
    attachSheetDrag(content, { enabled: () => false, dismiss });

    drag(handle, [
      [100, 0],
      [400, 600],
    ]);

    expect(dismiss).not.toHaveBeenCalled();
    expect(content.style.transform).toBe("");
  });
});
