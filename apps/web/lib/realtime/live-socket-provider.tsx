"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { getAccessToken, subscribeAccessToken } from "../api/access-token";
import { API_URL } from "../env";

import { parseLiveMessage } from "./envelope";
import { reconnectDelay } from "./reconnect";
import type { LiveEnvelope, LiveSocketStatus } from "./types";

/**
 * The first connect waits for the page to settle. A full page load right
 * after login (or any navigation) makes `middleware.ts` rotate the refresh
 * token, which revokes the session the previous document's token names;
 * a handshake started in that window would be rejected for a reason that
 * has nothing to do with the socket itself.
 */
const INITIAL_CONNECT_DELAY_MS = 1_500;
/** A connection that stayed up this long counts as healthy and resets the backoff. */
const STABLE_AFTER_MS = 10_000;
/**
 * Consecutive handshakes that never reach `onopen`, with no token change
 * in between, before this provider stops hammering that exact token and
 * arms the fast reconnect-on-refreshed-token path below (see connect()'s
 * onclose handler). The slow backoff loop (scheduleReconnect) keeps
 * running regardless -- this is a shortcut layered on top of it, not a
 * gate that can block it, so a token that is not actually expired (a
 * flaky network masquerading as a handshake failure) still eventually
 * retries on its own.
 */
const MAX_HANDSHAKE_FAILURES = 2;
/**
 * How long a hidden tab keeps its socket open before this provider closes
 * it deliberately ("paused", not "reconnecting" -- plan section
 * "pause when the tab is hidden for long and resume on visibility").
 * Short tab switches (checking another tab, alt-tabbing back) never pause
 * anything.
 */
const HIDDEN_PAUSE_AFTER_MS = 60_000;

function wsMeUrl(): string {
  return `${API_URL.replace(/^http/, "ws")}/ws/me`;
}

/**
 * One registration from useLiveInvalidate: which event types it cares
 * about, what to do when one arrives (invalidate its query keys, plus any
 * `onEvent` side effect such as a toast), and what to do on resync (every
 * `hello` after the first -- invalidate only, no side effect, since the
 * client cannot know whether the event that would have triggered the side
 * effect actually happened while it was disconnected).
 */
interface LiveListener {
  matches: (type: string) => boolean;
  onMatch: (envelope: LiveEnvelope) => void;
  resync: () => void;
}

interface LiveSocketContextValue {
  status: LiveSocketStatus;
  registerListener: (listener: LiveListener) => () => void;
  subscribeTopic: (topic: string) => () => void;
}

const LiveSocketContext = createContext<LiveSocketContextValue | null>(null);

export function useLiveSocketContext(): LiveSocketContextValue {
  const context = useContext(LiveSocketContext);
  if (!context) {
    throw new Error("useLiveSocketContext must be used within LiveSocketProvider");
  }
  return context;
}

/** The header's ConnectionStatusIndicator only needs the status, not the registration API. */
export function useLiveSocketStatus(): LiveSocketStatus {
  return useLiveSocketContext().status;
}

/**
 * One multiplexed `GET /ws/me` connection per tab
 * (docs/analysis/realtime-plan-2026-09-25.md chunk D), replacing the
 * per-feature sockets `useNotificationsSocket` and (still separate,
 * different auth scheme, section 3.2's "`/ws/monitor` tetap terpisah")
 * `useMonitorSocket` used to open on their own. Mount once, app-shell-wide
 * (apps/web/components/app-shell.tsx).
 *
 * Auth exactly matches the pre-chunk-D client: the in-memory access token
 * (never persisted, lib/api/access-token.ts) travels as the
 * `bearer.<token>` WebSocket subprotocol, since a browser cannot set an
 * Authorization header on the handshake.
 *
 * Reconnect: exponential backoff with full jitter (reconnect.ts),
 * uncapped -- the delay's own ceiling (MAX_DELAY_MS) is the only limit,
 * there is no maximum-attempts cutoff, so a rolling deploy that outlasts
 * a few attempts still recovers on its own instead of the socket falling
 * silent for the rest of the tab's life (the bug this chunk fixes, plan
 * section 1.5 #4). `status` is always exposed so a caller (the header's
 * ConnectionStatusIndicator) can tell the difference between "briefly
 * reconnecting" and "long enough to be worth telling the reader about".
 *
 * Resync on reconnect: every `hello` after the first triggers `resync()`
 * on every currently registered useLiveInvalidate listener, not only the
 * ones whose event types match something that just happened -- section
 * 3.4's point: an event that fired while this tab was disconnected is
 * otherwise lost forever, since the hub keeps no replay log.
 *
 * Topic subscriptions (useLiveTopic) are ref-counted here, not per
 * hook instance, so N components asking for the same topic only ever
 * produce one subscribe/unsubscribe message on the wire. Because the
 * server's per-connection Multiplexer starts empty on every fresh
 * connection (docs/analysis/realtime-plan-2026-09-25.md section 4.1: a
 * client's granted topics do not survive a reconnect), every currently
 * held topic is re-sent on every `hello`, including the very first one --
 * unlike resync, which only fires after the first.
 *
 * Visibility: a tab hidden for HIDDEN_PAUSE_AFTER_MS closes its socket
 * deliberately ("paused" status, not "reconnecting") and reconnects (with
 * the same resync-on-hello guarantee) the moment it becomes visible
 * again, so a laptop left on a hidden tab all day is not holding a
 * connection, and a heartbeat, open for nothing.
 *
 * Session expiry: a handshake that keeps failing without ever opening,
 * across MAX_HANDSHAKE_FAILURES attempts with the same token, most likely
 * means the session named by that token was revoked or expired -- this
 * stops retrying with it and instead waits for `subscribeAccessToken` to
 * report a *different* token (the app's own auth layer refreshing it),
 * reconnecting immediately once it does. The slow backoff loop underneath
 * keeps running the whole time regardless, so this is a latency shortcut,
 * never a way to get stuck.
 */
export function LiveSocketProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: ReactNode;
}): ReactElement {
  const [status, setStatus] = useState<LiveSocketStatus>("idle");

  const listenersRef = useRef(new Set<LiveListener>());
  const topicCountsRef = useRef(new Map<string, number>());
  const socketRef = useRef<WebSocket | null>(null);

  const registerListener = useCallback((listener: LiveListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const sendAction = useCallback((action: "subscribe" | "unsubscribe", topics: string[]) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN || topics.length === 0) return;
    socket.send(JSON.stringify({ action, topics }));
  }, []);

  const subscribeTopic = useCallback(
    (topic: string) => {
      const counts = topicCountsRef.current;
      const next = (counts.get(topic) ?? 0) + 1;
      counts.set(topic, next);
      if (next === 1) sendAction("subscribe", [topic]);
      return () => {
        const current = counts.get(topic) ?? 0;
        if (current <= 1) {
          counts.delete(topic);
          sendAction("unsubscribe", [topic]);
        } else {
          counts.set(topic, current - 1);
        }
      };
    },
    [sendAction],
  );

  useEffect(() => {
    if (!userId || API_URL === "" || typeof WebSocket === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to userId/env, not deriving from state available at render time (same pattern as components/offline-indicator.tsx).
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let handshakeFailures = 0;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeToken: (() => void) | null = null;
    /**
     * Counts every dispatched connect() call, including ones that never
     * reach `onopen` -- unlike a "has a hello ever arrived" flag, this
     * still advances when a handshake is rejected before producing one
     * (see connect()'s own comment on why that matters for resync).
     */
    let totalConnectAttempts = 0;
    let paused = false;

    function setStatusSafe(next: LiveSocketStatus) {
      if (!cancelled) setStatus(next);
    }

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function clearHiddenTimer() {
      if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
    }

    function scheduleReconnect() {
      if (cancelled || paused) return;
      setStatusSafe("reconnecting");
      clearReconnectTimer();
      reconnectTimer = setTimeout(connect, reconnectDelay(attempts));
      attempts += 1;
    }

    /** Fast path: reconnect the instant a token different from `staleToken` shows up, instead of waiting out the rest of the backoff ceiling. */
    function armTokenListener(staleToken: string | null) {
      if (unsubscribeToken) return;
      unsubscribeToken = subscribeAccessToken((token) => {
        if (cancelled || !token || token === staleToken) return;
        unsubscribeToken?.();
        unsubscribeToken = null;
        clearReconnectTimer();
        attempts = 0;
        connect();
      });
    }

    function resubscribeAllTopics() {
      sendAction("subscribe", [...topicCountsRef.current.keys()]);
    }

    function resyncAllListeners() {
      for (const listener of listenersRef.current) listener.resync();
    }

    function connect() {
      if (cancelled || paused) return;
      const token = getAccessToken();
      if (!token) {
        setStatusSafe("reconnecting");
        armTokenListener(null);
        return;
      }

      // Captured per-call, not read from the shared counter inside the
      // closures below: this specific connection is "the first attempt"
      // (skip resync -- nothing could have been missed before a page's
      // very first connection even started dialing) only if no earlier
      // connect() call has been dispatched yet. A `seenHello`-style flag
      // that only advances once a hello actually arrives undercounts this:
      // a handshake rejected during the post-login refresh-token-rotation
      // window (this function's own doc comment) never reaches `onopen`,
      // so it never produces a hello either -- but real time still passed,
      // and a "leave_request.reviewed" or similar published during that
      // gap would otherwise be silently missed forever, since the eventual
      // successful connection's hello would still count as "the first"
      // and skip resync. Observed against a real stack (apps/web/e2e/
      // simulation's leave-request scenario): the homeroom teacher's
      // approval, published within roughly a second of the student's page
      // load, landed in exactly this gap.
      totalConnectAttempts += 1;
      const isFirstAttempt = totalConnectAttempts === 1;

      setStatusSafe(isFirstAttempt ? "connecting" : "reconnecting");
      let openedAt = 0;
      const current = new WebSocket(wsMeUrl(), [`bearer.${token}`]);
      socket = current;
      socketRef.current = current;

      current.onopen = () => {
        openedAt = Date.now();
      };
      current.onmessage = (event) => {
        const envelope = parseLiveMessage(String(event.data));
        if (!envelope) return;

        if (envelope.type === "hello") {
          setStatusSafe("open");
          resubscribeAllTopics();
          if (!isFirstAttempt) resyncAllListeners();
          return;
        }

        for (const listener of listenersRef.current) {
          if (listener.matches(envelope.type)) listener.onMatch(envelope);
        }
      };
      current.onclose = () => {
        if (socketRef.current === current) socketRef.current = null;
        if (socket === current) socket = null;
        if (cancelled || paused) return;

        if (openedAt === 0) {
          handshakeFailures += 1;
          if (handshakeFailures >= MAX_HANDSHAKE_FAILURES) armTokenListener(token);
        } else {
          handshakeFailures = 0;
          if (Date.now() - openedAt >= STABLE_AFTER_MS) attempts = 0;
        }
        scheduleReconnect();
      };
      // A failed handshake fires error then close; close drives the retry.
      current.onerror = () => undefined;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        clearHiddenTimer();
        hiddenTimer = setTimeout(() => {
          paused = true;
          clearReconnectTimer();
          setStatusSafe("paused");
          socket?.close();
        }, HIDDEN_PAUSE_AFTER_MS);
        return;
      }
      clearHiddenTimer();
      if (paused) {
        paused = false;
        attempts = 0;
        connect();
      }
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    setStatus("connecting");
    reconnectTimer = setTimeout(connect, INITIAL_CONNECT_DELAY_MS);

    return () => {
      cancelled = true;
      clearReconnectTimer();
      clearHiddenTimer();
      unsubscribeToken?.();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      socket?.close();
      socketRef.current = null;
    };
  }, [userId, sendAction]);

  return (
    <LiveSocketContext.Provider value={{ status, registerListener, subscribeTopic }}>
      {children}
    </LiveSocketContext.Provider>
  );
}
