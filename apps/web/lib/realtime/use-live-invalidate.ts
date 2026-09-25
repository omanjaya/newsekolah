"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useLiveSocketContext } from "./live-socket-provider";
import type { LiveEnvelope } from "./types";

export interface UseLiveInvalidateOptions {
  /**
   * Runs once per matching event, after the query keys are invalidated --
   * for a side effect a plain cache invalidation cannot express, such as
   * the notification toast (apps/web/features/notifications/realtime.ts).
   * Never called on resync (see this file's doc comment): a resync cannot
   * know whether the event that would have triggered this side effect
   * actually happened while the tab was disconnected, only that the cache
   * might now be stale.
   */
  onEvent?: (envelope: LiveEnvelope) => void;
}

/**
 * Registers interest in `eventTypes` with the single LiveSocketProvider
 * connection: every matching event invalidates `queryKeys` (and runs
 * `options.onEvent`, if given), and every reconnect resync (provider's
 * doc comment: every `hello` after the first) invalidates `queryKeys`
 * again unconditionally, since an event that fired while this tab was
 * disconnected would otherwise never be seen.
 *
 * `eventTypes` and `queryKeys` are read fresh on every render through a
 * ref rather than being effect dependencies themselves, so passing new
 * array literals each render (the common case at call sites) never tears
 * down and re-creates the registration -- only `registerListener` and
 * `queryClient` (both stable) decide whether the effect re-runs.
 */
export function useLiveInvalidate(
  eventTypes: readonly string[],
  queryKeys: readonly QueryKey[],
  options?: UseLiveInvalidateOptions,
): void {
  const queryClient = useQueryClient();
  const { registerListener } = useLiveSocketContext();

  const stateRef = useRef({ eventTypes, queryKeys, onEvent: options?.onEvent });
  useEffect(() => {
    stateRef.current = { eventTypes, queryKeys, onEvent: options?.onEvent };
  });

  useEffect(() => {
    function invalidateAll() {
      for (const key of stateRef.current.queryKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    }

    return registerListener({
      matches: (type) => stateRef.current.eventTypes.includes(type),
      onMatch: (envelope) => {
        invalidateAll();
        stateRef.current.onEvent?.(envelope);
      },
      resync: invalidateAll,
    });
  }, [registerListener, queryClient]);
}
