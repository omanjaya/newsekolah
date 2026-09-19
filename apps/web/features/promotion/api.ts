"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type PromotionPlanItem = components["schemas"]["PromotionPlanItem"];
export type PromotionAction = components["schemas"]["PromotionAction"];
export type PromotionOverride = components["schemas"]["PromotionOverride"];

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
 * Classes of one academic year, keyed the same way as
 * `features/reference/api.ts`'s `useClassesQuery` (which only ever fetches
 * the active year) so the two caches coalesce instead of duplicating a GET
 * when a from/to year happens to be the active one.
 */
export function useClassesForYearQuery(yearId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.classes(yearId),
    queryFn: () =>
      client.GET("/v1/academic/classes", {
        params: { query: { academic_year_id: yearId, page_size: 200 } },
      }),
    enabled: yearId !== "",
  });
}
