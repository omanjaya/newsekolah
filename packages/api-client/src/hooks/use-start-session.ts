import { useQueryClient } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
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
 * makes the client drop any refresh still on its way for whoever was
 * signed in before (`client.forgetAccessToken()`), hands the tokens to the
 * app, empties the cache (see `clearReaderCache`), and seeds `me` from the
 * response so a route guard never sees an anonymous gap or the previous
 * account's `me`. Returns the function to call with them, typically as a
 * mutation's `onSuccess`.
 *
 * Without the first step a refresh that started before the sign-in (the
 * sign-in page's own `/v1/me`, sent with no token) could land after it:
 * a success would hand the app the previous identity's token over the new
 * one, and a failure would report the new session as unauthorized.
 */
export function useStartSession(
  client: NewsekolahApiClient,
  options: UseStartSessionOptions = {},
): (data: AuthTokens) => void {
  const queryClient = useQueryClient();
  const { onTokens } = options;
  return (data) => {
    client.forgetAccessToken();
    onTokens?.(data);
    clearReaderCache(queryClient);
    queryClient.setQueryData(queryKeys.me(), data.user);
  };
}
