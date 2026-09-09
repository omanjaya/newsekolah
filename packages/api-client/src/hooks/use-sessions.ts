import { useQuery } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

/** GET /v1/auth/sessions: active sessions of the current user. */
export function useSessions(client: NewsekolahApiClient) {
  return useQuery({
    queryKey: queryKeys.sessions(),
    queryFn: () => client.GET("/v1/auth/sessions"),
  });
}
