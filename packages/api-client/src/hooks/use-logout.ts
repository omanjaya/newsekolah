import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";

import { clearReaderCache } from "./reader-cache.js";

/**
 * POST /v1/auth/logout. Empties the cache once the server has ended the
 * session (all but the tenant's branding, see `clearReaderCache`): the next
 * screen starts from a signed-out state. The app also drops its own access
 * token and calls `client.forgetAccessToken()`.
 */
export function useLogout(client: NewsekolahApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/auth/logout"),
    onSuccess: () => {
      clearReaderCache(queryClient);
    },
  });
}
