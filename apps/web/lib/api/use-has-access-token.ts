"use client";

import { useSyncExternalStore } from "react";

import { getAccessToken, subscribeAccessToken } from "./access-token";

/**
 * True once the in-memory access token exists. On a fresh page load the
 * session `me` can already be present (dehydrated by the server from the
 * `sat` cookie) while the browser holds no access token yet; a request made
 * in that window is answered 401 and only succeeds after the client's
 * refresh-and-retry. Optional, non-critical queries use this to wait for
 * the token instead of producing a failed request in the console.
 */
export function useHasAccessToken(): boolean {
  return useSyncExternalStore(
    subscribeAccessToken,
    () => getAccessToken() !== null,
    () => false,
  );
}
