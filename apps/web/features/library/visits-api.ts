"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryVisit = components["schemas"]["LibraryVisit"];
export type LibraryVisitWrite = components["schemas"]["LibraryVisitWrite"];
export type LibraryVisitKind = components["schemas"]["LibraryVisitKind"];
export type LibraryVisitSummary = components["schemas"]["LibraryVisitSummary"];
export type LibraryKioskToken = components["schemas"]["LibraryKioskToken"];
export type LibraryReadInPlace = components["schemas"]["LibraryReadInPlace"];

/**
 * The guest book for the calendar days `from`..`to` ("YYYY-MM-DD",
 * inclusive); the API reads them in the school's time zone.
 */
export function useLibraryVisitsQuery(
  from: string,
  to: string,
  page: { limit: number; offset: number },
) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "visits", from, to, page.limit, page.offset],
    queryFn: () =>
      client.GET("/v1/library/visits", {
        params: { query: { from, to, limit: page.limit, offset: page.offset } },
      }),
    enabled: Boolean(from && to),
  });
}

export function useLibraryVisitSummaryQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "visits", "today"],
    queryFn: () => client.GET("/v1/library/visits/today"),
  });
}

/**
 * Every cached figure a new visit changes: the guest book itself, the
 * reports that count visits (the visits report and the accreditation
 * summary, both under ["library", "reports"]) and the dashboard's visits
 * tile. Without the last two a report opened again within the cache's
 * stale time kept showing the count from before the visit.
 */
const VISIT_COUNT_QUERY_KEYS = [
  ["library", "visits"],
  ["library", "reports"],
  ["library", "dashboard"],
] as const;

function useInvalidateVisitCounts() {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of VISIT_COUNT_QUERY_KEYS) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

export function useRecordLibraryVisitMutation() {
  const client = useApiClient();
  const invalidateVisitCounts = useInvalidateVisitCounts();
  return useMutation({
    mutationFn: (body: LibraryVisitWrite) => client.POST("/v1/library/visits", { body }),
    onSuccess: invalidateVisitCounts,
  });
}

/** Mints a short-lived kiosk check-in token; the kiosk screen re-issues one each time its own expires. */
export function useIssueLibraryKioskTokenMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/library/visits/kiosk-token"),
  });
}

/** The visitor's own device submits the kiosk token it just scanned; logs a visit for the signed-in user. */
export function useScanLibraryKioskVisitMutation() {
  const client = useApiClient();
  const invalidateVisitCounts = useInvalidateVisitCounts();
  return useMutation({
    mutationFn: (body: { token: string }) => client.POST("/v1/library/visits/kiosk-scan", { body }),
    onSuccess: invalidateVisitCounts,

    meta: { errorToast: false },
  });
}

export function useLibraryReadInPlaceQuery(copyId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "copies", copyId, "read-in-place"],
    queryFn: () =>
      client.GET("/v1/library/copies/{copyId}/read-in-place", { params: { path: { copyId } } }),
    enabled: Boolean(copyId),
  });
}

export function useStartLibraryReadInPlaceMutation(copyId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { member_user_id?: string; visitor_name?: string }) =>
      client.POST("/v1/library/copies/{copyId}/read-in-place", {
        params: { path: { copyId } },
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["library", "copies", copyId, "read-in-place"],
      });
    },

    meta: { errorToast: false },
  });
}

/** Ends one read-in-place session now; the copy's log refreshes. */
export function useEndLibraryReadInPlaceMutation(copyId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readInPlaceId: string) =>
      client.POST("/v1/library/read-in-place/{readInPlaceId}/end", {
        params: { path: { readInPlaceId } },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["library", "copies", copyId, "read-in-place"],
      });
    },

    meta: { errorToast: false },
  });
}
