"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMe } from "@newsekolah/api-client/react";
import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

/**
 * The dashboard has no aggregate endpoint of its own yet (docs/03's
 * `modules/reporting` is not built): it reads `/v1/me` only, the same
 * cached query the shell already populated via SessionProvider, so this
 * adds no extra request.
 */
export function useDashboardData() {
  const client = useApiClient();
  return useMe(client);
}

export type AdminDashboard = components["schemas"]["AdminDashboard"];

/**
 * GET /v1/analytics/admin-dashboard: the operational snapshot restricted to
 * the admin/super_admin system roles regardless of who else holds
 * view_dashboard (see the handler's isAdminCaller). `enabled` lets the
 * caller skip the request entirely for a role that would only get a 403.
 */
export function useAdminDashboardQuery(enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.adminDashboard(),
    queryFn: () => client.GET("/v1/analytics/admin-dashboard"),
    enabled,
  });
}
