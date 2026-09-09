// App-wide sync loop for the offline mutation queue (queue.ts) plus the
// read side screens use to show a pending/conflict badge. The loop itself
// mounts once at the app root (useOfflineSyncLoop, wired from
// src/app/_layout.tsx); any screen can read the counts cheaply through
// useOfflineQueueCounts without starting a second timer.

import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getOfflineQueue } from "@/lib/offline/queue";
import { isOnline } from "@/lib/offline/network";

const QUEUE_COUNTS_KEY = ["offline-queue", "counts"] as const;
const AUTO_FLUSH_INTERVAL_MS = 20_000;

export interface OfflineQueueCounts {
  pending: number;
  conflicted: number;
}

async function readCounts(): Promise<OfflineQueueCounts> {
  const queue = getOfflineQueue();
  const [pending, conflicts] = await Promise.all([queue.pending(), queue.conflicts()]);
  return { pending: pending.length, conflicted: conflicts.length };
}

/** Read-only: current pending/conflict counts, refreshed whenever the sync
 * loop flushes and on a slow poll of its own so a screen mounted mid-flush
 * still catches up. */
export function useOfflineQueueCounts(): OfflineQueueCounts {
  const { data } = useQuery({
    queryKey: QUEUE_COUNTS_KEY,
    queryFn: readCounts,
    initialData: { pending: 0, conflicted: 0 },
    refetchInterval: AUTO_FLUSH_INTERVAL_MS,
  });
  return data;
}

/**
 * Attempts to send every due queued mutation now. Screens call this after
 * enqueueing a mutation so a device that is actually online sends it right
 * away instead of waiting for the next scheduled flush; the sync loop below
 * calls it on the same schedule automatically.
 */
export function useFlushOfflineQueue(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const result = await getOfflineQueue().flush(isOnline);
    if (result.sent > 0 || result.conflicted > 0) {
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    }
    void queryClient.invalidateQueries({ queryKey: QUEUE_COUNTS_KEY });
  }, [queryClient]);
}

/** Mount once near the app root: flushes on cold start, whenever the app
 * returns to the foreground, and on a fixed interval while foregrounded so
 * a connection that comes back while the phone stays unlocked still syncs
 * without the person having to reopen the app. */
export function useOfflineSyncLoop(): void {
  const flush = useFlushOfflineQueue();

  useEffect(() => {
    void flush();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void flush();
    });
    const interval = setInterval(() => void flush(), AUTO_FLUSH_INTERVAL_MS);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [flush]);
}
