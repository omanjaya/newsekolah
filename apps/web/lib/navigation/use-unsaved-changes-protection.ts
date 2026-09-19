"use client";

import { useEffect } from "react";

const UNSAVED_CHANGES_EVENT = "newsekolah:confirm-unsaved-changes";

/** Lets navigation initiated by a button or command palette ask active editors first. */
export function confirmUnsavedChangesBeforeNavigation(): boolean {
  return window.dispatchEvent(new CustomEvent(UNSAVED_CHANGES_EVENT, { cancelable: true }));
}

/**
 * Stops ordinary in-app link navigation and browser reloads while an editor
 * has changes that are only held in memory. It deliberately does not create a
 * local draft: attendance rosters and scores should not be copied to storage.
 */
export function useUnsavedChangesProtection(isDirty: boolean, message: string): void {
  useEffect(() => {
    function confirmDiscard(): boolean {
      return !isDirty || window.confirm(message);
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
    }

    function onNavigationRequest(event: Event) {
      if (!confirmDiscard()) event.preventDefault();
    }

    const navigationApi = (window as Window & { navigation?: EventTarget }).navigation;
    function onNavigate(event: Event) {
      const navigationEvent = event as Event & {
        canIntercept?: boolean;
        navigationType?: "push" | "reload" | "replace" | "traverse";
      };
      if (navigationEvent.navigationType !== "traverse" || !event.cancelable) return;
      if (!confirmDiscard()) event.preventDefault();
    }

    function onDocumentClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download")) {
        return;
      }
      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      ) {
        return;
      }
      if (!confirmDiscard()) event.preventDefault();
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener(UNSAVED_CHANGES_EVENT, onNavigationRequest);
    navigationApi?.addEventListener("navigate", onNavigate);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener(UNSAVED_CHANGES_EVENT, onNavigationRequest);
      navigationApi?.removeEventListener("navigate", onNavigate);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [isDirty, message]);
}
