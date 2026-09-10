"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { useApiClient } from "../../lib/api/client";

import { type PushState, readPushState, subscribeToPush, unsubscribeFromPush } from "./push";

/** The devices this user has registered, across web and mobile. */
export function usePushDevicesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.pushDevices(),
    queryFn: () => client.GET("/v1/push-devices"),
  });
}

/**
 * Ties the browser's own push state to the server's device list: turning
 * push on has to succeed in both places, and turning it off has to clear
 * both, or the server keeps pushing to an endpoint the browser has
 * already dropped.
 */
export function useWebPush() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readPushState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await subscribeToPush();
      if (!registration) {
        // Either unsupported or refused; readPushState tells the two apart.
        setState(await readPushState());
        return false;
      }
      await client.POST("/v1/push-devices", { body: registration });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pushDevices() });
      setState("enabled");
      return true;
    } finally {
      setBusy(false);
    }
  }, [client, queryClient]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) {
        await client.DELETE("/v1/push-devices", {
          params: { query: { token_or_endpoint: endpoint } },
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.pushDevices() });
      }
      setState("idle");
    } finally {
      setBusy(false);
    }
  }, [client, queryClient]);

  return { state, busy, enable, disable };
}
