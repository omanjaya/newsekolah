"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type PlatformTenant = components["schemas"]["PlatformTenant"];
export type PlatformTenantHealth = components["schemas"]["PlatformTenantHealth"];
export type PlatformTenantDetail = components["schemas"]["PlatformTenantDetail"];
export type PlatformTenantCreate = components["schemas"]["PlatformTenantCreate"];
export type PlatformTenantCreated = components["schemas"]["PlatformTenantCreated"];
export type PlatformModule = components["schemas"]["PlatformModule"];
export type PlatformTenancyMode = components["schemas"]["PlatformTenancyMode"];
export type PlatformModuleFlag = components["schemas"]["PlatformModuleFlag"];
export type PlatformExport = components["schemas"]["PlatformExport"];
export type PlatformEducationLevel = components["schemas"]["PlatformEducationLevel"];
export type PlatformOperatorAlertSettings = components["schemas"]["PlatformOperatorAlertSettings"];
export type PlatformOperatorAlertSettingsUpdate =
  components["schemas"]["PlatformOperatorAlertSettingsUpdate"];
export type PlatformOperatorAlertChatCandidate =
  components["schemas"]["PlatformOperatorAlertChatCandidate"];
export type PlatformOperatorAlertTestResult =
  components["schemas"]["PlatformOperatorAlertTestResult"];

/**
 * Query keys local to this feature (not added to the shared
 * `packages/api-client` registry) all under `["platform", ...]` so a
 * single prefix invalidates everything below.
 */
const keys = {
  tenants: () => ["platform", "tenants"] as const,
  tenant: (id: string) => ["platform", "tenants", id] as const,
  flags: (tenantId: string) => ["platform", "tenants", tenantId, "flags"] as const,
  export: (tenantId: string, exportId: string) =>
    ["platform", "tenants", tenantId, "exports", exportId] as const,
  operatorAlerts: () => ["platform", "operator-alerts"] as const,
};

function useInvalidatePlatform() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["platform"] });
}

/**
 * Every tenant with its health summary, plus `tenancy_mode`: in "single"
 * mode the API manages the one school's details and module flags but
 * refuses provisioning, suspend/resume, custom domains and exports.
 */
export function useTenantsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.tenants(),
    queryFn: () => client.GET("/v1/platform/tenants"),
  });
}

/** Pass an empty string for tenantId while no tenant is selected yet. */
export function useTenantDetailQuery(tenantId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.tenant(tenantId),
    queryFn: () =>
      client.GET("/v1/platform/tenants/{tenantId}", { params: { path: { tenantId } } }),
    enabled: tenantId !== "",
  });
}

export function useCreateTenantMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: (body: PlatformTenantCreate) => client.POST("/v1/platform/tenants", { body }),
    onSuccess: invalidate,
  });
}

export function useSuspendTenantMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: (tenantId: string) =>
      client.POST("/v1/platform/tenants/{tenantId}/suspend", { params: { path: { tenantId } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useResumeTenantMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: (tenantId: string) =>
      client.POST("/v1/platform/tenants/{tenantId}/resume", { params: { path: { tenantId } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateTenantDomainMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: ({ tenantId, domain }: { tenantId: string; domain: string }) =>
      client.PUT("/v1/platform/tenants/{tenantId}/domain", {
        params: { path: { tenantId } },
        body: { domain },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/** Pass an empty string for tenantId while no tenant is selected yet. */
export function useTenantFlagsQuery(tenantId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.flags(tenantId),
    queryFn: () =>
      client.GET("/v1/platform/tenants/{tenantId}/flags", { params: { path: { tenantId } } }),
    enabled: tenantId !== "",
  });
}

/**
 * The query-key prefix of every `queryKeys.tenantBranding(slug)` entry, so
 * one invalidation covers the branding of any tenant slug.
 */
const TENANT_BRANDING_PREFIX = queryKeys.tenantBranding().slice(0, 2);

/**
 * Switches one module of one tenant. Use one instance per module row: the
 * per-call `mutate` callbacks of a shared instance only run for the latest
 * call, so a second toggle would swallow the first one's result.
 *
 * On success it refreshes, besides the console's own queries, the session
 * (`Me.disabled_modules`, read by the sidebar and the route gate) and the
 * public branding (`disabled_public_modules`, read by the OPAC gate): in
 * single-tenant mode the toggled school is always the superadmin's own, and
 * without this the change only shows after the session goes stale or a
 * request is refused with MODULE_DISABLED. The mutation stays pending until
 * those refetches finish, so the switch and the shell settle together.
 */
export function useSetTenantFlagMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tenantId,
      module,
      enabled,
    }: {
      tenantId: string;
      module: PlatformModule;
      enabled: boolean;
    }) =>
      client.PUT("/v1/platform/tenants/{tenantId}/flags/{module}", {
        params: { path: { tenantId, module } },
        body: { enabled },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me() }),
        queryClient.invalidateQueries({ queryKey: TENANT_BRANDING_PREFIX }),
      ]);
    },

    meta: { errorToast: false },
  });
}

export function useRequestExportMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (tenantId: string) =>
      client.POST("/v1/platform/tenants/{tenantId}/exports", { params: { path: { tenantId } } }),

    meta: { errorToast: false },
  });
}

/**
 * Polls every 2s while the export is still pending or running, and stops
 * once it reaches a final state (done or failed). Pass an empty string for
 * exportId while no export has been requested yet.
 */
export function useExportQuery(tenantId: string, exportId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.export(tenantId, exportId),
    queryFn: () =>
      client.GET("/v1/platform/tenants/{tenantId}/exports/{exportId}", {
        params: { path: { tenantId, exportId } },
      }),
    enabled: tenantId !== "" && exportId !== "",
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 2000 : false;
    },
  });
}

export function useOperatorAlertSettingsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.operatorAlerts(),
    queryFn: () => client.GET("/v1/platform/operator-alerts"),
  });
}

export function useUpdateOperatorAlertSettingsMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: (body: PlatformOperatorAlertSettingsUpdate) =>
      client.PUT("/v1/platform/operator-alerts", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/** Pass an empty string to preview candidate chats for the currently stored token. */
export function useDetectOperatorAlertChatMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (telegramToken: string) =>
      client.POST("/v1/platform/operator-alerts/detect-chat", {
        body: telegramToken ? { telegram_token: telegramToken } : {},
      }),

    meta: { errorToast: false },
  });
}

export function useTestOperatorAlertMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (draft: { telegramToken?: string; telegramChatId?: string }) =>
      client.POST("/v1/platform/operator-alerts/test", {
        body: {
          ...(draft.telegramToken ? { telegram_token: draft.telegramToken } : {}),
          ...(draft.telegramChatId ? { telegram_chat_id: draft.telegramChatId } : {}),
        },
      }),

    meta: { errorToast: false },
  });
}
