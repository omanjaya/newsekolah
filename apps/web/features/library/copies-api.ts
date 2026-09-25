"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type LibraryCopyStatus = components["schemas"]["LibraryCopyStatus"];
export type LibraryMasterEntry = components["schemas"]["LibraryMasterEntry"];
export type LibraryMasterEntryWrite = components["schemas"]["LibraryMasterEntryWrite"];
export type LibraryCopy = components["schemas"]["LibraryCopy"];

/**
 * Sets one manual status on several copies at once; a copy currently on
 * loan is silently skipped by the API rather than rejected, so the caller
 * compares `copy_ids.length` against the returned `data.length` to report
 * how many were skipped.
 */
export function useBulkSetLibraryCopyStatusMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { copy_ids: string[]; status: LibraryCopyStatus; note?: string }) =>
      client.POST("/v1/library/copies/bulk-status", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
    },

    meta: { errorToast: false },
  });
}

export function useLibraryCopiesFilteredQuery(params: {
  titleId?: string;
  status?: LibraryCopyStatus | "";
  categoryId?: string;
  locationId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const client = useApiClient();
  const status = params.status === "" ? undefined : params.status;
  const search = params.search === "" ? undefined : params.search;
  return useQuery({
    queryKey: [
      "library",
      "copies",
      "filtered",
      params.titleId,
      status,
      params.categoryId,
      params.locationId,
      search,
      params.limit,
      params.offset,
    ],
    queryFn: () =>
      client.GET("/v1/library/copies", {
        params: {
          query: {
            title_id: params.titleId === "" ? undefined : params.titleId,
            status,
            category_id: params.categoryId === "" ? undefined : params.categoryId,
            location_id: params.locationId === "" ? undefined : params.locationId,
            search,
            limit: params.limit,
            offset: params.offset,
          },
        },
      }),
  });
}

const REFERENCE_STALE_MS = 5 * 60 * 1000;

function useInvalidate(key: string) {
  const queryClient = useQueryClient();
  // The copy forms read every master list through the combined options query.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library", key] }),
      queryClient.invalidateQueries({ queryKey: ["library", "catalogue-options"] }),
    ]);
}

export function useCollectionCategoriesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "collection-categories"],
    queryFn: () => client.GET("/v1/library/collection-categories"),
    staleTime: REFERENCE_STALE_MS,
  });
}

// Passed into the shared MasterEntryTab (components/master-entry-tab.tsx),
// same as the locations mutations below -- see useCreateLibraryLocationMutation's
// comment.
export function useCreateCollectionCategoryMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("collection-categories");
  return useMutation({
    mutationFn: (body: LibraryMasterEntryWrite) =>
      client.POST("/v1/library/collection-categories", { body }),
    onSuccess: invalidate,
    meta: { errorToast: false },
  });
}

export function useUpdateCollectionCategoryMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("collection-categories");
  return useMutation({
    mutationFn: ({ id, ...body }: LibraryMasterEntryWrite & { id: string }) =>
      client.PUT("/v1/library/collection-categories/{id}", { params: { path: { id } }, body }),
    onSuccess: invalidate,
    meta: { errorToast: false },
  });
}

export function useDeleteCollectionCategoryMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("collection-categories");
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/library/collection-categories/{id}", { params: { path: { id } } }),
    onSuccess: invalidate,
    meta: { errorToast: false },
  });
}

export function useLibraryLocationsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "locations"],
    queryFn: () => client.GET("/v1/library/locations"),
    staleTime: REFERENCE_STALE_MS,
  });
}

// Passed into the shared MasterEntryTab (components/master-entry-tab.tsx),
// which already toasts its own success/error -- errorToast: false avoids a
// second, generic error toast on top of that.
export function useCreateLibraryLocationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("locations");
  return useMutation({
    mutationFn: (body: LibraryMasterEntryWrite) => client.POST("/v1/library/locations", { body }),
    onSuccess: invalidate,
    meta: { errorToast: false },
  });
}

export function useUpdateLibraryLocationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("locations");
  return useMutation({
    mutationFn: ({ id, ...body }: LibraryMasterEntryWrite & { id: string }) =>
      client.PUT("/v1/library/locations/{id}", { params: { path: { id } }, body }),
    onSuccess: invalidate,
    meta: { errorToast: false },
  });
}

export function useDeleteLibraryLocationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate("locations");
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/library/locations/{id}", { params: { path: { id } } }),
    onSuccess: invalidate,
    meta: { errorToast: false },
  });
}

/**
 * A4 sheet of copy labels (3x8 grid) for a batch of copies, in the given
 * order. The API returns raw PDF bytes for a POST body, so a plain `fetch`
 * is used instead of the JSON-typed client.
 */
export async function printLibraryCopyLabelsBatch(copyIds: string[]): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}/v1/library/copies/labels`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ copy_ids: copyIds }),
  });
  if (!response.ok) {
    throw new ApiError({ status: response.status, code: "UNKNOWN", message: "UNKNOWN" });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "label-eksemplar.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
