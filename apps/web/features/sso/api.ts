"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type GoogleSSOConfig = components["schemas"]["GoogleSSOConfig"];
export type GoogleSSOConfigInput = components["schemas"]["GoogleSSOConfigInput"];

const keys = {
  googleConfig: () => ["settings", "sso", "google"] as const,
};

/** GET /v1/settings/sso/google (manage_settings). */
export function useGoogleSSOConfigQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.googleConfig(),
    queryFn: () => client.GET("/v1/settings/sso/google"),
  });
}

/** PUT /v1/settings/sso/google: create or replace the configuration. */
export function useSaveGoogleSSOConfigMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GoogleSSOConfigInput) => client.PUT("/v1/settings/sso/google", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.googleConfig() });
    },
  });
}

/** DELETE /v1/settings/sso/google. */
export function useRemoveGoogleSSOConfigMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.DELETE("/v1/settings/sso/google"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.googleConfig() });
    },
  });
}
