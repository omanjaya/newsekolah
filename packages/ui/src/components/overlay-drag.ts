/*
 * Drag to dismiss for a bottom sheet (a Dialog on a phone, a Sheet). The
 * panel follows the finger down from its grab handle or header, and from
 * its body only while the body is scrolled to the top; let go past a
 * sensible distance, or with a downward flick, and it closes through the
 * same path as its close button (so a caller that refuses to close keeps
 * it open); otherwise it settles back at the sheet's pace. Touch only:
 * the close button, Escape and the scrim stay the ways to close it with a
 * mouse or a keyboard, and gesture is never the only way (docs/07-ui-ux.md).
 */

/** Tuning, in CSS pixels and pixels per millisecond. */
export const SHEET_DRAG = {
  /** Movement before a touch counts as a drag (and not a tap or a scroll). */
  slop: 8,
  /** Share of the sheet's height past which letting go dismisses it. */
  distanceRatio: 0.3,
  /** ...but never further than this, so a tall sheet needs no long drag. */
  maxDistance: 160,
  /** A release at least this fast downwards dismisses it... */
  flingVelocity: 0.5,
  /** ...once it has moved at least this far. */
  minFlingDistance: 24,
  /** The window over which the release velocity is measured. */
  velocityWindowMs: 100,
} as const;

/** When the settle's inline styles come off: the 320ms settle plus a frame or two. */
const SETTLE_CLEAR_MS = 360;

export type SheetDragOutcome = "dismiss" | "settle";

/**
 * What letting go does: dismiss past 30% of the sheet's height (at most
 * 160px) or on a downward flick, settle back otherwise, and always settle
 * when the finger was already moving back up.
 */
export function sheetDragOutcome({
  distance,
  velocity,
  height,
}: {
  /** How far down the sheet has been dragged, in px. */
  distance: number;
  /** Speed at release, px/ms; positive is downwards. */
  velocity: number;
  /** The sheet's height, in px. */
  height: number;
}): SheetDragOutcome {
  if (distance <= 0 || velocity < -0.1) return "settle";
  if (velocity >= SHEET_DRAG.flingVelocity && distance >= SHEET_DRAG.minFlingDistance) {
    return "dismiss";
  }
  const threshold = Math.min(height * SHEET_DRAG.distanceRatio, SHEET_DRAG.maxDistance);
  return distance >= threshold ? "dismiss" : "settle";
}

/** Where a drag may start: the handle and header, else the scrolling body. */
const HANDLE = "[data-sheet-drag]";
const BODY = ".dialog-body";
/** Controls whose own touch handling wins (typing, picking, sliding). */
const OWN_GESTURE =
  "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-no-sheet-drag]";

/** True when something between `target` and `body` (or the body itself) is scrolled down. */
function scrolledAbove(target: Element, body: Element): boolean {
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
    if (node === body) return false;
  }
  return false;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Sample {
  y: number;
  t: number;
}

export interface SheetDragOptions {
  /** Whether the panel is laid out as a bottom sheet right now (a dialog is one only on a phone). */
  enabled: () => boolean;
  /** Closes the panel through its normal path; the caller may refuse. */
  dismiss: () => void;
}

/**
 * Wires drag to dismiss onto a sheet's content element and returns the
 * cleanup. The panel moves with `transform` only. Its scrim (the element
 * just before it, `data-overlay-scrim`) fades with the distance. Reduced
 * motion keeps the drag but drops the settle animation, and a dismissed
 * sheet fades where it is instead of sliding on.
 */
export function attachSheetDrag(content: HTMLElement, options: SheetDragOptions): () => void {
  let start: { x: number; y: number; body: Element | null } | null = null;
  let offset = 0;
  let dragging = false;
  let samples: Sample[] = [];
  let settleTimer: number | undefined;

  const scrim = (): HTMLElement | null => {
    const previous = content.previousElementSibling;
    return previous instanceof HTMLElement && previous.hasAttribute("data-overlay-scrim")
      ? previous
      : null;
  };

  const clearInline = () => {
    content.style.removeProperty("transform");
    content.style.removeProperty("transition");
    const layer = scrim();
    layer?.style.removeProperty("opacity");
    layer?.style.removeProperty("transition");
  };

  const follow = (distance: number) => {
    offset = distance;
    content.style.transform = `translateY(${String(distance)}px)`;
    const layer = scrim();
    if (layer) {
      const progress = Math.min(distance / Math.max(content.offsetHeight, 1), 1);
      layer.style.opacity = String(1 - progress * 0.8);
    }
  };

  const settle = () => {
    // The sheet's own pace and curve (320ms, ease-sheet), never a spring.
    // The global reduced-motion rule strips `transform` from every
    // transition, so there the sheet simply snaps back.
    content.style.transition = "transform var(--duration-slow) var(--ease-sheet)";
    content.style.transform = "translateY(0px)";
    const layer = scrim();
    if (layer) {
      layer.style.transition = "opacity var(--duration-slow) var(--ease-sheet)";
      layer.style.opacity = "1";
    }
    window.clearTimeout(settleTimer);
    // Cleared only after the slowest settle has finished: dropping the
    // inline transition mid-flight would cut it short.
    settleTimer = window.setTimeout(clearInline, SETTLE_CLEAR_MS);
    offset = 0;
  };

  const release = () => {
    const height = content.offsetHeight;
    const recent = samples.filter(
      (sample) => sample.t >= (samples.at(-1)?.t ?? 0) - SHEET_DRAG.velocityWindowMs,
    );
    const first = recent[0];
    const last = recent.at(-1);
    const elapsed = first && last ? last.t - first.t : 0;
    const velocity = first && last && elapsed > 0 ? (last.y - first.y) / elapsed : 0;
    if (sheetDragOutcome({ distance: offset, velocity, height }) === "settle") {
      settle();
      return;
    }
    // The exit keyframe starts from where the finger left it (its implicit
    // first frame is this inline transform). With reduced motion the slide
    // offset is 0, which would pull the sheet back up as it fades: hold it
    // where it is instead.
    if (prefersReducedMotion()) {
      content.style.setProperty("--motion-slide-offset", `${String(offset)}px`);
    }
    options.dismiss();
    // A caller may refuse to close (an action is running): put it back.
    window.requestAnimationFrame(() => {
      if (content.getAttribute("data-state") === "open") {
        content.style.removeProperty("--motion-slide-offset");
        settle();
      }
    });
  };

  const onTouchStart = (event: TouchEvent) => {
    start = null;
    if (event.touches.length !== 1 || !options.enabled()) return;
    if (content.getAttribute("data-state") !== "open") return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(OWN_GESTURE)) return;
    const onHandle = target.closest(HANDLE) !== null;
    const body = onHandle ? null : target.closest(BODY);
    if (!onHandle && !body) return;
    if (body && scrolledAbove(target, body)) return;
    const touch = event.touches[0];
    if (!touch) return;
    start = { x: touch.clientX, y: touch.clientY, body };
    samples = [{ y: touch.clientY, t: event.timeStamp }];
  };

  const onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!start || !touch) return;
    const dy = touch.clientY - start.y;
    const dx = touch.clientX - start.x;
    if (!dragging) {
      // Upwards or sideways is a scroll (or a strip's swipe), not ours.
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dy) > SHEET_DRAG.slop || Math.abs(dx) > SHEET_DRAG.slop) start = null;
        return;
      }
      if (start.body && start.body.scrollTop > 0) {
        start = null;
        return;
      }
      if (start.body) {
        // A touch in the body is the body's own scroll until it is clearly a
        // downward drag: cancelling an early move (a 0 to 2px jitter at the
        // start of a swipe up) would cancel native scrolling for the whole
        // touch. The body's overscroll containment keeps those few pixels
        // from moving the page behind.
        if (dy < SHEET_DRAG.slop || dy <= Math.abs(dx)) return;
      } else {
        // On the handle or header, hold the page still while deciding, or
        // the browser claims the gesture.
        if (event.cancelable) event.preventDefault();
        if (dy < SHEET_DRAG.slop) return;
      }
      if (!event.cancelable) {
        start = null;
        return;
      }
      dragging = true;
      window.clearTimeout(settleTimer);
      content.style.transition = "none";
      const layer = scrim();
      if (layer) layer.style.transition = "none";
    }
    event.preventDefault();
    follow(Math.max(0, dy - SHEET_DRAG.slop));
    samples.push({ y: touch.clientY, t: event.timeStamp });
    if (samples.length > 32) samples = samples.slice(-16);
  };

  const onTouchEnd = () => {
    start = null;
    if (!dragging) return;
    dragging = false;
    release();
  };

  const onTouchCancel = () => {
    start = null;
    if (!dragging) return;
    dragging = false;
    settle();
  };

  content.addEventListener("touchstart", onTouchStart, { passive: true });
  content.addEventListener("touchmove", onTouchMove, { passive: false });
  content.addEventListener("touchend", onTouchEnd);
  content.addEventListener("touchcancel", onTouchCancel);
  return () => {
    window.clearTimeout(settleTimer);
    content.removeEventListener("touchstart", onTouchStart);
    content.removeEventListener("touchmove", onTouchMove);
    content.removeEventListener("touchend", onTouchEnd);
    content.removeEventListener("touchcancel", onTouchCancel);
  };
}
