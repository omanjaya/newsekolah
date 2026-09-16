"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryIsbnLookupResult = components["schemas"]["LibraryIsbnLookupResult"];
export type LibraryExternalBibliography = components["schemas"]["LibraryExternalBibliography"];

/**
 * A GET wrapped as a mutation: the lookup is a user-triggered, one-off
 * action (click "search"), not data a screen loads and caches on mount.
 */
export function useLookupExternalIsbnMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (isbn: string) =>
      client.GET("/v1/library/titles/isbn-lookup", { params: { query: { isbn } } }),
  });
}

export function useDownloadLibraryCoverMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (url: string) => client.POST("/v1/library/covers/download", { body: { url } }),
  });
}
