"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type AuthSettings = components["schemas"]["AuthSettings"];
export type AuthSettingsWrite = components["schemas"]["AuthSettingsWrite"];
export type TenantBranding = components["schemas"]["TenantBranding"];
export type BrandingWrite = components["schemas"]["BrandingWrite"];
export type AssetUploadTarget = components["schemas"]["AssetUploadTarget"];

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

// Branding: name, short name, tagline, accent color, logo and favicon.
// GET /v1/tenant/branding itself is read through the shared
// `useTenantBranding` hook (packages/api-client/src/hooks) so this screen
// shares one cache entry with TenantProvider, which injects --color-accent
// and the page title from the same data.

function useInvalidateBranding() {
  const queryClient = useQueryClient();
  return (data: TenantBranding) => {
    queryClient.setQueryData(queryKeys.tenantBranding(), data);
  };
}

export function useUpdateBrandingMutation() {
  const client = useApiClient();
  const setBranding = useInvalidateBranding();
  return useMutation({
    mutationFn: (body: BrandingWrite) => client.PUT("/v1/tenant/branding", { body }),
    onSuccess: setBranding,
  });
}

export function useRequestLogoUploadMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/tenant/branding/logo/upload-url"),
  });
}

export function useConfirmLogoUploadMutation() {
  const client = useApiClient();
  const setBranding = useInvalidateBranding();
  return useMutation({
    mutationFn: (objectKey: string) =>
      client.POST("/v1/tenant/branding/logo/confirm", { body: { object_key: objectKey } }),
    onSuccess: setBranding,
  });
}

export function useRequestFaviconUploadMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/tenant/branding/favicon/upload-url"),
  });
}

export function useConfirmFaviconUploadMutation() {
  const client = useApiClient();
  const setBranding = useInvalidateBranding();
  return useMutation({
    mutationFn: (objectKey: string) =>
      client.POST("/v1/tenant/branding/favicon/confirm", { body: { object_key: objectKey } }),
    onSuccess: setBranding,
  });
}
