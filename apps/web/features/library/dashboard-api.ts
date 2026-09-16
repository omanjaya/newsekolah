"use client";

import type { components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryDashboard = components["schemas"]["LibraryDashboard"];

/** Summary counts, latest activity, longest overdue, popular titles, and a 30-day trend. */
export function useLibraryDashboardQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "dashboard"],
    queryFn: () => client.GET("/v1/library/dashboard"),
  });
}
