"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type AdminRole = components["schemas"]["AdminRole"];

export function usePermissionsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: () => client.GET("/v1/permissions"),
  });
}

export function useRolesQuery() {
  const client = useApiClient();
  return useQuery({ queryKey: queryKeys.roles(), queryFn: () => client.GET("/v1/roles") });
}

function useInvalidateRoles() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.roles() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
  };
}

export function useCreateRoleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (body: components["schemas"]["RoleWrite"]) => client.POST("/v1/roles", { body }),
    onSuccess: invalidate,
  });
}

export function useReplaceRolePermissionsMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) =>
      client.PUT("/v1/roles/{roleId}/permissions", {
        params: { path: { roleId: id } },
        body: { permissions },
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteRoleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/roles/{roleId}", { params: { path: { roleId: id } } }),
    onSuccess: invalidate,
  });
}
