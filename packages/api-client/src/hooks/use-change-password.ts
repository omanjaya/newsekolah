import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

export interface ChangePasswordBody {
  current_password: string;
  new_password: string;
}

/** PUT /v1/me/password. Revokes other sessions server-side, so `sessions` is refetched. */
export function useChangePassword(client: NewsekolahApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordBody) => client.PUT("/v1/me/password", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
    },
  });
}
