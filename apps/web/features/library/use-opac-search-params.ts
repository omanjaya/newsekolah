"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export interface OpacSearchParams {
  /** The search text (`?q=`). */
  q: string;
  /** The classification group filter (`?klasifikasi=`). */
  klasifikasi: string;
}

/** Where the title page's "Kembali ke katalog" link returns to (the last catalogue URL). */
export const OPAC_LAST_SEARCH_KEY = "opac:last-search";

function readParams(params: URLSearchParams): OpacSearchParams {
  return { q: params.get("q") ?? "", klasifikasi: params.get("klasifikasi") ?? "" };
}

function rememberSearch(search: string): void {
  try {
    window.sessionStorage.setItem(OPAC_LAST_SEARCH_KEY, search);
  } catch {
    // Storage can be off (private mode); the link then returns to /opac.
  }
}

/**
 * The catalogue's search and filter, kept in the address so a search can
 * be shared, reloaded and returned to. Updates replace the history entry
 * (typing should not fill the back button) and drop empty parameters; the
 * browser's back and forward buttons are followed.
 */
export function useOpacSearchParams(): readonly [
  OpacSearchParams,
  (next: Partial<OpacSearchParams>) => void,
] {
  const searchParams = useSearchParams();
  const [state, setState] = useState(() => readParams(searchParams));
  const stateRef = useRef(state);

  useEffect(() => {
    rememberSearch(window.location.search);
    const onPopState = () => {
      const next = readParams(new URLSearchParams(window.location.search));
      stateRef.current = next;
      setState(next);
      rememberSearch(window.location.search);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const update = useCallback((patch: Partial<OpacSearchParams>) => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    // A string, not the URL object: a wrapped history API may post this
    // argument to a Worker, which cannot clone a URL (see
    // lib/hooks/use-url-state.ts).
    window.history.replaceState(null, "", url.href);
    rememberSearch(url.search);
  }, []);

  return [state, update] as const;
}
