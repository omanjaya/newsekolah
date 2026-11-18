"use client";

import { useSyncExternalStore } from "react";

/** The shell's own breakpoint: the sidebar and header from here, the phone frame below (Tailwind `md`). */
const DESKTOP_QUERY = "(min-width: 768px)";

/** Where a page's main and side columns sit side by side (Tailwind `lg`); one column below. */
const TWO_COLUMN_QUERY = "(min-width: 1024px)";

function mediaQuery(query: string): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query)
    : null;
}

/**
 * Whether `query` matches. The server and an environment without
 * `matchMedia` get `false`, the phone's answer.
 */
function useMatches(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const list = mediaQuery(query);
      list?.addEventListener("change", callback);
      return () => {
        list?.removeEventListener("change", callback);
      };
    },
    () => mediaQuery(query)?.matches ?? false,
    () => false,
  );
}

/**
 * True from the `md` breakpoint, for the few shell surfaces that are a
 * different component on a phone (a bottom sheet instead of a popover or
 * a menu) rather than the same one restyled. The server and an environment
 * without `matchMedia` get the phone layout; the trigger is the same
 * element either way, so nothing moves when the client corrects it.
 */
export function useIsDesktop(): boolean {
  return useMatches(DESKTOP_QUERY);
}

/**
 * True from the `lg` breakpoint, where a page's main and side columns sit
 * side by side; below it they stack in one column, so a card that leads
 * the side column may need to move up. Server: `false`.
 */
export function useIsTwoColumn(): boolean {
  return useMatches(TWO_COLUMN_QUERY);
}
