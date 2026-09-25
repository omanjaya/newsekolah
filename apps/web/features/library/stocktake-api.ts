"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type LibraryStocktake = components["schemas"]["LibraryStocktake"];
export type LibraryStocktakeScan = components["schemas"]["LibraryStocktakeScan"];
export type LibraryStocktakeResult = components["schemas"]["LibraryStocktakeResult"];
export type LibraryStocktakeProgress = components["schemas"]["LibraryStocktakeProgress"];

const keys = {
  stocktakes: () => ["library", "stocktakes"] as const,
  stocktake: (id: string) => ["library", "stocktakes", "detail", id] as const,
  stocktakeProgress: (id: string) => ["library", "stocktakes", "detail", id, "progress"] as const,
  stocktakeResults: (id: string) => ["library", "stocktakes", "detail", id, "results"] as const,
};

function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["library"] });
}

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

/** Live expected/scanned/missing/misplaced counters, polled while a session is open. */
export function useLibraryStocktakeProgressQuery(stocktakeId: string, poll: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.stocktakeProgress(stocktakeId),
    queryFn: () =>
      client.GET("/v1/library/stocktakes/{stocktakeId}/progress", {
        params: { path: { stocktakeId } },
      }),
    enabled: Boolean(stocktakeId),
    refetchInterval: poll ? 5000 : false,
  });
}

/** The persisted reconciliation of a closed session (recomputed live for an open one). */
export function useLibraryStocktakeResultsQuery(stocktakeId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.stocktakeResults(stocktakeId),
    queryFn: () =>
      client.GET("/v1/library/stocktakes/{stocktakeId}/results", {
        params: { path: { stocktakeId } },
      }),
    enabled: enabled && Boolean(stocktakeId),
  });
}

export function useStartStocktakeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { name: string; notes?: string }) =>
      client.POST("/v1/library/stocktakes", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useScanStocktakeMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ stocktakeId, barcode }: { stocktakeId: string; barcode: string }) =>
      client.POST("/v1/library/stocktakes/{stocktakeId}/scans", {
        params: { path: { stocktakeId } },
        body: { codes: [barcode] },
      }),

    meta: { errorToast: false },
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

    meta: { errorToast: false },
  });
}

/**
 * XLSX per-session stocktake report. The API returns raw spreadsheet
 * bytes, so a plain `fetch` is used instead of the JSON-typed client (see
 * `api.ts`'s own `downloadPDF`).
 */
export async function downloadLibraryStocktakeReportXlsx(stocktakeId: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(
    `${API_URL}/v1/library/stocktakes/${encodeURIComponent(stocktakeId)}/report.xlsx`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );
  if (!response.ok) {
    throw new ApiError({ status: response.status, code: "UNKNOWN", message: "UNKNOWN" });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-opname-${stocktakeId}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
