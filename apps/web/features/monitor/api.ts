"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type MonitorSnapshot = components["schemas"]["MonitorSnapshot"];
export type MonitorSessionCard = components["schemas"]["MonitorSessionCard"];
export type PresenceSnapshot = components["schemas"]["PresenceSnapshot"];

/** How often the fallback poll re-fetches the snapshot once the socket has dropped. */
const POLL_INTERVAL_MS = 15_000;
/** Reconnect attempts before giving up on the socket and staying in polling mode. */
const MAX_RECONNECT_ATTEMPTS = 4;

/**
 * Public monitor-display snapshot, gated by the tenant's
 * `monitor.display_token` setting rather than the signed-in session (a
 * wall display has no user logged in). Sent as `X-Monitor-Token` since the
 * WebSocket variant (see `useMonitorSocket`) cannot set a custom header
 * before its handshake completes and both share the same token.
 */
export function useMonitorSnapshotQuery(token: string, options?: { refetchInterval?: number }) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.monitorSnapshot(),
    queryFn: () =>
      client.GET("/v1/monitor/snapshot", { params: { header: { "X-Monitor-Token": token } } }),
    enabled: token !== "",
    refetchInterval: options?.refetchInterval,
    retry: false,
  });
}

/** Who currently has a realtime socket open, for a signed-in staff member configuring the display. */
export function useMonitorPresenceQuery(enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.monitorPresence(),
    queryFn: () => client.GET("/v1/monitor/presence"),
    enabled,
    retry: false,
  });
}

function wsUrl(token: string): string {
  const base = API_URL.replace(/^http/, "ws");
  return `${base}/ws/monitor?token=${encodeURIComponent(token)}`;
}

export type MonitorConnectionMode = "connecting" | "live" | "polling";

/**
 * Keeps the monitor snapshot current over `/ws/monitor`: any message on the
 * socket is a signal to refetch (the push payload only ever carries the
 * one class that changed, see apps/api's `MonitorUpdate`, so refetching the
 * whole snapshot is simpler than patching one card in place). Falls back
 * to polling `GET /v1/monitor/snapshot` on its own interval once the
 * socket has failed to reconnect a few times in a row, and reports which
 * mode it is in so the display can say so on screen.
 */
export function useMonitorSocket(token: string): MonitorConnectionMode {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<MonitorConnectionMode>("connecting");
  const attemptsRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (token === "") return;
    let cancelled = false;

    function refetchSnapshot() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.monitorSnapshot() });
    }

    function connect() {
      if (cancelled) return;
      const socket = new WebSocket(wsUrl(token));
      socketRef.current = socket;

      socket.onopen = () => {
        attemptsRef.current = 0;
        setMode("live");
      };
      socket.onmessage = () => {
        refetchSnapshot();
      };
      socket.onclose = () => {
        if (cancelled) return;
        attemptsRef.current += 1;
        if (attemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
          setMode("polling");
          return;
        }
        setMode("connecting");
        timerRef.current = setTimeout(connect, 2000 * attemptsRef.current);
      };
      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
    };
  }, [token, queryClient]);

  return token === "" ? "connecting" : mode;
}

export { POLL_INTERVAL_MS };
