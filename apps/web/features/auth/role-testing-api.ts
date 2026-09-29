"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { setAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
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
    enabled: enabled && Boolean(me),
    retry: false,
    staleTime: 15_000,
  });
}

/**
 * `sat` is a separate httpOnly access cookie used by Next server rendering.
 * Remove it before changing actors so a reload cannot prefetch the old `/v1/me`.
 */
async function clearServerAccessCookie(): Promise<void> {
  const response = await fetch("/api/role-testing/clear-access-cookie", {
    method: "POST",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Could not clear server access cookie");
}

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
