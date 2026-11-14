"use client";

import { useEffect, type RefObject } from "react";

/** The CSS variable a `fit` page subtracts from the viewport (PageShell, AppPage). */
export const SHELL_HEADER_HEIGHT_VAR = "--shell-header-height";

/**
 * Publishes the measured height of the shell's sticky stack (the header
 * plus whatever standing strips show under it: testing as another
 * account, a simulated clock, offline, a new version, a realtime
 * disconnect) on `host` as --shell-header-height, and keeps it current as
 * strips come and go. A `fit` page under `host` then fills exactly the
 * space below the stack instead of assuming the bare 56px header.
 */
export function useShellHeaderHeight(
  stack: RefObject<HTMLElement | null>,
  host: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const measured = stack.current;
    const target = host.current;
    if (!measured || !target) return;
    const publish = () => {
      const height = Math.round(measured.getBoundingClientRect().height);
      target.style.setProperty(SHELL_HEADER_HEIGHT_VAR, `${String(height)}px`);
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(measured);
    return () => {
      observer?.disconnect();
      target.style.removeProperty(SHELL_HEADER_HEIGHT_VAR);
    };
  }, [stack, host]);
}
