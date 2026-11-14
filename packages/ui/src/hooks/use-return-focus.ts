"use client";

import { useRef } from "react";

type AutoFocusHandler = ((event: Event) => void) | undefined;

export interface ReturnFocusHandlers {
  onOpenAutoFocus: (event: Event) => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** A menu, or a popover's panel: layers that close on their own once an item opens a dialog. */
const POPUP_LAYER = '[role="menu"], [data-radix-popper-content-wrapper] > [role="dialog"]';

/** How many popups deep to look for the control the reader started from (a submenu in a menu). */
const MAX_POPUP_DEPTH = 4;

/**
 * The control that opened the popup `element` sits in: a menu names its
 * trigger through `aria-labelledby`, a popover's trigger points at the
 * panel through `aria-controls`. Null outside a popup.
 */
function popupTrigger(element: HTMLElement): HTMLElement | null {
  const layer = element.closest<HTMLElement>(POPUP_LAYER);
  if (!layer) return null;
  const labelledBy = layer.getAttribute("aria-labelledby");
  const byLabel = labelledBy ? document.getElementById(labelledBy) : null;
  if (byLabel) return byLabel;
  if (!layer.id) return null;
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[aria-controls]")).find(
      (candidate) => candidate.getAttribute("aria-controls") === layer.id,
    ) ?? null
  );
}

/**
 * Where focus may go back to, best first: the element that had focus when
 * the dialog opened, then, when that sat in a menu or popover that has
 * closed since, the control that opened that popup.
 */
function returnCandidates(active: HTMLElement): HTMLElement[] {
  const candidates = [active];
  let current: HTMLElement | null = active;
  for (let depth = 0; current && depth < MAX_POPUP_DEPTH; depth += 1) {
    current = popupTrigger(current);
    if (current) candidates.push(current);
  }
  return candidates;
}

/**
 * Sends focus back to whatever had it when a Radix dialog opened, once it
 * closes. Radix's modal content returns focus only to its own `Trigger`,
 * and almost every dialog here is opened from state (a row's menu item, a
 * toolbar button, a shortcut), so without this a keyboard or screen-reader
 * user lands on the page body and starts again from the top.
 *
 * Spread the result onto `DialogPrimitive.Content`, passing the caller's
 * own handlers through. A caller that prevents the close event's default
 * keeps full control. When nothing remembered can take focus any more,
 * Radix's own behaviour (its trigger, if there is one) runs instead.
 */
export function useReturnFocus(
  onOpenAutoFocus: AutoFocusHandler,
  onCloseAutoFocus: AutoFocusHandler,
): ReturnFocusHandlers {
  const returnTo = useRef<HTMLElement[]>([]);
  return {
    onOpenAutoFocus: (event) => {
      // Radix fires this before it moves focus in, so this is still the opener.
      const active = document.activeElement;
      returnTo.current =
        active instanceof HTMLElement && active !== document.body ? returnCandidates(active) : [];
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event) => {
      onCloseAutoFocus?.(event);
      const candidates = returnTo.current;
      returnTo.current = [];
      if (event.defaultPrevented) return;
      for (const candidate of candidates) {
        if (!candidate.isConnected) continue;
        candidate.focus({ preventScroll: true });
        // A disabled button refuses focus; try the next one.
        if (document.activeElement === candidate) {
          event.preventDefault();
          return;
        }
      }
    },
  };
}
