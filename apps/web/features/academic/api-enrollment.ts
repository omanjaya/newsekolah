"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

import { type ImportRowResult, uploadEnrollmentWorkbook } from "./lib/enrollment-import";

export type { ImportRowResult };
export type MoveStudentInput = components["schemas"]["MoveStudentInput"];
export type NewYearSetupPlan = components["schemas"]["NewYearSetupPlan"];
export type NewYearSetupResult = components["schemas"]["NewYearSetupResult"];
export type Period = components["schemas"]["Period"];

// Enrollment import: preview and commit both post the same workbook, so the
// caller keeps the `File` in state between the two steps.

export function useEnrollmentImportMutation(step: "preview" | "commit") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      academicYearId,
      file,
      moveExisting,
      partial,
    }: {
      academicYearId: string;
      file: File;
      moveExisting?: boolean;
      partial?: boolean;
    }) => uploadEnrollmentWorkbook(step, academicYearId, file, { moveExisting, partial }),
    onSuccess: () => {
      if (step === "commit") {
        void queryClient.invalidateQueries({ queryKey: ["academic"] });
      }
    },
  });
}

// New academic year setup: copies subject offerings and classes from one
// year into another that does not have them yet.

export function usePreviewNewYearSetupMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: { from_year_id: string; to_year_id: string }) =>
      client.POST("/v1/academic/new-year-setup/preview", { body }),
  });
}

export function useCommitNewYearSetupMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { from_year_id: string; to_year_id: string }) =>
      client.POST("/v1/academic/new-year-setup/commit", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["academic"] });
    },
  });
}

// The period in session right now, for the academic year given.

export function usePeriodTodayQuery(academicYearId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["academic", "periods-today", academicYearId],
    queryFn: () =>
      client.GET("/v1/academic/periods/today", {
        params: { query: { academic_year_id: academicYearId } },
      }),
    enabled: academicYearId !== "",
    retry: false,
    // Recomputed frequently: "the period in session" changes every lesson.
    refetchInterval: 60_000,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
  });
}
