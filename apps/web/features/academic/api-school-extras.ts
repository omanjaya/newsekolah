"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type PeriodTemplateInput = components["schemas"]["PeriodTemplateInput"];
export type MoveStudentInput = components["schemas"]["MoveStudentInput"];
export type RemoveStudentInput = components["schemas"]["RemoveStudentInput"];

/**
 * Mutations for two controls this slice adds to screens that already live
 * in `features/school`: renaming/deleting a period template (periods-view)
 * and moving a student to another class (class-panels' enrollment list).
 * Kept here rather than growing `features/school/api.ts`, which is already
 * at the 400-line file cap.
 */

export function useUpdatePeriodTemplateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PeriodTemplateInput }) =>
      client.PUT("/v1/academic/period-templates/{templateId}", {
        params: { path: { templateId: id } },
        body,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academic"] }),

    meta: { errorToast: false },
  });
}

export function useDeletePeriodTemplateMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/period-templates/{templateId}", {
        params: { path: { templateId: id } },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academic"] }),

    meta: { errorToast: false },
  });
}

export function useMoveStudentMutation(classId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, body }: { enrollmentId: string; body: MoveStudentInput }) =>
      client.POST("/v1/academic/enrollments/{enrollmentId}/move", {
        params: { path: { enrollmentId } },
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.enrollments(classId) });
      void queryClient.invalidateQueries({ queryKey: ["academic", "unassigned"] });
    },

    meta: { errorToast: false },
  });
}

/** Closes the enrollment as "left the school" mid-year, distinct from moving to another class. */
export function useRemoveStudentMutation(classId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, body }: { enrollmentId: string; body: RemoveStudentInput }) =>
      client.POST("/v1/academic/enrollments/{enrollmentId}/leave", {
        params: { path: { enrollmentId } },
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.enrollments(classId) });
      void queryClient.invalidateQueries({ queryKey: ["academic", "unassigned"] });
    },

    meta: { errorToast: false },
  });
}

/** Soft-deletes an empty class; the server rejects dependent enrollments/assignments. */
export function useDeleteClassMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (classId: string) =>
      client.DELETE("/v1/academic/classes/{classId}", { params: { path: { classId } } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["academic"] }),

    meta: { errorToast: false },
  });
}
