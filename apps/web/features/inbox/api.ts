"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type InboxCounts = components["schemas"]["InboxCounts"];

/** Poll fallback only: realtime events (./realtime.ts) invalidate the counts as things change. */
export const INBOX_COUNTS_POLL_MS = 120_000;

/**
 * The action inbox badge numbers in one request. The server applies each
 * queue's own authorization and scoping, so a queue the reader cannot act
 * on counts as 0. Only the observer with `poll` set ticks: every observer
 * runs its own interval, so letting each mounted reader poll would multiply
 * the requests.
 */
export function useInboxCountsQuery(enabled: boolean, poll: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.inboxCounts(),
    queryFn: () => client.GET("/v1/inbox/counts"),
    enabled,
    refetchInterval: () =>
      poll && !(typeof document !== "undefined" && document.visibilityState === "hidden")
        ? INBOX_COUNTS_POLL_MS
        : false,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
  });
}
