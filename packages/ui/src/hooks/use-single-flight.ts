"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Wraps an async submit handler so a second call while the first is still
 * running is ignored. A Button's `loading={mutation.isPending}` alone does
 * not stop a fast double click or a repeated Enter: `isPending` only reaches
 * the component after TanStack Query's batched notification and a React
 * re-render, and every click dispatched before that commit runs the handler
 * again and sends a duplicate request. The ref here is set synchronously,
 * so the guard holds from the very first call.
 *
 * The lock is released when the handler settles, whether it resolved or
 * threw, so a failed save can be retried.
 */
export function useSingleFlight<Args extends unknown[]>(
  handler: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  const inFlight = useRef(false);
  const latest = useRef(handler);

  // Synced before the browser can dispatch the next click, so the wrapper
  // always runs the handler from the latest render.
  useLayoutEffect(() => {
    latest.current = handler;
  });

  return useCallback(async (...args: Args) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await latest.current(...args);
    } finally {
      inFlight.current = false;
    }
  }, []);
}
