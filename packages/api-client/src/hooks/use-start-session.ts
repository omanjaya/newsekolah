import { useQueryClient } from "@tanstack/react-query";

import type { components } from "../gen/schema.js";
import { queryKeys } from "../query-keys.js";

import { clearReaderCache } from "./reader-cache.js";

type AuthTokens = components["schemas"]["AuthTokens"];

export interface UseStartSessionOptions {
  /**
   * Runs first, so the app can store the access token before anything is
   * read for the new account; otherwise the refetch of `me` would go out
   * unauthenticated and flip the session back to anonymous.
   */
  onTokens?: (data: AuthTokens) => void;
}

/**
 * What every sign-in does with the tokens it got, whichever way the person
 * proved who they are (password through `useLogin`, Google, a passkey):
 * hand them to the app, empty the cache (see `clearReaderCache`), and seed
 * `me` from the response so a route guard never sees an anonymous gap or
 * the previous account's `me`. Returns the function to call with them,
 * typically as a mutation's `onSuccess`.
 */
export function useStartSession(options: UseStartSessionOptions = {}): (data: AuthTokens) => void {
  const queryClient = useQueryClient();
  const { onTokens } = options;
  return (data) => {
    onTokens?.(data);
    clearReaderCache(queryClient);
    queryClient.setQueryData(queryKeys.me(), data.user);
  };
}
