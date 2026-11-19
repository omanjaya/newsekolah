"use client";

import { useEffect, useLayoutEffect, useState, type RefCallback } from "react";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Tracks whether an element is at least `minWidth` CSS pixels wide, kept
 * current as it resizes: the container-query counterpart of
 * `useMediaQuery`. Use it to mount exactly one of two render trees by the
 * room a component really has (a sidebar and a card's padding take their
 * share of the viewport), e.g. a wide table vs. one card per row.
 *
 * Attach the returned callback ref to a block element whose width comes
 * from its parent, not from its content, or the measurement would follow
 * whichever tree is mounted. It reads `false` until the element is
 * measured (the server, jsdom without a layout), so the narrow tree is the
 * safe first paint; the first measurement runs before the browser paints.
 */
export function useContainerMinWidth<T extends HTMLElement = HTMLDivElement>(
  minWidth: number,
): [RefCallback<T>, boolean] {
  const [element, setElement] = useState<T | null>(null);
  const [matches, setMatches] = useState(false);

  useIsomorphicLayoutEffect(() => {
    if (!element) return;
    const update = () => {
      setMatches(element.getBoundingClientRect().width >= minWidth);
    };
    update();
    // jsdom has no ResizeObserver; the first measurement still runs there.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
    };
  }, [element, minWidth]);

  return [setElement, matches];
}
