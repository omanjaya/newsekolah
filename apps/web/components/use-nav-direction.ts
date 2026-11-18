"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import {
  HistoryTrail,
  resolveNavDirection,
  type HistoryMove,
} from "../lib/navigation/nav-direction";

/** The attribute on <html> the phone's page-enter rules read (globals.css). */
export const NAV_DIRECTION_ATTR = "data-nav-direction";

/**
 * Marks <html> with the direction of each navigation (lib/navigation/nav-direction.ts)
 * before the new page paints, so its content enters from the right when
 * going deeper, from the left when going back, and with a plain fade when
 * switching bottom tabs. Only the page's own column moves (globals.css,
 * phone widths only); the shell never does.
 *
 * A layout effect, so the attribute is in place in the same frame the new
 * page's elements are first styled. The browser's back and forward are
 * told apart by a `popstate` listener, which fires before the router
 * renders the page it restores.
 */
export function useNavDirection(
  pathname: string,
  tabRoots: readonly string[],
  ownerOf?: (path: string) => string | undefined,
): void {
  const previous = useRef<string | undefined>(undefined);
  const trail = useRef<HistoryTrail | null>(null);
  const popped = useRef<string | null>(null);
  const roots = useRef(tabRoots);
  const owner = useRef(ownerOf);

  // Declared first, so it runs before the direction below on the same commit.
  useLayoutEffect(() => {
    roots.current = tabRoots;
    owner.current = ownerOf;
  });

  useEffect(() => {
    const onPop = () => {
      popped.current = window.location.pathname;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.documentElement.removeAttribute(NAV_DIRECTION_ATTR);
    };
  }, []);

  useLayoutEffect(() => {
    trail.current ??= new HistoryTrail();
    const from = previous.current;
    previous.current = pathname;
    const wasPop = popped.current === pathname;
    popped.current = null;
    let history: HistoryMove | undefined;
    if (wasPop) history = trail.current.pop(pathname);
    else trail.current.push(pathname);
    const direction = resolveNavDirection({
      from,
      to: pathname,
      history,
      tabRoots: roots.current,
      ownerOf: owner.current,
    });
    document.documentElement.setAttribute(NAV_DIRECTION_ATTR, direction);
  }, [pathname]);
}
