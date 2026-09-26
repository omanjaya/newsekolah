"use client";

import type { components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

import { useLibraryDashboardLive } from "./realtime";

export type LibraryDashboard = components["schemas"]["LibraryDashboard"];

/**
 * Summary counts, latest activity, longest overdue, popular titles, and a
 * 30-day trend. `enabled` lets a caller that only sometimes holds the
 * librarian persona (the per-role home) skip the request entirely.
 */
export function useLibraryDashboardQuery(enabled = true) {
  const client = useApiClient();
  useLibraryDashboardLive(enabled);
  return useQuery({
    queryKey: ["library", "dashboard"],
    queryFn: () => client.GET("/v1/library/dashboard"),
    enabled,
  });
}
