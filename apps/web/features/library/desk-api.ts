"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryLookupResult = components["schemas"]["LibraryLookupResult"];
export type LibraryBatchBorrowResult = components["schemas"]["LibraryBatchBorrowResult"];
export type LibraryOverdueLoanDetail = components["schemas"]["LibraryOverdueLoanDetail"];
export type LibraryCopy = components["schemas"]["LibraryCopy"];

function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["library"] });
}

/**
 * Circulation-desk typeahead over members and copies at once (name, member
 * number, NIS, username, barcode, title): the endpoint that replaces
 * pasting a member UUID to lend a book.
 */
export function useLibraryLookupQuery(query: string) {
  const client = useApiClient();
  const q = query.trim();
  return useQuery({
    queryKey: ["library", "lookup", q],
    queryFn: () => client.GET("/v1/library/lookup", { params: { query: { q } } }),
    enabled: q.length >= 2,
  });
}

/** Resolves one scanned barcode to its copy, to preview a title before borrowing or returning it. */
export function useFindLibraryCopyByCodeMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (code: string) =>
      client.GET("/v1/library/copies/find", { params: { query: { code } } }),
  });
}

/** Borrows several scanned barcodes for one member in a single visit. */
export function useBatchBorrowLoansMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { barcodes: string[]; member_user_id: string }) =>
      client.POST("/v1/library/loans/batch-borrow", { body: { ...body, channel: "desk" } }),
    onSuccess: invalidate,
  });
}

/** Returns a copy by its barcode, without needing the loan id. */
export function useReturnLoanByBarcodeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { barcode: string; condition?: LibraryCopy["condition"] }) =>
      client.POST("/v1/library/loans/return-by-barcode", { body }),
    onSuccess: invalidate,
  });
}

/** Overdue loans with the borrower's class and guardian phone, for the desk's follow-up list. */
export function useOverdueLoansDetailedQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "loans", "overdue-detailed"],
    queryFn: () => client.GET("/v1/library/loans/overdue-detailed"),
  });
}

/** Runs the due-date reminder pass now, for every loan due within the tenant's due_reminder_days. */
export function useSendLibraryDueRemindersMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/library/reminders/send"),
  });
}
