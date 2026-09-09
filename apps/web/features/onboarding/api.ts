"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type SetupChecklist = components["schemas"]["SetupChecklist"];
export type SetupStep = components["schemas"]["SetupStep"];
export type SchoolProfileWrite = components["schemas"]["SchoolProfileWrite"];
export type TenantBranding = components["schemas"]["TenantBranding"];
export type GradeLevelTemplate = components["schemas"]["GradeLevelTemplate"];
export type LevelTemplateSummary = components["schemas"]["LevelTemplateSummary"];
export type LevelTemplateReport = components["schemas"]["LevelTemplateReport"];
export type LevelTemplateSummaryKey = LevelTemplateSummary["key"];
export type DapodikImportReport = components["schemas"]["DapodikImportReport"];
export type DapodikImportRow = components["schemas"]["DapodikImportRow"];
export type SeedSampleDataReport = components["schemas"]["SeedSampleDataReport"];

/**
 * Query keys are kept local to this feature (not added to the shared
 * `packages/api-client/src/query-keys.ts` registry) since nothing else in
 * the app reads the setup checklist.
 */
const onboardingKeys = {
  checklist: () => ["onboarding", "checklist"] as const,
  branding: () => ["onboarding", "branding"] as const,
  levelTemplates: () => ["onboarding", "level-templates"] as const,
};

export function useSetupChecklistQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: onboardingKeys.checklist(),
    queryFn: () => client.GET("/v1/tenant/setup"),
  });
}

export function useTenantBrandingQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: onboardingKeys.branding(),
    queryFn: () => client.GET("/v1/tenant/branding"),
  });
}

export function useUpdateSchoolProfileMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SchoolProfileWrite) => client.PUT("/v1/tenant/profile", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.checklist() });
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.branding() });
    },
  });
}

export function useLevelTemplatesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: onboardingKeys.levelTemplates(),
    queryFn: () => client.GET("/v1/tenant/onboarding/level-templates"),
  });
}

/** Full level template (grade levels, subjects, and bell schedule), used by the onboarding wizard's first step. */
export function useApplyFullLevelTemplateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (template: LevelTemplateSummaryKey) =>
      client.POST("/v1/tenant/onboarding/level-templates/apply", { body: { template } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.checklist() });
    },
  });
}

export function useSeedSampleDataMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/tenant/onboarding/seed-sample-data"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.checklist() });
    },
  });
}
