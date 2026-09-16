"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryClassLoanPreview = components["schemas"]["LibraryClassLoanPreview"];
export type LibraryClassLoanPair = components["schemas"]["LibraryClassLoanPair"];
export type LibraryClassLoanRejected = components["schemas"]["LibraryClassLoanRejected"];
export type LibraryBatchBorrowResult = components["schemas"]["LibraryBatchBorrowResult"];

function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["library"] });
}

/** Auto-pairs a class roster against one textbook title's available copies, without committing. */
export function usePreviewClassLoansMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: { class_id: string; title_id: string }) =>
      client.POST("/v1/library/class-loans/preview", { body }),
  });
}

/** Commits a confirmed set of student/copy pairs as loans (from the preview, or built by scanning). */
export function useCommitClassLoansMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { pairs: { student_user_id: string; barcode: string }[] }) =>
      client.POST("/v1/library/class-loans", { body }),
    onSuccess: invalidate,
  });
}

/** Returns every roster student's active loan of one title in one pass, for end-of-year handback. */
export function useCommitClassReturnsMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { class_id: string; title_id: string }) =>
      client.POST("/v1/library/class-returns", { body }),
    onSuccess: invalidate,
  });
}
