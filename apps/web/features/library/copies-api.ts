"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type LibraryCopyStatus = components["schemas"]["LibraryCopyStatus"];
export type LibraryMasterEntry = components["schemas"]["LibraryMasterEntry"];

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

export function useCollectionCategoriesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "collection-categories"],
    queryFn: () => client.GET("/v1/library/collection-categories"),
    staleTime: REFERENCE_STALE_MS,
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
