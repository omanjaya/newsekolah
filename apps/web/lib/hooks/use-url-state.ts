"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState, type SetStateAction } from "react";

import { writeUrlHistory } from "./url-history";

/**
 * Keeps a small, validated UI choice in the URL without navigating the Next route.
 *
 * The value is read from `useSearchParams()`, never from `window.location`:
 * on a client navigation (a tab Link, `router.replace`, a page redirect) the
 * router renders the new tree before it commits the URL to history, so the
 * browser still holds the old query during that render. Writes go through
 * the history API, which Next patches to feed `useSearchParams()`, and the
 * router's own popstate handling covers back and forward.
 *
 * `omitDefault` drops the key whenever the default is written (a page
 * number back at 1), so the URL stays clean; leave it off where the
 * default can change under a shared link (the current cycle or year).
 */
export function useUrlState<T extends string>(
  key: string,
  values: readonly T[] | ((value: string) => boolean),
  defaultValue: T,
  { omitDefault = false }: { omitDefault?: boolean } = {},
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
      // An empty choice with an empty default is the unset filter: drop the
      // key instead of leaving a bare `key=` in a shared link.
      if (next === defaultValue && (defaultValue === "" || omitDefault)) {
        url.searchParams.delete(key);
      } else url.searchParams.set(key, next);
      if (url.href === window.location.href) return;
      writeUrlHistory(url.href, replace ? "replace" : "push");
      refresh((version) => version + 1);
    },
    [key, values, defaultValue, omitDefault],
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
