import { useQuery } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

/** Current user, roles, effective permissions, and tenant (GET /v1/me). */
export function useMe(client: NewsekolahApiClient) {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => client.GET("/v1/me"),
  });
}
