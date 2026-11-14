"use client";

import { useSyncExternalStore } from "react";

function unsubscribe(): void {
  // Nothing was subscribed: hydration happens once and is never undone.
}

function subscribeToNothing(): () => void {
  return unsubscribe;
}

function hydratedOnClient(): boolean {
  return true;
}

function notHydratedOnServer(): boolean {
  return false;
}

/**
 * False in the server markup and during hydration, true once React owns
 * the page on the client. Built on useSyncExternalStore's server snapshot,
 * so the first client render matches the server's and no effect runs to
 * flip it (a client-only navigation reads true from the first render).
 *
 * A form's submit control uses it to stay disabled until its handler is
 * attached: before that, pressing the button would run the browser's own
 * submit instead of the app's.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeToNothing, hydratedOnClient, notHydratedOnServer);
}
