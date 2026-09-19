"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { NavItem } from "../navigation";

const EMPTY = '{"favorites":[],"recent":[]}';
const EVENT = "newsekolah:navigation-preferences";
interface Preferences {
  favorites: string[];
  recent: string[];
}

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function parse(raw: string): Preferences {
  try {
    const value = JSON.parse(raw) as Partial<Preferences>;
    const clean = (list: unknown): string[] =>
      Array.isArray(list)
        ? list.filter((item): item is string => typeof item === "string").slice(0, 20)
        : [];
    return { favorites: clean(value.favorites), recent: clean(value.recent) };
  } catch {
    return { favorites: [], recent: [] };
  }
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(EVENT, listener);
  };
}

/** Persist registry keys only: never URLs, query strings, student names, or form values. */
export function useNavigationPreferences(
  scope: string | undefined,
  items: NavItem[],
  pathname: string,
) {
  const key = `newsekolah:navigation:${scope ?? "anonymous"}`;
  const getSnapshot = useCallback(() => (scope ? read(key) : EMPTY), [key, scope]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const preferences = parse(snapshot);
  const write = useCallback(
    (update: (current: Preferences) => Preferences) => {
      if (!scope) return;
      const current = read(key);
      const next = JSON.stringify(update(parse(current)));
      if (current === next) return;
      try {
        window.localStorage.setItem(key, next);
        window.dispatchEvent(new Event(EVENT));
      } catch {
        /* Storage may be unavailable; navigation remains usable. */
      }
    },
    [key, scope],
  );
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.key;
  useEffect(() => {
    if (!active) return;
    write((current) => ({
      ...current,
      recent: [active, ...current.recent.filter((id) => id !== active)].slice(0, 5),
    }));
  }, [active, write]);
  const resolve = (ids: string[]) =>
    ids.flatMap((id) => {
      const item = items.find((candidate) => candidate.key === id);
      return item ? [item] : [];
    });
  return {
    favorites: resolve(preferences.favorites),
    recent: resolve(preferences.recent),
    toggleFavorite: (id: string) => {
      if (!items.some((item) => item.key === id)) return;
      write((current) => ({
        ...current,
        favorites: current.favorites.includes(id)
          ? current.favorites.filter((item) => item !== id)
          : [...current.favorites, id].slice(-20),
      }));
    },
  };
}
