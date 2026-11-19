"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Put on a page-level retry button (`data-retry-focus=""`) so focus can
 * come back to it while the retry is still offered.
 */
export const RETRY_FOCUS_ATTRIBUTE = "data-retry-focus";

const RETRY_BUTTON = `[${RETRY_FOCUS_ATTRIBUTE}]:not([disabled])`;
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus in `region` across a retry. The shared Button keeps
 * focus while it is busy (audit r6-n2), but once the reads load the retry
 * is replaced (by the hero's own action, or the notice goes away), so focus
 * would fall to `<body>` and a keyboard user would start again from the
 * skip link (audit r3-n22). Call the returned function as the retry starts: when the run
 * settles with focus lost, it goes back to the retry button if one is
 * still there, else to the region's first control (the hero's action).
 * Focus the reader moved elsewhere in the meantime is left alone.
 *
 * `placement` names where the retry sits now (`null` when there is none);
 * a change of place counts as the button going away.
 */
export function useFocusAfterRetry(
  region: RefObject<HTMLElement | null>,
  retrying: boolean,
  placement: string | null,
): () => void {
  const armed = useRef(false);
  useEffect(() => {
    if (!armed.current || retrying) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) {
      // The reader moved on, or focus is still on the control: nothing to fix.
      if (placement === null) armed.current = false;
      return;
    }
    const root = region.current;
    const retryButton = root?.querySelector<HTMLElement>(RETRY_BUTTON);
    // While the retry is still offered (it failed again, or the answers are
    // not in yet) focus waits on it; once it is gone the hook disarms.
    if (placement === null || !retryButton) armed.current = false;
    (retryButton ?? root?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
  }, [region, retrying, placement]);
  return () => {
    armed.current = true;
  };
}
