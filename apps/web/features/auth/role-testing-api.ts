"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { setAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { useHasAccessToken } from "../../lib/api/use-has-access-token";
import { clearServerAccessCookie } from "../../lib/session/clear-server-access-cookie";
import { useSession } from "../../lib/session/session-provider";
import { suspendSimulation, syncSimulationIdentity } from "../../lib/simulation/clock";

export interface RoleTestingFilter {
  role?: string;
  q?: string;
  cursor?: string;
}

export function useRoleTestingQuery(filter: RoleTestingFilter = {}, enabled = true) {
  const client = useApiClient();
  const { me } = useSession();
  // `/v1/auth/*` requests skip the api client's boot refresh, so on a cold
  // load a request made before the browser holds an access token is answered
  // 401. Every caller (header switcher, impersonation banner) waits here.
  const hasAccessToken = useHasAccessToken();
  return useQuery({
    queryKey: [
      "auth",
      "role-testing",
      me?.tenant.tenant_id ?? "",
      me?.id ?? "",
      me?.impersonated_by?.user_id ?? "",
      filter.role ?? "",
      filter.q ?? "",
      filter.cursor ?? "",
    ],
    queryFn: () => client.GET("/v1/auth/role-testing", { params: { query: filter } }),
    enabled: enabled && Boolean(me) && hasAccessToken,
    retry: false,
    staleTime: 15_000,
  });
}

/**
 * Starts testing as another account, or (with `null`) goes back to the
 * superadmin's own. Removes the server access cookie first, so neither a
 * reload nor the next server render can load the previous actor's
 * `/v1/me`; a switch that cannot remove it does not happen.
 */
export function useRoleTestingSwitchMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (target: { userId: string; role: string } | null) => {
      await clearServerAccessCookie();
      const result = target
        ? await client.POST("/v1/auth/role-testing/start", {
            body: { user_id: target.userId, role: target.role },
          })
        : await client.POST("/v1/auth/role-testing/stop");

      // Prevent in-flight old-actor responses from reintroducing private data.
      await queryClient.cancelQueries();
      suspendSimulation();
      setAccessToken(result.access_token);
      queryClient.removeQueries({
        predicate: (query) => !(query.queryKey.length === 1 && query.queryKey[0] === "me"),
      });
      queryClient.setQueryData(queryKeys.me(), result.user);
      syncSimulationIdentity(result.user);
      return result;
    },
  });
}
