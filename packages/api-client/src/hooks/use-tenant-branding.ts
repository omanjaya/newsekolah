import { useQuery } from "@tanstack/react-query";

import type { NewsekolahApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

/** GET /v1/tenant/branding: public branding for the resolved tenant (login screen, manifest). */
export function useTenantBranding(client: NewsekolahApiClient, tenantSlug?: string) {
  return useQuery({
    queryKey: queryKeys.tenantBranding(tenantSlug),
    queryFn: () => client.GET("/v1/tenant/branding"),
  });
}
