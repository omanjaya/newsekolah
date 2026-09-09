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

/** POST /v1/auth/login. Invalidates `me` on success so the shell re-fetches. */
export function useLogin(client: NewsekolahApiClient, options: UseLoginOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => client.POST("/v1/auth/login", { body }),
    onSuccess: (data) => {
      options.onTokens?.(data);
      // Seed the session from the login payload first so route guards never
      // observe an anonymous gap between "logged in" and the refetch landing.
      queryClient.setQueryData(queryKeys.me(), data.user);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
