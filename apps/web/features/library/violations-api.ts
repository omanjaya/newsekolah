"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryViolation = components["schemas"]["LibraryViolation"];
export type LibraryViolationWrite = components["schemas"]["LibraryViolationWrite"];
export type LibraryViolationKind = components["schemas"]["LibraryViolationKind"];
export type LibraryViolationStatus = components["schemas"]["LibraryViolationStatus"];
export type LibraryPenalty = components["schemas"]["LibraryPenalty"];

const keys = {
  list: (status?: string, kind?: string) => ["library", "violations", { status, kind }] as const,
  member: (userId: string) => ["library", "violations", "member", userId] as const,
};

function useInvalidateViolations() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["library", "violations"] });
    // Settling a violation can reactivate a suspended member, so the
    // member list/detail must refresh too.
    void queryClient.invalidateQueries({ queryKey: ["library", "members"] });
  };
}

export function useLibraryViolationsQuery(params: {
  status?: LibraryViolationStatus | "";
  kind?: LibraryViolationKind | "";
}) {
  const client = useApiClient();
  const status = params.status === "" ? undefined : params.status;
  const kind = params.kind === "" ? undefined : params.kind;
  return useQuery({
    queryKey: keys.list(status, kind),
    queryFn: () =>
      client.GET("/v1/library/violations", {
        params: { query: { status, kind, limit: 200 } },
      }),
  });
}

export function useMemberViolationsQuery(userId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.member(userId),
    queryFn: () =>
      client.GET("/v1/library/members/{userId}/violations", { params: { path: { userId } } }),
    enabled: Boolean(userId),
  });
}

export function useCreateLibraryViolationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateViolations();
  return useMutation({
    mutationFn: (body: LibraryViolationWrite) => client.POST("/v1/library/violations", { body }),
    onSuccess: invalidate,
  });
}

export function useSettleLibraryViolationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateViolations();
  return useMutation({
    mutationFn: ({ violationId, status }: { violationId: string; status: "paid" | "waived" }) =>
      client.POST("/v1/library/violations/{violationId}/settle", {
        params: { path: { violationId } },
        body: { status },
      }),
    onSuccess: invalidate,
  });
}
