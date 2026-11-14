"use client";

import { useEffect, useSyncExternalStore, type RefObject } from "react";

/**
 * Whether the page's large title has scrolled away under the app's sticky
 * header, and what to call the page there. A PageHeader writes it; an
 * app's compact header reads it (on a phone it swaps the school name for
 * the page title while the large one is out of view).
 */
export interface CollapsedTitle {
  /** The page's name for the compact header, or null when no page has one. */
  title: string | null;
  /** True while the large title is scrolled out of view. */
  collapsed: boolean;
}

const EMPTY: CollapsedTitle = { title: null, collapsed: false };

type Listener = () => void;

/**
 * A tiny external store. Each writer holds a token, so a page that
 * unmounts after the next one has mounted (a route change commits the new
 * page before the old one's cleanup runs) cannot wipe the newer title.
 */
function createCollapsedTitleStore() {
  let state: CollapsedTitle = EMPTY;
  let owner: symbol | null = null;
  const listeners = new Set<Listener>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    get: (): CollapsedTitle => state,
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Takes the store over for `token` and sets its state. */
    set(token: symbol, next: CollapsedTitle): void {
      owner = token;
      if (state.title === next.title && state.collapsed === next.collapsed) return;
      state = next;
      emit();
    },
    /** Clears the store, unless another writer has taken it over since. */
    release(token: symbol): void {
      if (owner !== token) return;
      owner = null;
      state = EMPTY;
      emit();
    },
  };
}

export const collapsedTitleStore = createCollapsedTitleStore();

/** The current page title state, for an app's compact header. */
export function useCollapsedTitle(): CollapsedTitle {
  return useSyncExternalStore(collapsedTitleStore.subscribe, collapsedTitleStore.get, () => EMPTY);
}

/** A CSS length in px or rem as pixels; anything else as 0. */
export function cssLengthToPx(value: string, rootFontSize = 16): number {
  const match = /^\s*(-?[\d.]+)(px|rem)?\s*$/.exec(value);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  return match[2] === "rem" ? amount * rootFontSize : amount;
}

/**
 * How far down the viewport the app's sticky chrome reaches above `element`:
 * the shell's measured `--shell-header-height`, inherited from an ancestor,
 * or 0 outside an app shell.
 */
function stickyTopOf(element: Element): number {
  const value = getComputedStyle(element).getPropertyValue("--shell-header-height");
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return cssLengthToPx(value, root);
}

/**
 * Watches `titleRef` (a page's h1) and publishes whether it has scrolled
 * away under the sticky header, with an IntersectionObserver whose top
 * edge is the header's bottom. `title` names the page for the compact
 * header; without it the heading's own text does. `false` opts the page
 * out (it keeps the school name).
 */
export function useCollapsingTitle(
  titleRef: RefObject<HTMLElement | null>,
  title: string | false | undefined,
): void {
  useEffect(() => {
    const heading = titleRef.current;
    if (!heading || title === false || typeof IntersectionObserver === "undefined") return;
    const token = Symbol("page-title");
    // Read when it is shown, so a heading filled in after loading is current.
    const name = () => (title ?? heading.textContent).trim() || null;
    collapsedTitleStore.set(token, { title: name(), collapsed: false });
    const top = stickyTopOf(heading);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Out of view above the header's edge, not below the fold.
        const collapsed = !entry.isIntersecting && entry.boundingClientRect.bottom <= top + 1;
        collapsedTitleStore.set(token, { title: name(), collapsed });
      },
      { rootMargin: `${String(-top)}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(heading);
    return () => {
      observer.disconnect();
      collapsedTitleStore.release(token);
    };
  }, [titleRef, title]);
}
