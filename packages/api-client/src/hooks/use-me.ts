import { useQuery } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

export interface UseMeOptions {
  /**
   * False when the app knows there is no session to read (an anonymous
   * visit to a public page): nothing is sent, and a `me` already in the
   * cache (seeded by a sign-in) is still returned.
   */
  enabled?: boolean;
}

/** Current user, roles, effective permissions, and tenant (GET /v1/me). */
export function useMe(client: NewsekolahApiClient, { enabled = true }: UseMeOptions = {}) {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => client.GET("/v1/me"),
    enabled,
  });
}
