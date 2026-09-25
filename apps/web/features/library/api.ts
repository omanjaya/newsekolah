"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

import { useMemberReservationsLive } from "./realtime";

export type LibraryTitle = components["schemas"]["LibraryTitle"];
export type LibraryTitleWrite = components["schemas"]["LibraryTitleWrite"];
export type LibraryCopy = components["schemas"]["LibraryCopy"];
export type LibraryCopyWrite = components["schemas"]["LibraryCopyWrite"];
export type LibraryCopyStatus = components["schemas"]["LibraryCopyStatus"];
export type LibraryItemEvent = components["schemas"]["LibraryItemEvent"];
export type LibraryLoan = components["schemas"]["LibraryLoan"];
export type LibraryLoanRenewal = components["schemas"]["LibraryLoanRenewal"];
export type LibraryReservation = components["schemas"]["LibraryReservation"];
export type LibraryPolicy = components["schemas"]["LibraryPolicy"];
export type LibraryPolicyWrite = components["schemas"]["LibraryPolicyWrite"];
export type LibraryOverdueMember = components["schemas"]["LibraryOverdueMember"];
export type LibraryMostBorrowedTitle = components["schemas"]["LibraryMostBorrowedTitle"];
export type LibraryOpacTitleDetail = components["schemas"]["LibraryOpacTitleDetail"];

/**
 * Query keys local to this feature, all under `["library", ...]` so a
 * single prefix invalidates everything below.
 */
const keys = {
  policy: () => ["library", "policy"] as const,
  titles: (search: string) => ["library", "titles", search] as const,
  title: (id: string) => ["library", "titles", "detail", id] as const,
  copies: (titleId: string) => ["library", "titles", titleId, "copies"] as const,
  copyEvents: (copyId: string) => ["library", "copies", copyId, "events"] as const,
  reservationQueue: (titleId: string) => ["library", "titles", titleId, "reservations"] as const,
  overdueLoans: () => ["library", "loans", "overdue"] as const,
  loanRenewals: (loanId: string) => ["library", "loans", loanId, "renewals"] as const,
  memberLoans: (userId: string) => ["library", "members", userId, "loans"] as const,
  memberReservations: (userId: string) => ["library", "members", userId, "reservations"] as const,
  opac: (search: string) => ["library", "opac", search] as const,
  opacTitle: (titleId: string) => ["library", "opac", "titles", titleId] as const,
};

function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["library"] });
}

// Policy.

export function useLibraryPolicyQuery() {
  const client = useApiClient();
  return useQuery({ queryKey: keys.policy(), queryFn: () => client.GET("/v1/library/policy") });
}

export function useUpdateLibraryPolicyMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: LibraryPolicyWrite) => client.PUT("/v1/library/policy", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Catalogue.

export function useLibraryTitlesQuery(search: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.titles(search),
    queryFn: () =>
      client.GET("/v1/library/titles", { params: { query: { search: search || undefined } } }),
  });
}

/**
 * Looks up an existing title by ISBN, to warn about a likely duplicate
 * before a new one is created. Separate from the external ISBN lookup
 * (isbn-lookup-api.ts), which fetches bibliographic data from outside
 * sources rather than checking the local catalogue.
 */
export function useLibraryTitleByIsbnQuery(isbn: string) {
  const client = useApiClient();
  const trimmed = isbn.trim();
  return useQuery({
    queryKey: keys.title(`isbn:${trimmed}`),
    queryFn: () =>
      client.GET("/v1/library/titles/lookup", { params: { query: { isbn: trimmed } } }),
    enabled: trimmed.length >= 8,
    retry: false,
  });
}

export function useLibraryTitleQuery(titleId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.title(titleId),
    queryFn: () => client.GET("/v1/library/titles/{titleId}", { params: { path: { titleId } } }),
    enabled: Boolean(titleId),
  });
}

export function useCreateLibraryTitleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: LibraryTitleWrite) => client.POST("/v1/library/titles", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateLibraryTitleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ titleId, ...body }: LibraryTitleWrite & { titleId: string }) =>
      client.PUT("/v1/library/titles/{titleId}", { params: { path: { titleId } }, body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/** Refused (409) while the title still has any copy registered under it. */
export function useDeleteLibraryTitleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (titleId: string) =>
      client.DELETE("/v1/library/titles/{titleId}", { params: { path: { titleId } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useLibraryCopiesQuery(titleId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.copies(titleId),
    queryFn: () =>
      client.GET("/v1/library/titles/{titleId}/copies", { params: { path: { titleId } } }),
    enabled: Boolean(titleId),
  });
}

export function useCreateLibraryCopyMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ titleId, ...body }: LibraryCopyWrite & { titleId: string }) =>
      client.POST("/v1/library/titles/{titleId}/copies", { params: { path: { titleId } }, body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export interface LibraryCopiesBatchWrite {
  count: number;
  category_id?: string;
  location_id?: string;
  source_id?: string;
  partner_id?: string;
  price?: number;
  is_opac?: boolean;
  access?: LibraryCopy["access"];
  condition?: LibraryCopy["condition"];
  notes?: string;
}

/** Adds several copies of the same title at once; every barcode/accession number is auto-generated. */
export function useCreateLibraryCopiesBatchMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ titleId, ...body }: LibraryCopiesBatchWrite & { titleId: string }) =>
      client.POST("/v1/library/titles/{titleId}/copies/batch", {
        params: { path: { titleId } },
        body,
      }),
    onSuccess: invalidate,
  });
}

/** Refused (409) if the copy was ever borrowed; kept for the audit trail instead. */
export function useDeleteLibraryCopyMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (copyId: string) =>
      client.DELETE("/v1/library/copies/{copyId}", { params: { path: { copyId } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/** Manual status change (weeding, damage, repair); refused (409) while the copy is on loan. */
export function useSetLibraryCopyStatusMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({
      copyId,
      ...body
    }: {
      copyId: string;
      status: LibraryCopyStatus;
      condition?: LibraryCopy["condition"];
      note?: string;
    }) => client.PUT("/v1/library/copies/{copyId}/status", { params: { path: { copyId } }, body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/** A copy's audit trail: created, status changes, circulation, stocktake. */
export function useLibraryCopyEventsQuery(copyId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.copyEvents(copyId),
    queryFn: () =>
      client.GET("/v1/library/copies/{copyId}/events", { params: { path: { copyId } } }),
    enabled: enabled && Boolean(copyId),
  });
}

// Loan desk.

export function useBorrowLoanMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { barcode: string; member_user_id: string }) =>
      client.POST("/v1/library/loans/borrow", { body }),
    onSuccess: invalidate,
  });
}

export function useReturnLoanMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ loanId, condition }: { loanId: string; condition?: LibraryCopy["condition"] }) =>
      client.POST("/v1/library/loans/{loanId}/return", {
        params: { path: { loanId } },
        body: condition ? { condition } : undefined,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useMarkLoanLostMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ loanId, replacementCost }: { loanId: string; replacementCost: number }) =>
      client.POST("/v1/library/loans/{loanId}/lost", {
        params: { path: { loanId } },
        body: { replacement_cost: replacementCost },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useRenewLoanMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (loanId: string) =>
      client.POST("/v1/library/loans/{loanId}/renew", { params: { path: { loanId } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/** Renewal history for one loan, newest first as returned by the API. */
export function useLibraryLoanRenewalsQuery(loanId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.loanRenewals(loanId),
    queryFn: () =>
      client.GET("/v1/library/loans/{loanId}/renewals", { params: { path: { loanId } } }),
    enabled: Boolean(loanId),
  });
}

export function useOverdueLoansQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.overdueLoans(),
    queryFn: () => client.GET("/v1/library/loans/overdue"),
  });
}

export function useMemberLoanHistoryQuery(userId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.memberLoans(userId),
    queryFn: () =>
      client.GET("/v1/library/members/{userId}/loans", { params: { path: { userId } } }),
    enabled: Boolean(userId),
  });
}

// Reservations.

export function useCreateReservationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { title_id: string; member_user_id: string }) =>
      client.POST("/v1/library/reservations", { body }),
    onSuccess: invalidate,
  });
}

export function useCancelReservationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (reservationId: string) =>
      client.POST("/v1/library/reservations/{reservationId}/cancel", {
        params: { path: { reservationId } },
      }),
    onSuccess: invalidate,
  });
}

export function useReservationQueueQuery(titleId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.reservationQueue(titleId),
    queryFn: () =>
      client.GET("/v1/library/titles/{titleId}/reservations", { params: { path: { titleId } } }),
    enabled: Boolean(titleId),
  });
}

export function useMemberReservationsQuery(userId: string) {
  const client = useApiClient();
  useMemberReservationsLive(userId);
  return useQuery({
    queryKey: keys.memberReservations(userId),
    queryFn: () =>
      client.GET("/v1/library/members/{userId}/reservations", { params: { path: { userId } } }),
    enabled: Boolean(userId),
  });
}

// Stocktake: see stocktake-api.ts (split out to keep this file under the
// max-lines limit).

// Reports.

export function useOverdueMembersReportQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "reports", "overdue-members"],
    queryFn: () => client.GET("/v1/library/reports/overdue-members"),
  });
}

export function useLoansReportQuery(from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "reports", "loans", from, to],
    queryFn: () => client.GET("/v1/library/reports/loans", { params: { query: { from, to } } }),
    enabled: Boolean(from && to),
  });
}

export function useMostBorrowedReportQuery(from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "reports", "most-borrowed", from, to],
    queryFn: () =>
      client.GET("/v1/library/reports/most-borrowed", { params: { query: { from, to } } }),
    enabled: Boolean(from && to),
  });
}

// Printed documents and spreadsheet exports.
//
// These files are generated server-side (platform/documents), not in the
// browser; the web layer only downloads the finished file. A direct
// `fetch` is used because the shared API client always parses the
// response as JSON.

async function downloadPDF(path: string, fileName: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new ApiError({ status: response.status, code: "UNKNOWN", message: "UNKNOWN" });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function printCopyLabel(copyId: string): Promise<void> {
  return downloadPDF(
    `/v1/library/copies/${encodeURIComponent(copyId)}/label`,
    `label-${copyId}.pdf`,
  );
}

export function printMemberCard(userId: string): Promise<void> {
  return downloadPDF(
    `/v1/library/members/${encodeURIComponent(userId)}/card`,
    `kartu-anggota-${userId}.pdf`,
  );
}

// downloadLoansReportXlsx, downloadOverdueMembersReportXlsx and
// downloadMostBorrowedReportXlsx moved to reports-api.ts (they are
// reportdoc-backed exports and need withReportExportParams, same as
// that file's other report downloads) to keep this file under the lint
// line-count limit.

export function downloadMonthlyLibraryReportPdf(month: string): Promise<void> {
  return downloadPDF(
    `/v1/library/reports/monthly?month=${encodeURIComponent(month)}`,
    `laporan-bulanan-perpustakaan-${month}.pdf`,
  );
}

export function downloadLibraryCatalogueExportXlsx(): Promise<void> {
  return downloadPDF("/v1/library/catalogue/export.xlsx", "katalog-perpustakaan.xlsx");
}

// Public OPAC.

export function useOpacTitlesQuery(search: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.opac(search),
    queryFn: () =>
      client.GET("/v1/opac/titles", { params: { query: { search: search || undefined } } }),
  });
}

/**
 * GET /v1/opac/titles/{titleId}: public title detail with its visible
 * copies (no session required), for the OPAC title detail page.
 */
export function useOpacTitleQuery(titleId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.opacTitle(titleId),
    queryFn: () => client.GET("/v1/opac/titles/{titleId}", { params: { path: { titleId } } }),
    enabled: Boolean(titleId),
  });
}

export type OpacHighlights = components["schemas"]["LibraryOpacHighlights"];

/**
 * GET /v1/opac/highlights: newest and most-borrowed titles for the OPAC
 * landing page, plus the library's own display name. Public (x-public:
 * true, no security requirement), so it loads before any session exists.
 */
export function useOpacHighlightsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "opac", "highlights"] as const,
    queryFn: () => client.GET("/v1/opac/highlights"),
  });
}
