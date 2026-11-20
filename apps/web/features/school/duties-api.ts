"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";
import { useActiveYear } from "../../lib/hooks/use-active-year";
import { clearServerAccessCookie } from "../../lib/session/clear-server-access-cookie";
import { switchReader } from "../../lib/session/switch-reader";

import { useInvalidate } from "./api";

// Duty types (their name, scope and the permissions they grant while
// active), duty assignments (who holds one), and impersonation -- kept in
// this file, separate from api.ts, so that file stays under the 400-line
// limit.

export function useDutyTypesQuery(includeInactive = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: [...queryKeys.dutyTypes(), includeInactive] as const,
    queryFn: () =>
      client.GET("/v1/duties", {
        params: { query: includeInactive ? { include_inactive: true } : {} },
      }),
  });
}

export function useCreateDutyTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["duties"]);
  return useMutation({
    mutationFn: (body: {
      slug: string;
      name: string;
      scope_kind: components["schemas"]["DutyScopeKind"];
    }) => client.POST("/v1/duties", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateDutyTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["duties"]);
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        name: string;
        scope_kind: components["schemas"]["DutyScopeKind"];
        is_active: boolean;
      };
    }) => client.PUT("/v1/duties/{dutyId}", { params: { path: { dutyId: id } }, body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteDutyTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["duties"]);
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/duties/{dutyId}", { params: { path: { dutyId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useReplaceDutyPermissionsMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["duties"]);
  return useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) =>
      client.PUT("/v1/duties/{dutyId}/permissions", {
        params: { path: { dutyId: id } },
        body: { permissions },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/**
 * GET /v1/staff-options: active teachers and staff, matched by `search`.
 * Backs the duty-assignment form's assignee field instead of the whole
 * directory (which also lists students, filtered out client-side today).
 */
export function useStaffOptionsQuery(search: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["staff-options", search] as const,
    queryFn: () =>
      client.GET("/v1/staff-options", { params: { query: { search: search || undefined } } }),
  });
}

export function useDutyAssignmentsQuery() {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: queryKeys.dutyAssignments(year.id),
    queryFn: () =>
      client.GET("/v1/duty-assignments", { params: { query: { academic_year_id: year.id } } }),
    enabled: year.id !== "",
  });
}

/**
 * A homeroom duty change also changes the class's homeroom teacher (the
 * API keeps the two in step), so the class list refreshes with the duty
 * list instead of showing the old name until a reload.
 */
function useInvalidateAssignments() {
  return useInvalidate(["duties"], ["academic", "classes"]);
}

export function useCreateDutyAssignmentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateAssignments();
  return useMutation({
    mutationFn: (body: components["schemas"]["DutyAssignmentWrite"]) =>
      client.POST("/v1/duty-assignments", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/** Activates, deactivates (with an optional end date), or ends a duty assignment without deleting its row. */
export function useUpdateDutyAssignmentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateAssignments();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { is_active: boolean; ends_on?: string } }) =>
      client.PUT("/v1/duty-assignments/{assignmentId}", {
        params: { path: { assignmentId: id } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useEndDutyAssignmentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateAssignments();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/duty-assignments/{assignmentId}", {
        params: { path: { assignmentId: id } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/**
 * POST /v1/users/{userId}/impersonate. Swaps the caller's own session for a
 * fresh 30-minute session as the target user (docs/08-security.md section
 * 2 requires the switch to be immediate and visibly marked), handled the
 * way the role-testing switch handles its own: the server access cookie
 * is removed before the request, so a reload cannot render the admin's
 * `/v1/me` over the impersonated account (an impersonation that cannot
 * remove it does not start, and fails with `ServerAccessCookieError`,
 * which the caller shows as such), and the response goes through
 * `switchReader`.
 * The server parks the admin's own login in an httpOnly continuation
 * cookie, so a reload refreshes the impersonation (up to its fixed end)
 * instead of signing out, and stopping it restores the admin
 * (features/auth/api.ts, useStopImpersonationMutation).
 * SimulationSync would not drop the admin's reads: it refetches only when
 * the business clock moves, not when the reader changes.
 */
export function useImpersonateUserMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await clearServerAccessCookie();
      return client.POST("/v1/users/{userId}/impersonate", {
        params: { path: { userId } },
        body: { client: "web" },
      });
    },
    onSuccess: async (data) => {
      await switchReader(queryClient, client, data);
      // Seeded from the response above; read once more from the server too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },

    meta: { errorToast: false },
  });
}
