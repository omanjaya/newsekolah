"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useToast } from "@newsekolah/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { getAccessToken, subscribeAccessToken } from "../../lib/api/access-token";
import { API_URL } from "../../lib/env";

/**
 * Reconnect attempts in a row, after a connection that did open drops,
 * before giving up for this page load. `useUnreadCountQuery`'s own poll
 * keeps the badge eventually correct without the socket.
 */
const MAX_RECONNECT_ATTEMPTS = 6;
/**
 * A handshake that never opens (endpoint missing, rejected token, proxy
 * without WebSocket support) is never retried with the token it was
 * rejected with: the hook waits for the next token the app obtains (a
 * refresh) and tries once more, then leaves it alone. The browser logs
 * every failed handshake to the console and nothing JavaScript can do
 * suppresses that, so retrying a socket that is simply unavailable would
 * only produce noise.
 */
const MAX_HANDSHAKE_FAILURES = 2;
/**
 * The first connect waits for the page to settle. A full page load right
 * after login (or any navigation) makes `middleware.ts` rotate the refresh
 * token, which revokes the session the previous document's token names;
 * a handshake that previous document starts in that window is rejected.
 * The delay also lets React's development double-mount cancel the timer
 * instead of opening and dropping a socket. Notifications arriving in this
 * window are still picked up by the unread-count poll.
 */
const INITIAL_CONNECT_DELAY_MS = 1_500;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
/** A connection that stayed up this long counts as healthy and resets the backoff. */
const STABLE_AFTER_MS = 10_000;

interface RealtimeMessage {
  type?: string;
  payload?: { title?: string; body?: string };
}

function wsMeUrl(): string {
  return `${API_URL.replace(/^http/, "ws")}/ws/me`;
}

/** Exponential backoff with full jitter, so many tabs do not reconnect in lockstep. */
export function reconnectDelay(attempt: number): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}

/**
 * Subscribes once, app-shell-wide, to the signed-in user's own realtime
 * topic (`GET /ws/me`, apps/api/cmd/api/ws.go). A browser cannot set an
 * Authorization header on the WebSocket handshake, so the access token
 * travels as the `bearer.<token>` subprotocol, matching
 * `realtime.ExtractBearer` on the API side. The token is the same
 * in-memory access token the fetch client already sends (lib/api/
 * access-token.ts); it is never persisted or put in the URL, so it does
 * not end up in server access logs or browser history.
 *
 * On `notification_created` the inbox list and unread count are refetched
 * and a toast is shown. `userId` gates the connection on a resolved
 * session and forces a reconnect when the signed-in user changes. Each
 * reconnect reads the current token, so a refreshed token is picked up;
 * with no usable token yet (a fresh page load, before the API client's boot
 * refresh) or only a rejected one, it waits for the next token instead of
 * handshaking with nothing or with a token the API already refused.
 */
export function useNotificationsSocket(userId: string | undefined): void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });

  useEffect(() => {
    if (!userId || API_URL === "" || typeof WebSocket === "undefined") return;
    let cancelled = false;
    let attempts = 0;
    let handshakeFailures = 0;
    let rejectedToken: string | null = null;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    function scheduleReconnect() {
      if (cancelled || attempts >= MAX_RECONNECT_ATTEMPTS) return;
      timer = setTimeout(connect, reconnectDelay(attempts));
      attempts += 1;
    }

    function usableToken(): string | null {
      const token = getAccessToken();
      return token && token !== rejectedToken ? token : null;
    }

    /** Connects as soon as the app holds a token the API has not already refused. */
    function waitForToken() {
      if (unsubscribe) return;
      unsubscribe = subscribeAccessToken(() => {
        if (cancelled || !usableToken()) return;
        unsubscribe?.();
        unsubscribe = null;
        connect();
      });
    }

    function connect() {
      if (cancelled) return;
      const token = usableToken();
      if (!token) {
        waitForToken();
        return;
      }
      let openedAt = 0;
      const current = new WebSocket(wsMeUrl(), [`bearer.${token}`]);
      socket = current;

      current.onopen = () => {
        openedAt = Date.now();
        rejectedToken = null;
      };
      current.onmessage = (event) => {
        let message: RealtimeMessage;
        try {
          message = JSON.parse(String(event.data)) as RealtimeMessage;
        } catch {
          return;
        }
        if (message.type !== "notification_created") return;
        void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
        void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnreadCount() });
        const title = message.payload?.title;
        const body = message.payload?.body;
        if (title) {
          toastRef.current.info(title, body ? { description: body } : undefined);
        }
      };
      current.onclose = () => {
        if (socket === current) socket = null;
        if (cancelled) return;
        if (openedAt === 0) {
          handshakeFailures += 1;
          if (handshakeFailures >= MAX_HANDSHAKE_FAILURES) return;
          rejectedToken = token;
          waitForToken();
          return;
        }
        handshakeFailures = 0;
        if (Date.now() - openedAt >= STABLE_AFTER_MS) attempts = 0;
        scheduleReconnect();
      };
      // A failed handshake fires error then close; close drives the retry.
      current.onerror = () => undefined;
    }

    timer = setTimeout(connect, INITIAL_CONNECT_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      socket?.close();
    };
  }, [userId, queryClient]);
}
