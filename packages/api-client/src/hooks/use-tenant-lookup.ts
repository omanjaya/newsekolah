import { useQuery } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

/**
 * GET /v1/tenants/lookup: mobile school picker. Disabled below the API's
 * 2-character minimum so the field doesn't fire a request per keystroke on
 * a single letter.
 */
export function useTenantLookup(client: NewsekolahApiClient, query: string) {
  return useQuery({
    queryKey: queryKeys.tenantLookup(query),
    queryFn: () => client.GET("/v1/tenants/lookup", { params: { query: { q: query } } }),
    enabled: query.trim().length >= 2,
  });
}
