"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type LibraryTitle = components["schemas"]["LibraryTitle"];
export type LibraryTitleWrite = components["schemas"]["LibraryTitleWrite"];
export type LibraryCopy = components["schemas"]["LibraryCopy"];
export type LibraryCopyWrite = components["schemas"]["LibraryCopyWrite"];
export type LibraryLoan = components["schemas"]["LibraryLoan"];
export type LibraryReservation = components["schemas"]["LibraryReservation"];
export type LibraryStocktake = components["schemas"]["LibraryStocktake"];
export type LibraryStocktakeScan = components["schemas"]["LibraryStocktakeScan"];
export type LibraryStocktakeResult = components["schemas"]["LibraryStocktakeResult"];
export type LibraryPolicy = components["schemas"]["LibraryPolicy"];
export type LibraryPolicyWrite = components["schemas"]["LibraryPolicyWrite"];
export type LibraryOverdueMember = components["schemas"]["LibraryOverdueMember"];
export type LibraryMostBorrowedTitle = components["schemas"]["LibraryMostBorrowedTitle"];

/**
 * Query keys local to this feature, all under `["library", ...]` so a
 * single prefix invalidates everything below.
 */
const keys = {
  policy: () => ["library", "policy"] as const,
  titles: (search: string) => ["library", "titles", search] as const,
  title: (id: string) => ["library", "titles", "detail", id] as const,
  copies: (titleId: string) => ["library", "titles", titleId, "copies"] as const,
  reservationQueue: (titleId: string) => ["library", "titles", titleId, "reservations"] as const,
  overdueLoans: () => ["library", "loans", "overdue"] as const,
  memberLoans: (userId: string) => ["library", "members", userId, "loans"] as const,
  memberReservations: (userId: string) => ["library", "members", userId, "reservations"] as const,
  stocktakes: () => ["library", "stocktakes"] as const,
  stocktake: (id: string) => ["library", "stocktakes", "detail", id] as const,
  opac: (search: string) => ["library", "opac", search] as const,
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
  });
}

export function useUpdateLibraryTitleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ titleId, ...body }: LibraryTitleWrite & { titleId: string }) =>
      client.PUT("/v1/library/titles/{titleId}", { params: { path: { titleId } }, body }),
    onSuccess: invalidate,
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
  });
}

export function useRenewLoanMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (loanId: string) =>
      client.POST("/v1/library/loans/{loanId}/renew", { params: { path: { loanId } } }),
    onSuccess: invalidate,
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
  return useQuery({
    queryKey: keys.memberReservations(userId),
    queryFn: () =>
      client.GET("/v1/library/members/{userId}/reservations", { params: { path: { userId } } }),
    enabled: Boolean(userId),
  });
}

// Stocktake.

export function useLibraryStocktakesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.stocktakes(),
    queryFn: () => client.GET("/v1/library/stocktakes"),
  });
}

export function useLibraryStocktakeQuery(stocktakeId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.stocktake(stocktakeId),
    queryFn: () =>
      client.GET("/v1/library/stocktakes/{stocktakeId}", { params: { path: { stocktakeId } } }),
    enabled: Boolean(stocktakeId),
  });
}

export function useStartStocktakeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { name: string; notes?: string }) =>
      client.POST("/v1/library/stocktakes", { body }),
    onSuccess: invalidate,
  });
}

export function useScanStocktakeMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ stocktakeId, barcode }: { stocktakeId: string; barcode: string }) =>
      client.POST("/v1/library/stocktakes/{stocktakeId}/scans", {
        params: { path: { stocktakeId } },
        body: { barcode },
      }),
  });
}

export function useCloseStocktakeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ stocktakeId, notes }: { stocktakeId: string; notes?: string }) =>
      client.POST("/v1/library/stocktakes/{stocktakeId}/close", {
        params: { path: { stocktakeId } },
        body: notes ? { notes } : undefined,
      }),
    onSuccess: invalidate,
  });
}

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

// Printed labels and cards.
//
// The PDF is generated server-side (platform/documents), not in the
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

// Public OPAC.

export function useOpacTitlesQuery(search: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.opac(search),
    queryFn: () =>
      client.GET("/v1/opac/titles", { params: { query: { search: search || undefined } } }),
  });
}
