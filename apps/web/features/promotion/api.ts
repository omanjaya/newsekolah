"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useApiClient } from "../../lib/api/client";

export type AcademicYear = components["schemas"]["AcademicYear"];
export type PromotionPlanItem = components["schemas"]["PromotionPlanItem"];
export type PromotionAction = components["schemas"]["PromotionAction"];
export type PromotionOverride = components["schemas"]["PromotionOverride"];

export function useAcademicYearsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["academic", "years"],
    queryFn: () => client.GET("/v1/academic/years", { params: { query: { page_size: 100 } } }),
  });
}

export function usePreviewPromotionMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: {
      from_year_id: string;
      to_year_id: string;
      overrides?: PromotionOverride[];
    }) => client.POST("/v1/academic/promotion/preview", { body }),
  });
}

export function useCommitPromotionMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      from_year_id: string;
      to_year_id: string;
      overrides?: PromotionOverride[];
      effective_on: string;
    }) => client.POST("/v1/academic/promotion/commit", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["academic"] });
    },
  });
}

/**
 * One student's display name, fetched lazily per row (there is no batch
 * directory lookup in this module's own API surface -- a shared one is
 * planned under features/reference). Falls back to the id itself if the
 * fetch fails, e.g. the caller holds manage_enrollments but not
 * view_users, so the roster stays usable either way.
 */
export function useStudentNameQuery(studentUserId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["users", studentUserId],
    queryFn: () =>
      client.GET("/v1/users/{userId}", { params: { path: { userId: studentUserId } } }),
    enabled: studentUserId !== "",
    retry: false,
  });
}

export function useClassesForYearQuery(yearId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["academic", "classes", yearId],
    queryFn: () =>
      client.GET("/v1/academic/classes", {
        params: { query: { academic_year_id: yearId, page_size: 200 } },
      }),
    enabled: yearId !== "",
  });
}

/**
 * Builds an id -> item lookup from a list, memoized on the list identity.
 * A shared `useLookup` is planned under features/reference once that
 * module lands (see apps/web/features/school/components/class-panels.tsx
 * for the convention); this local copy avoids taking a dependency on a
 * module that does not exist yet.
 */
export function useIdNameMap<T extends { id: string }>(items: T[] | undefined): Map<string, T> {
  return useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);
}
