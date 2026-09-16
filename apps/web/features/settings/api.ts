"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type AuthSettings = components["schemas"]["AuthSettings"];
export type AuthSettingsWrite = components["schemas"]["AuthSettingsWrite"];

/** GET /v1/auth/settings: per-tenant session lifetime and single-device login. */
export function useAuthSettingsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.authSettings(),
    queryFn: () => client.GET("/v1/auth/settings"),
  });
}

export function useUpdateAuthSettingsMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AuthSettingsWrite) => client.PUT("/v1/auth/settings", { body }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.authSettings(), data);
    },
  });
}
