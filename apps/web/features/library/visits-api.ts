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

export function useLibraryVisitsQuery(from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "visits", from, to],
    queryFn: () => client.GET("/v1/library/visits", { params: { query: { from, to } } }),
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

export function useRecordLibraryVisitMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryVisitWrite) => client.POST("/v1/library/visits", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["library", "visits"] });
    },
  });
}

/** Mints a short-lived kiosk check-in token; the kiosk screen re-issues one each time its own expires. */
export function useIssueLibraryKioskTokenMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/library/visits/kiosk-token"),
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
