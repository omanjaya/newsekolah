"use client";

import { useSyncExternalStore } from "react";

/** The shell's own breakpoint: the sidebar and header from here, the phone frame below (Tailwind `md`). */
const DESKTOP_QUERY = "(min-width: 768px)";

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

/** Where a page that needs a roomier side column splits in two (Tailwind `xl`). */
const WIDE_TWO_COLUMN_QUERY = "(min-width: 1280px)";

/**
 * True from the `xl` breakpoint, for a page whose side column needs more
 * room than `lg` leaves beside the open sidebar (the home: at 1024px its
 * side column was about 228px and truncated the shortcuts). Server: `false`.
 */
export function useIsWideTwoColumn(): boolean {
  return useMatches(WIDE_TWO_COLUMN_QUERY);
}
