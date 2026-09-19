"use client";

import { useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query so the caller can mount exactly one of a
 * mobile and a desktop layout instead of mounting both and hiding one
 * with CSS. Reports `false` (the mobile guess) for the server-rendered
 * and first client render, matching `useSyncExternalStore`'s hydration
 * contract, then syncs to the real match once mounted.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onChange);
      return () => {
        mediaQueryList.removeEventListener("change", onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
