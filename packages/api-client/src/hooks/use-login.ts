import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import type { components } from "../gen/schema.js";
import { queryKeys } from "../query-keys.js";

type LoginRequest = components["schemas"]["LoginRequest"];

/** POST /v1/auth/login. Invalidates `me` on success so the shell re-fetches. */
export function useLogin(client: NewsekolahApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => client.POST("/v1/auth/login", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
