"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * Whether a `position: sticky` element with a `bottom` inset is stuck to
 * that edge now, rather than resting in the flow. The observed root is the
 * viewport cut short by the element's own inset plus 1px: stuck, the
 * element reaches 1px past it; resting above the line, it shows whole. An
 * element clipped at the top of the screen is leaving, not stuck. Without
 * IntersectionObserver (tests, old browsers) it never reports stuck.
 */
export function useStuckToBottom(ref: RefObject<HTMLElement | null>, enabled = true): boolean {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === "undefined") return;
    // The resolved inset in px (env() and calc() included); "auto" off a phone.
    const inset = Number.parseFloat(getComputedStyle(element).bottom) || 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.rootBounds) return;
        setStuck(
          entry.intersectionRatio < 1 &&
            entry.boundingClientRect.bottom > entry.rootBounds.bottom + 0.5,
        );
      },
      { rootMargin: `0px 0px -${String(inset + 1)}px 0px`, threshold: [0, 1] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, enabled]);

  return enabled && stuck;
}
