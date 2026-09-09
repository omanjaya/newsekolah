"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type SetupChecklist = components["schemas"]["SetupChecklist"];
export type SetupStep = components["schemas"]["SetupStep"];
export type SchoolProfileWrite = components["schemas"]["SchoolProfileWrite"];
export type TenantBranding = components["schemas"]["TenantBranding"];
export type GradeLevelTemplate = components["schemas"]["GradeLevelTemplate"];

/**
 * Query keys are kept local to this feature (not added to the shared
 * `packages/api-client/src/query-keys.ts` registry) since nothing else in
 * the app reads the setup checklist.
 */
const onboardingKeys = {
  checklist: () => ["onboarding", "checklist"] as const,
  branding: () => ["onboarding", "branding"] as const,
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

export function useApplyGradeLevelTemplateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (template: GradeLevelTemplate) =>
      client.POST("/v1/academic/grade-levels/apply-template", { body: { template } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.checklist() });
    },
  });
}
