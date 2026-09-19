"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type SetStateAction } from "react";

/** Keeps a small, validated UI choice in the URL without navigating the Next route. */
export function useUrlState<T extends string>(
  key: string,
  values: readonly T[] | ((value: string) => boolean),
  defaultValue: T,
): readonly [T, (value: SetStateAction<T>) => void, (value: SetStateAction<T>) => void] {
  const searchParams = useSearchParams();
  const [, refresh] = useState(0);
  const currentParams =
    typeof window === "undefined" ? searchParams : new URLSearchParams(window.location.search);
  const requested = currentParams.get(key);
  const valid = (candidate: string) =>
    typeof values === "function" ? values(candidate) : values.includes(candidate as T);
  const value = requested !== null && valid(requested) ? (requested as T) : defaultValue;

  useEffect(() => {
    const onPopState = () => {
      refresh((version) => version + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

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
      window.history[replace ? "replaceState" : "pushState"](null, "", url);
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
