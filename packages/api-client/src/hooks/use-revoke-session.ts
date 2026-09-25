import { useMutation, useQueryClient, type MutationMeta } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

export interface UseRevokeSessionOptions {
  /** Forwarded to `useMutation` as-is -- see UseLoginOptions.meta's doc
   * comment in use-login.ts for why this hook takes it instead of
   * assuming a default. */
  meta?: MutationMeta;
}

/** DELETE /v1/auth/sessions/{sessionId}. */
export function useRevokeSession(
  client: NewsekolahApiClient,
  options: UseRevokeSessionOptions = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      client.DELETE("/v1/auth/sessions/{sessionId}", { params: { path: { sessionId } } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
    },
    meta: options.meta,
  });
}
