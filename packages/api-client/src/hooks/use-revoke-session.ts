import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

/** DELETE /v1/auth/sessions/{sessionId}. */
export function useRevokeSession(client: NewsekolahApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      client.DELETE("/v1/auth/sessions/{sessionId}", { params: { path: { sessionId } } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
    },
  });
}
