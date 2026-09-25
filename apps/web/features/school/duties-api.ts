"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { setAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { useActiveYear } from "../../lib/hooks/use-active-year";

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

export function useCreateDutyAssignmentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["duties"]);
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
  const invalidate = useInvalidate(["duties"]);
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
  const invalidate = useInvalidate(["duties"]);
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
 * fresh 30-minute session as the target user, so the response is handled
 * the same way as a login: store the new access token and seed `me` from
 * the response instead of waiting on a refetch (docs/08-security.md
 * section 2 requires the switch to be immediate and visibly marked).
 */
export function useImpersonateUserMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      client.POST("/v1/users/{userId}/impersonate", {
        params: { path: { userId } },
        body: { client: "web" },
      }),
    onSuccess: (data) => {
      setAccessToken(data.access_token);
      queryClient.setQueryData(queryKeys.me(), data.user);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },

    meta: { errorToast: false },
  });
}
