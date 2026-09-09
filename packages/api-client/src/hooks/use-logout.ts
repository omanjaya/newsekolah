import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";

/** POST /v1/auth/logout. Clears the whole cache: the next screen starts from a signed-out state. */
export function useLogout(client: NewsekolahApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
