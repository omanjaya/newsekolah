"use client";

import { useEffect, useState } from "react";

/*
 * Toasts sit at the bottom right from 640px up. An open dialog or sheet
 * whose action row reaches that corner (a drawer, a bottom sheet, a tall
 * dialog) would have its Save and Cancel buttons covered by a toast for
 * four to eight seconds, so while it is open it publishes how far above
 * the bottom edge toasts must stay, the way StickySaveBar publishes its
 * height. The Toaster reads both.
 */

/**
 * The toast's width from 600px up (sonner spans the screen below that),
 * and its distance from the right and bottom edges (Toaster). 420 keeps a
 * title, a one-line description and the close button on their own lines.
 */
export const TOAST_WIDTH_PX = 420;
export const TOAST_EDGE_PX = 24;
/** Root variable: toasts keep their bottom edge at least this far from the viewport's. */
export const TOAST_CLEARANCE_VAR = "--overlay-toast-clearance";

/** Space left between a lifted toast and the action row under it. */
const GAP_PX = 16;
/**
 * How far up from the bottom edge the toast stack reaches (a toast plus
 * the peeks of the two behind it). An action row entirely above that is
 * clear already.
 */
const TOAST_ZONE_PX = 120;

/** The action rows: the `footer` prop's row, `DialogFooter`, and a form's own trailing row. */
const FOOTER_SELECTOR =
  "[data-overlay-footer], .dialog-body > :is(form, div) > .border-t.justify-end:last-child";

/** One entry per open overlay, so nested ones and their unmount order cannot clear each other's. */
const clearances = new Map<object, number>();

function publish() {
  const root = document.documentElement;
  const highest = Math.max(0, ...clearances.values());
  if (highest > 0) root.style.setProperty(TOAST_CLEARANCE_VAR, `${highest}px`);
  else root.style.removeProperty(TOAST_CLEARANCE_VAR);
}

/** How far above the bottom edge a toast must stay to leave `footer` uncovered; 0 when it is clear. */
function clearanceFor(footer: Element): number {
  const rect = footer.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return 0;
  const toastLeft = window.innerWidth - TOAST_EDGE_PX - TOAST_WIDTH_PX;
  const toastRight = window.innerWidth - TOAST_EDGE_PX;
  const sharesColumn = rect.right > toastLeft && rect.left < toastRight;
  const reachesZone = rect.bottom > window.innerHeight - TOAST_ZONE_PX;
  if (!sharesColumn || !reachesZone) return 0;
  return Math.ceil(window.innerHeight - rect.top + GAP_PX);
}

/**
 * Returns a ref callback for the overlay's content element. While that
 * element is mounted, its action row is measured whenever it can have
 * moved (the panel's entrance animation ending, a resize of the panel,
 * the row or the form above it, the window) and the clearance published.
 */
export function useToastClearance(): (node: HTMLElement | null) => void {
  // State, not a ref: the content mounts after this hook's component (Radix
  // Presence), and the effect has to run when it does.
  const [content, setContent] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!content) return;
    const key = {};
    let observed: Element[] = [];
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);

    function measure() {
      if (!content) return;
      const footer = content.querySelector(FOOTER_SELECTOR);
      const targets = [content, footer, footer?.parentElement].filter(
        (target): target is Element => target instanceof Element,
      );
      const changed =
        targets.length !== observed.length ||
        targets.some((target, index) => observed[index] !== target);
      if (resizeObserver && changed) {
        resizeObserver.disconnect();
        for (const target of targets) resizeObserver.observe(target);
        observed = targets;
      }
      clearances.set(key, footer ? clearanceFor(footer) : 0);
      publish();
    }

    measure();
    content.addEventListener("animationend", measure);
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver?.disconnect();
      content.removeEventListener("animationend", measure);
      window.removeEventListener("resize", measure);
      clearances.delete(key);
      publish();
    };
  }, [content]);

  return setContent;
}
