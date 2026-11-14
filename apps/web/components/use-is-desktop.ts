"use client";

import { useSyncExternalStore } from "react";

/** The shell's own breakpoint: the sidebar and header from here, the phone frame below (Tailwind `md`). */
const DESKTOP_QUERY = "(min-width: 768px)";

function mediaQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DESKTOP_QUERY)
    : null;
}

function subscribe(callback: () => void): () => void {
  const query = mediaQuery();
  query?.addEventListener("change", callback);
  return () => {
    query?.removeEventListener("change", callback);
  };
}

/**
 * True from the `md` breakpoint, for the few shell surfaces that are a
 * different component on a phone (a bottom sheet instead of a popover or
 * a menu) rather than the same one restyled. The server and an environment
 * without `matchMedia` get the phone layout; the trigger is the same
 * element either way, so nothing moves when the client corrects it.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mediaQuery()?.matches ?? false,
    () => false,
  );
}
