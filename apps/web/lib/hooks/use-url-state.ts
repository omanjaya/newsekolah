"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState, type SetStateAction } from "react";

/**
 * Keeps a small, validated UI choice in the URL without navigating the Next route.
 *
 * The value is read from `useSearchParams()`, never from `window.location`:
 * on a client navigation (a tab Link, `router.replace`, a page redirect) the
 * router renders the new tree before it commits the URL to history, so the
 * browser still holds the old query during that render. Writes go through
 * the history API, which Next patches to feed `useSearchParams()`, and the
 * router's own popstate handling covers back and forward.
 */
export function useUrlState<T extends string>(
  key: string,
  values: readonly T[] | ((value: string) => boolean),
  defaultValue: T,
): readonly [T, (value: SetStateAction<T>) => void, (value: SetStateAction<T>) => void] {
  const searchParams = useSearchParams();
  // Next applies a history write to `useSearchParams()` in a transition;
  // this re-render lets the host pick the new value up as soon as it lands.
  const [, refresh] = useState(0);
  const requested = searchParams.get(key);
  const valid = (candidate: string) =>
    typeof values === "function" ? values(candidate) : values.includes(candidate as T);
  const value = requested !== null && valid(requested) ? (requested as T) : defaultValue;

  const write = useCallback(
    (update: SetStateAction<T>, replace: boolean) => {
      const url = new URL(window.location.href);
      const current = url.searchParams.get(key);
      const isValid = (candidate: string) =>
        typeof values === "function" ? values(candidate) : values.includes(candidate as T);
      const previous = current !== null && isValid(current) ? (current as T) : defaultValue;
      const next = typeof update === "function" ? update(previous) : update;
      if (!isValid(next)) return;
      url.searchParams.set(key, next);
      if (url.href === window.location.href) return;
      // A string, not the URL object: the service worker's navigation
      // cache (next.config.ts, cacheOnNavigation) wraps the history API
      // and posts this argument to a Worker, which cannot clone a URL.
      window.history[replace ? "replaceState" : "pushState"](null, "", url.href);
      refresh((version) => version + 1);
    },
    [key, values, defaultValue],
  );

  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      write(next, false);
    },
    [write],
  );
  const replaceValue = useCallback(
    (next: SetStateAction<T>) => {
      write(next, true);
    },
    [write],
  );

  return [value, setValue, replaceValue] as const;
}
