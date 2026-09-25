"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryLoanRule = components["schemas"]["LibraryLoanRule"];
export type LibraryLoanRuleWrite = components["schemas"]["LibraryLoanRuleWrite"];

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["library", "loan-rules"] });
}

export function useLibraryLoanRulesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "loan-rules"],
    queryFn: () => client.GET("/v1/library/loan-rules"),
  });
}

export function useCreateLibraryLoanRuleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: LibraryLoanRuleWrite) => client.POST("/v1/library/loan-rules", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteLibraryLoanRuleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (loanRuleId: string) =>
      client.DELETE("/v1/library/loan-rules/{loanRuleId}", { params: { path: { loanRuleId } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}
