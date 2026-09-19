"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string, callback: () => void) {
  const mediaQueryList = window.matchMedia(query);
  mediaQueryList.addEventListener("change", callback);
  return () => {
    mediaQueryList.removeEventListener("change", callback);
  };
}

/**
 * Tracks whether a CSS media query currently matches, so a component can
 * mount exactly one of two render trees (e.g. a desktop table vs. a mobile
 * card list) instead of mounting both at once behind `hidden`/`md:hidden`
 * classes -- the pattern that doubled the gradebook's mounted input count.
 * `useSyncExternalStore` keeps the server snapshot (`false`, no `window`)
 * consistent with the client's first paint instead of hand-rolling that with
 * `useEffect` + `useState`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => subscribe(query, callback),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
