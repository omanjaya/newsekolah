"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type AcademicYear = components["schemas"]["AcademicYear"];
export type AcademicYearInput = components["schemas"]["AcademicYearInput"];
export type Term = components["schemas"]["Term"];
export type TermInput = components["schemas"]["TermInput"];
export type TermUpdateInput = components["schemas"]["TermUpdateInput"];

const YEARS_KEY = ["academic", "years"] as const;
const TERMS_KEY = (yearId: string) => ["academic", "years", yearId, "terms"] as const;

export interface AcademicYearsFilter {
  search?: string;
  includeArchived?: boolean;
}

export function useAcademicYearsQuery(filter: AcademicYearsFilter = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: [...YEARS_KEY, filter],
    queryFn: () =>
      client.GET("/v1/academic/years", {
        params: {
          query: {
            page_size: 100,
            ...(filter.search ? { search: filter.search } : {}),
            ...(filter.includeArchived ? { include_archived: true } : {}),
          },
        },
      }),
  });
}

function useInvalidateYears() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: YEARS_KEY });
}

export function useCreateAcademicYearMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateYears();
  return useMutation({
    mutationFn: (body: AcademicYearInput) => client.POST("/v1/academic/years", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateAcademicYearMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateYears();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AcademicYearInput }) =>
      client.PUT("/v1/academic/years/{yearId}", { params: { path: { yearId: id } }, body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useActivateAcademicYearMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateYears();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/academic/years/{yearId}/activate", { params: { path: { yearId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useArchiveAcademicYearMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateYears();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/academic/years/{yearId}/archive", { params: { path: { yearId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Terms.

export function useTermsQuery(yearId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: TERMS_KEY(yearId),
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}/terms", { params: { path: { yearId } } }),
    enabled: yearId !== "",
  });
}

function useInvalidateTerms(yearId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: TERMS_KEY(yearId) });
}

export function useCreateTermMutation(yearId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateTerms(yearId);
  return useMutation({
    mutationFn: (body: TermInput) =>
      client.POST("/v1/academic/years/{yearId}/terms", { params: { path: { yearId } }, body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateTermMutation(yearId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateTerms(yearId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TermUpdateInput }) =>
      client.PUT("/v1/academic/terms/{termId}", { params: { path: { termId: id } }, body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteTermMutation(yearId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateTerms(yearId);
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/terms/{termId}", { params: { path: { termId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useActivateTermMutation(yearId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateTerms(yearId);
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/academic/terms/{termId}/activate", { params: { path: { termId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}
