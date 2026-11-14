"use client";

import { type components } from "@newsekolah/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryOpacTitleDetail = components["schemas"]["LibraryOpacTitleDetail"];
export type LibraryOpacTitle = components["schemas"]["LibraryTitle"];

export interface OpacTitlesOptions {
  /** Narrows to titles whose classification starts with this text (see opac-classifications.ts). */
  classificationPrefix?: string;
  /** Page size; the API's default is 20. */
  limit?: number;
}

/**
 * Public OPAC (catalogue search visible without a session). Split out of
 * api.ts to keep that file under the lint line-count limit -- see its own
 * "Public OPAC" comment for the rest of that history. The previous result
 * stays on screen while a new search loads, so the list does not blink
 * empty between keystrokes.
 */
export function useOpacTitlesQuery(search: string, options: OpacTitlesOptions = {}) {
  const client = useApiClient();
  const { classificationPrefix, limit } = options;
  return useQuery({
    queryKey: ["library", "opac", search, classificationPrefix ?? "", limit ?? 0] as const,
    queryFn: () =>
      client.GET("/v1/opac/titles", {
        params: {
          query: {
            search: search || undefined,
            classification_prefix: classificationPrefix === "" ? undefined : classificationPrefix,
            limit,
          },
        },
      }),
    placeholderData: keepPreviousData,
  });
}

/**
 * GET /v1/opac/titles/{titleId}: public title detail with its visible
 * copies (no session required), for the OPAC title detail page.
 */
export function useOpacTitleQuery(titleId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "opac", "titles", titleId] as const,
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
