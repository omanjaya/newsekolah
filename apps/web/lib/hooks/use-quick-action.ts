"use client";

import { useEffect, useRef } from "react";

import { QUICK_ACTION_PARAM } from "../quick-actions";

/**
 * Runs `start` once when the page was opened by a command palette or tab bar
 * quick action for `action` (`?quick=<action>`), then removes the parameter
 * so a reload or a copied link does not start it again. `enabled` holds the
 * trigger back until the screen can actually perform the action.
 */
export function useQuickAction(action: string, start: () => void, enabled = true): void {
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(QUICK_ACTION_PARAM) !== action) return;
    url.searchParams.delete(QUICK_ACTION_PARAM);
    window.history.replaceState(null, "", url);
    startRef.current();
  }, [action, enabled]);
}
