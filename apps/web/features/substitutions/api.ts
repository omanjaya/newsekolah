"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type Substitution = components["schemas"]["Substitution"];
export type SubstitutionCreate = components["schemas"]["SubstitutionCreateRequest"];
export type SubstituteCandidate = components["schemas"]["SubstituteCandidate"];
export type Direction = "incoming" | "outgoing";

export function useSubstitutionsQuery(direction: Direction) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.substitutions(direction),
    queryFn: () => client.GET("/v1/substitutions", { params: { query: { direction } } }),
  });
}

/**
 * GET /v1/substitutions/eligible-substitutes: active teachers this year
 * who can stand in, excluding the caller, matched by `search`. Backs the
 * request form's substitute picker instead of the full teacher directory,
 * so a school with a large staff sees only who is actually eligible.
 */
export function useEligibleSubstitutesQuery(
  academicYearId: string,
  search: string,
  enabled = true,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["substitutions", "eligible", academicYearId, search] as const,
    queryFn: () =>
      client.GET("/v1/substitutions/eligible-substitutes", {
        params: { query: { academic_year_id: academicYearId, search: search || undefined } },
      }),
    enabled: enabled && academicYearId !== "",
  });
}

function useInvalidateSubstitutions() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["substitutions"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
  };
}

export function useCreateSubstitutionMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSubstitutions();
  return useMutation({
    mutationFn: (body: SubstitutionCreate) => client.POST("/v1/substitutions", { body }),
    onSuccess: invalidate,
  });
}

export function useRespondSubstitutionMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSubstitutions();
  return useMutation({
    mutationFn: ({ id, accept, note }: { id: string; accept: boolean; note?: string }) =>
      client.POST("/v1/substitutions/{substitutionId}/respond", {
        params: { path: { substitutionId: id } },
        body: { accept, ...(note ? { note } : {}) },
      }),
    onSuccess: invalidate,
  });
}

export function useCancelSubstitutionMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSubstitutions();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/substitutions/{substitutionId}/cancel", {
        params: { path: { substitutionId: id } },
      }),
    onSuccess: invalidate,
  });
}
