"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

import {
  ALL_MEMBER_CODE_FIELDS,
  matchMemberByCode,
  type MemberCodeField,
} from "./lib/member-code-match";

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

/**
 * Resolves one scanned barcode to its copy, to preview a title before
 * borrowing or returning it. Silent on failure: a code that names no copy
 * is an answer, not an error, and every caller reports it in its own way
 * (the desk's "not found" line or failed row, the stocktake's scan feed).
 */
export function useFindLibraryCopyByCodeMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (code: string) =>
      client.GET("/v1/library/copies/find", { params: { query: { code } } }),
    meta: { errorToast: false },
  });
}

/** Resolves one title's display name, for a scan result that only carries a title id. */
export function useLibraryTitleNameMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: async (titleId: string) => {
      const title = await client.GET("/v1/library/titles/{titleId}", {
        params: { path: { titleId } },
      });
      return title.title;
    },
  });
}

/**
 * Resolves a scanned or typed code to a member (the desk's continuous scan
 * flow's member-card step): `/v1/library/lookup` is a fuzzy multi-match
 * search, so only a member whose number, NIS or username equals the code is
 * accepted (see `matchMemberByCode`); anything else is none or ambiguous.
 * The endpoint lists exact matches first, so its cap of 8 never drops the
 * holder of a short code that other members' names merely contain.
 * `fields` narrows which identifiers count (the self-service kiosk accepts
 * only the printed member number).
 */
export function useFindMemberByCodeMutation(
  fields: readonly MemberCodeField[] = ALL_MEMBER_CODE_FIELDS,
) {
  const client = useApiClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const result = await client.GET("/v1/library/lookup", {
        params: { query: { q: code.trim() } },
      });
      const members = result.data.flatMap((entry) => (entry.member ? [entry.member] : []));
      const match = matchMemberByCode(members, code, fields);
      // A book barcode scanned where a card was expected is not unknown:
      // say so, so the desk can ask for the card instead.
      if (match.status === "none" && isCopyBarcode(result.data, code)) {
        return { status: "copy" as const };
      }
      return match;
    },
  });
}

function isCopyBarcode(entries: readonly LibraryLookupResult[], code: string): boolean {
  const wanted = code.trim().toLowerCase();
  return entries.some((entry) => entry.copy?.barcode.trim().toLowerCase() === wanted);
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

/**
 * Returns a copy by its barcode, without needing the loan id. Silent on
 * failure: the desk session reports every refusal itself, as a failed row
 * or its scan line, and a member card scanned here is not a failure at all.
 */
export function useReturnLoanByBarcodeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { barcode: string; condition?: LibraryCopy["condition"] }) =>
      client.POST("/v1/library/loans/return-by-barcode", { body }),
    onSuccess: invalidate,
    meta: { errorToast: false },
  });
}

/**
 * Renews a loan by its copy's barcode, without needing the loan id -- the
 * desk's continuous scan flow. Silent on failure for the same reason as
 * `useReturnLoanByBarcodeMutation`.
 */
export function useRenewLoanByBarcodeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { barcode: string }) =>
      client.POST("/v1/library/loans/renew-by-barcode", { body }),
    onSuccess: invalidate,
    meta: { errorToast: false },
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

    meta: { errorToast: false },
  });
}
