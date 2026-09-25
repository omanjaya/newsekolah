import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import type { components } from "../gen/schema.js";
import { queryKeys } from "../query-keys.js";

type LoginRequest = components["schemas"]["LoginRequest"];
type LoginResponse = components["schemas"]["AuthTokens"] & { user: components["schemas"]["Me"] };

export interface UseLoginOptions {
  /**
   * Runs before the `me` cache is seeded and refetched, so the app can
   * store the access token first; otherwise the refetch would go out
   * unauthenticated and flip the session back to anonymous.
   */
  onTokens?: (data: LoginResponse) => void;
}

/**
 * POST /v1/auth/login. Clears the whole cache first -- the mirror image of
 * `useLogout`'s `queryClient.clear()` -- then seeds `me` from the login
 * payload so route guards never observe an anonymous gap between "logged
 * in" and the refetch landing.
 *
 * Without the clear, every query key in this package and the app's own
 * feature modules (e.g. `["grading","gradebook",classId,subjectId,...]`)
 * carries no user or tenant discriminator (see query-keys.ts), so signing
 * into a second account in the same tab -- without an intervening logout,
 * e.g. an admin testing several roles, or a forced re-login after a
 * session expired mid-session -- could serve that PREVIOUS account's
 * cached data, or worse, its cached *error* (a stale 403 that only a
 * manual retry or `staleTime` expiry would clear), to the newly
 * authenticated user.
 */
export function useLogin(client: NewsekolahApiClient, options: UseLoginOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => client.POST("/v1/auth/login", { body }),
    onSuccess: (data) => {
      options.onTokens?.(data);
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me(), data.user);
    },
  });
}
