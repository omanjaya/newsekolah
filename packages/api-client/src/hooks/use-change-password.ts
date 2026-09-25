import { useMutation, useQueryClient, type MutationMeta } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

export interface ChangePasswordBody {
  current_password: string;
  new_password: string;
}

export interface UseChangePasswordOptions {
  /** Forwarded to `useMutation` as-is -- see UseLoginOptions.meta's doc
   * comment in use-login.ts for why this hook takes it instead of
   * assuming a default. */
  meta?: MutationMeta;
}

/** PUT /v1/me/password. Revokes other sessions server-side, so `sessions` is refetched. */
export function useChangePassword(
  client: NewsekolahApiClient,
  options: UseChangePasswordOptions = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordBody) => client.PUT("/v1/me/password", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
    },
    meta: options.meta,
  });
}
