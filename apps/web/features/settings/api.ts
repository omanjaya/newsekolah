"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

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

// Report header (kop laporan): shown on every exported report, alongside
// branding. GET/PUT go through the typed client like branding above;
// the preview is a binary document (PDF/XLSX), so it uses the same
// authenticated raw-fetch-to-blob pattern as features/reports/api.ts's
// downloadReportExport -- the typed client always parses JSON and cannot
// return a blob.

export type ReportHeader = components["schemas"]["ReportHeader"];
export type ReportHeaderWrite = components["schemas"]["ReportHeaderWrite"];
export type ReportHeaderSigner = components["schemas"]["ReportHeaderSigner"];
// Alias kept for ReportHeaderView, written against the pre-codegen stand-in.
export type ReportHeaderSettings = ReportHeader;

const REPORT_HEADER_KEY = ["settings", "report-header"] as const;

export function useReportHeaderQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: REPORT_HEADER_KEY,
    queryFn: () => client.GET("/v1/tenant/report-header"),
  });
}

export function useUpdateReportHeaderMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReportHeaderWrite) => client.PUT("/v1/tenant/report-header", { body }),
    onSuccess: (data) => {
      queryClient.setQueryData(REPORT_HEADER_KEY, data);
    },
  });
}

async function reportHeaderPreviewErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "code" in body && typeof body.code === "string") {
      return body.code;
    }
  } catch {
    // Not JSON (or empty); fall through to the generic code.
  }
  return "UNKNOWN";
}

/**
 * Fetches a sample document (rendered from the tenant's current report
 * header settings) as an object URL for a preview `<iframe>`/`<object>` or
 * a "view in a new tab" link. Callers must revoke the returned URL with
 * `URL.revokeObjectURL` when it is no longer shown.
 */
export async function fetchReportHeaderPreviewURL(format: "pdf" | "xlsx"): Promise<string> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}/v1/tenant/report-header/preview?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const code = await reportHeaderPreviewErrorCode(response);
    throw new ApiError({ status: response.status, code, message: code });
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
