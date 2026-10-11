"use client";

import type { components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type StudentSearchHit = components["schemas"]["DirectoryUser"];

/** Fewest characters that start a student search; shorter input matches too much. */
export const STUDENT_SEARCH_MIN_CHARS = 2;
/** Most students the palette lists, so the group stays scannable. */
export const STUDENT_SEARCH_LIMIT = 8;

/**
 * Students whose name, username or NIS contains `term`, from the
 * signed-in-user directory (GET /v1/directory/users, trigram-indexed on name
 * and username). The term is part of the query key, so React Query drops the
 * in-flight request of a superseded term via the client's abort signal.
 */
export function useStudentSearchQuery(term: string, enabled: boolean) {
  const client = useApiClient();
  const search = term.trim();
  return useQuery({
    queryKey: ["directory", "student-search", search] as const,
    queryFn: ({ signal }) =>
      client.GET("/v1/directory/users", {
        params: { query: { profile_kind: "student", q: search, limit: STUDENT_SEARCH_LIMIT } },
        signal,
      }),
    enabled: enabled && search.length >= STUDENT_SEARCH_MIN_CHARS,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}
