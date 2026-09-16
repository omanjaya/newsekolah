"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type LibraryMemberType = components["schemas"]["LibraryMemberType"];
export type LibraryMemberTypeWrite = components["schemas"]["LibraryMemberTypeWrite"];
export type LibraryMember = components["schemas"]["LibraryMember"];
export type LibraryMemberStatus = components["schemas"]["LibraryMemberStatus"];
export type LibraryMemberRegister = components["schemas"]["LibraryMemberRegister"];
export type LibraryBulkRegisterResult = components["schemas"]["LibraryBulkRegisterResult"];

const keys = {
  memberTypes: () => ["library", "member-types"] as const,
  members: (params: { status?: string; memberTypeId?: string; search?: string }) =>
    ["library", "members", params] as const,
  member: (userId: string) => ["library", "members", "detail", userId] as const,
};

function useInvalidate() {
  const queryClient = useQueryClient();
  return (key: readonly unknown[]) => queryClient.invalidateQueries({ queryKey: key });
}

// Member types.

export function useLibraryMemberTypesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.memberTypes(),
    queryFn: () => client.GET("/v1/library/member-types"),
  });
}

export function useCreateLibraryMemberTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: LibraryMemberTypeWrite) => client.POST("/v1/library/member-types", { body }),
    onSuccess: () => invalidate(keys.memberTypes()),
  });
}

export function useUpdateLibraryMemberTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ memberTypeId, ...body }: LibraryMemberTypeWrite & { memberTypeId: string }) =>
      client.PUT("/v1/library/member-types/{memberTypeId}", {
        params: { path: { memberTypeId } },
        body,
      }),
    onSuccess: () => invalidate(keys.memberTypes()),
  });
}

export function useDeleteLibraryMemberTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (memberTypeId: string) =>
      client.DELETE("/v1/library/member-types/{memberTypeId}", {
        params: { path: { memberTypeId } },
      }),
    onSuccess: () => invalidate(keys.memberTypes()),
  });
}

// Members.

export function useLibraryMembersQuery(params: {
  status?: LibraryMemberStatus | "";
  memberTypeId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const client = useApiClient();
  const status = params.status === "" ? undefined : params.status;
  const memberTypeId = params.memberTypeId === "" ? undefined : params.memberTypeId;
  const search = params.search === "" ? undefined : params.search;
  return useQuery({
    queryKey: keys.members({
      status,
      memberTypeId,
      search: `${params.limit}:${params.offset}:${search ?? ""}`,
    }),
    queryFn: () =>
      client.GET("/v1/library/members", {
        params: {
          query: {
            status,
            member_type_id: memberTypeId,
            search,
            limit: params.limit,
            offset: params.offset,
          },
        },
      }),
  });
}

export function useLibraryMemberQuery(userId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.member(userId),
    queryFn: () => client.GET("/v1/library/members/{userId}", { params: { path: { userId } } }),
    enabled: Boolean(userId),
  });
}

function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["library", "members"] });
}

export function useRegisterLibraryMemberMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (body: LibraryMemberRegister) => client.POST("/v1/library/members", { body }),
    onSuccess: invalidate,
  });
}

export function useBulkRegisterLibraryMembersMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (body: {
      member_type_id: string;
      role: "student" | "teacher" | "staff" | "parent";
      class_id?: string;
    }) => client.POST("/v1/library/members/bulk-register", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateLibraryMemberMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({
      userId,
      ...body
    }: {
      userId: string;
      member_type_id: string;
      valid_until?: string;
      notes?: string;
    }) =>
      client.PUT("/v1/library/members/{userId}", {
        params: { path: { userId } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateLibraryMemberStatusMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: LibraryMemberStatus }) =>
      client.PUT("/v1/library/members/{userId}/status", {
        params: { path: { userId } },
        body: { status },
      }),
    onSuccess: invalidate,
  });
}

export function useClearLibraryMemberMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (userId: string) =>
      client.POST("/v1/library/members/{userId}/clearance", { params: { path: { userId } } }),
    onSuccess: invalidate,
  });
}

// Printed documents: the API returns raw PDF bytes, so a plain `fetch` is
// used instead of the JSON-typed client (see api.ts's own `downloadPDF`).

async function downloadPDF(path: string, fileName: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new ApiError({ status: response.status, code: "UNKNOWN", message: "UNKNOWN" });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function printLibraryClearanceLetter(userId: string): Promise<void> {
  return downloadPDF(
    `/v1/library/members/${encodeURIComponent(userId)}/clearance-letter`,
    `surat-bebas-pustaka-${userId}.pdf`,
  );
}
