"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * Whether the home has already played its first-load entrance in this
 * session (spec section 4, item 3: the stagger and the count-up are for
 * the first load only). Module state, so it outlives the page's unmount:
 * a later visit gets only the page template's own single entrance.
 */
let homeEntered = false;

/** Lets a test start from a fresh session. */
export function resetHomeEntranceForTests(): void {
  homeEntered = false;
}

/**
 * Whether this mount of the home plays the first-load entrance. Read once
 * per mount, so a re-render while the entrance runs never cuts it short;
 * marked as played once the home has settled (no persona still loading),
 * so a first visit left before its data arrived does not use it up.
 */
export function useFirstEntrance(settled: boolean): boolean {
  const [first] = useState(() => !homeEntered);
  useEffect(() => {
    if (settled) homeEntered = true;
  }, [settled]);
  return first;
}

/** The entrance class and stagger step of one home element, or none after the first load. */
export function entrance(on: boolean, step: number): { className?: string; style?: CSSProperties } {
  return on
    ? { className: "animate-enter", style: { "--stagger": Math.min(step, 5) } as CSSProperties }
    : {};
}
