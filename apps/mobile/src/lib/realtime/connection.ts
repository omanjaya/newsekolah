// Framework-agnostic core of the mobile /ws/me client: one connection,
// ref-counted topic subscriptions, reconnect with backoff, AppState-aware
// close/reopen, and resync-on-hello. Kept independent of React so it can be
// unit-tested directly (jest-expo has no React Native Testing Library, see
// __tests__/realtime-connection.test.ts) and so live-socket-provider.tsx
// stays a thin adapter that only wires real dependencies in.
import { parseRealtimeMessage, reconnectDelay, type RealtimeMessage } from "./envelope";
import type { RealtimeSocketLike } from "./socket";

export type ConnectionStatus = "idle" | "connecting" | "open" | "closed";

/** Mirrors react-native's AppStateStatus without importing react-native
 * here, so this file (and its tests) stay framework-agnostic. */
export type AppLifecycleState = "active" | "background" | "inactive" | "unknown" | "extension";

export interface RealtimeConnectionDeps {
  getBaseUrl: () => string;
  getTenantSlug: () => string | null;
  /** The in-memory access token (token-store.ts's getAccessTokenSync), read
   * fresh on every connection attempt -- never cached across reconnects. */
  getAccessToken: () => string | null;
  createSocket: (baseUrl: string, token: string, tenantSlug: string | null) => RealtimeSocketLike;
  /** offline/network.ts's isOnline: a short reachability probe. Optional so
   * tests can omit it (treated as always online) without a fetch mock. */
  isOnline?: () => Promise<boolean>;
  /** react-native's AppState.addEventListener("change", ...), abstracted so
   * tests can drive transitions without the real module. */
  subscribeAppState?: (listener: (state: AppLifecycleState) => void) => () => void;
  /** How long a background/inactive app keeps the socket open before it is
   * closed (plan section 3.5's AppState handling). Defaults to 5s -- long
   * enough that a quick app-switcher glance or an incoming phone call does
   * not tear down and reopen the connection, short enough that a socket is
   * never left open for a phone sitting locked in a pocket. */
  backgroundGraceMs?: number;
  /** Fixed poll interval while there is no usable access token yet or the
   * network probe says offline -- deliberately not part of the backoff
   * attempt counter (plan: reconnect is about a socket that failed to open,
   * not about waiting out a known precondition). */
  waitRetryMs?: number;
}

type Unsubscribe = () => void;

const DEFAULT_BACKGROUND_GRACE_MS = 5_000;
const DEFAULT_WAIT_RETRY_MS = 2_000;

/**
 * One /ws/me connection's lifecycle and topic bookkeeping. Construct once
 * per signed-in session (live-socket-provider.tsx owns the instance),
 * `start()` it once, `stop()` it on sign-out/unmount, and never reuse a
 * stopped instance -- create a new one instead, mirroring how a browser tab
 * cannot un-close a WebSocket.
 */
export class RealtimeConnection {
  private readonly deps: RealtimeConnectionDeps;
  private readonly backgroundGraceMs: number;
  private readonly waitRetryMs: number;

  private socket: RealtimeSocketLike | null = null;
  private status: ConnectionStatus = "idle";
  private stopped = false;
  private connectedWithToken: string | null = null;

  /** Backoff attempt counter. Reset to 0 on every successful "hello" (a
   * full authenticated round trip, a stronger signal than "the socket
   * merely opened") and whenever a fresh token starts a reconnect --
   * deliberately never capped by an attempt count: chunk F's contract is
   * "no silent give-up", unlike apps/web/features/notifications/
   * realtime.ts's MAX_RECONNECT_ATTEMPTS. */
  private reconnectAttempt = 0;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null;

  /** True for the one close() call this connection itself initiated
   * (backgrounding, a token change, stop()) -- read once by the next
   * onclose and cleared, so that one close is never mistaken for a dropped
   * connection needing a backoff retry. */
  private suppressNextAutoReconnect = false;
  /** True while closed specifically because the app is backgrounded, so
   * the next "active" AppState transition knows to reconnect instead of
   * leaving an idle connection alone. */
  private closedForBackground = false;

  /** Bumped at the start of every attemptConnect() call and by stop().
   * attemptConnect awaits isOnline() before opening a socket; if a second
   * attempt starts in that window (a token change or a background-close-
   * then-foreground reconnect, both of which call attemptConnect() again
   * directly) or stop() runs, this lets the first, now-stale attempt
   * recognize it was superseded/torn down and return without opening a
   * socket, instead of racing. */
  private connectGeneration = 0;

  private helloCount = 0;
  private readonly topicRefCounts = new Map<string, number>();
  private readonly eventListeners = new Map<string, Set<(message: RealtimeMessage) => void>>();
  private readonly resyncHandlers = new Set<() => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private unsubscribeAppState: Unsubscribe | null = null;

  constructor(deps: RealtimeConnectionDeps) {
    this.deps = deps;
    this.backgroundGraceMs = deps.backgroundGraceMs ?? DEFAULT_BACKGROUND_GRACE_MS;
    this.waitRetryMs = deps.waitRetryMs ?? DEFAULT_WAIT_RETRY_MS;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Begins connecting (respecting whatever token/online state hold right
   * now) and starts watching AppState. Call once; a second call is a
   * harmless no-op. */
  start(): void {
    if (this.stopped || this.status !== "idle") return;
    this.unsubscribeAppState =
      this.deps.subscribeAppState?.((state) => {
        this.handleAppStateChange(state);
      }) ?? null;
    void this.attemptConnect();
  }

  /** Permanently ends this connection: closes the socket, cancels every
   * timer, stops watching AppState, and releases every listener. The
   * instance is dead afterward -- live-socket-provider.tsx builds a new one
   * for the next signed-in session rather than restarting this one. */
  stop(): void {
    this.stopped = true;
    this.connectGeneration += 1;
    this.clearConnectTimer();
    this.clearBackgroundTimer();
    this.unsubscribeAppState?.();
    this.unsubscribeAppState = null;
    this.suppressNextAutoReconnect = true;
    this.socket?.close();
    this.socket = null;
    this.setStatus("closed");
    this.eventListeners.clear();
    this.resyncHandlers.clear();
    this.statusListeners.clear();
  }

  /** Registers handler for every message whose `type` is in eventTypes
   * (useLiveInvalidate's and useLiveEvent's shared primitive). Returns an
   * unsubscribe function. */
  onEventTypes(
    eventTypes: readonly string[],
    handler: (message: RealtimeMessage) => void,
  ): Unsubscribe {
    for (const type of eventTypes) {
      let set = this.eventListeners.get(type);
      if (!set) {
        set = new Set();
        this.eventListeners.set(type, set);
      }
      set.add(handler);
    }
    return () => {
      for (const type of eventTypes) {
        this.eventListeners.get(type)?.delete(handler);
      }
    };
  }

  /** Registers handler to run on every "hello" after the first -- i.e.
   * every reconnect, never the initial connect (plan: resync closes the
   * "event missed while offline" gap; the first connect has nothing stale
   * to resync yet). */
  onResync(handler: () => void): Unsubscribe {
    this.resyncHandlers.add(handler);
    return () => {
      this.resyncHandlers.delete(handler);
    };
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(handler);
    return () => {
      this.statusListeners.delete(handler);
    };
  }

  /**
   * Ref-counted subscribe to one short topic (`"role:admin"`,
   * `"duty:homeroom:<classID>"`, `"user:<selfID>"`; never a tenant-scoped
   * name -- the server resolves that, see subscribe.go). The wire
   * `"subscribe"` message is only sent the moment a topic's count goes
   * 0 -> 1, and `"unsubscribe"` only when it goes back to 0, so two screens
   * both wanting `"role:librarian"` share one server-side grant. Every
   * currently-held topic is re-sent automatically on every hello (see
   * handleHello), since a new connection has none of the previous one's
   * multiplexed subscriptions -- only its base user topic, which the server
   * grants unconditionally at connect time.
   */
  subscribeTopic(topic: string): Unsubscribe {
    const count = this.topicRefCounts.get(topic) ?? 0;
    this.topicRefCounts.set(topic, count + 1);
    if (count === 0) this.sendSubscribe([topic]);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.topicRefCounts.get(topic) ?? 0;
      if (current <= 1) {
        this.topicRefCounts.delete(topic);
        this.sendUnsubscribe([topic]);
      } else {
        this.topicRefCounts.set(topic, current - 1);
      }
    };
  }

  /** Called whenever the token this connection should be using may have
   * changed (login, a single-flight refresh completing, logout). A no-op
   * if the token is unchanged. A null token (signed out) closes the socket
   * and leaves the connection idle, waiting; live-socket-provider.tsx stops
   * the whole connection on sign-out instead of relying on this alone. */
  notifyTokenChanged(): void {
    if (this.stopped) return;
    const token = this.deps.getAccessToken();
    if (token === this.connectedWithToken) return;

    this.reconnectAttempt = 0;
    this.clearConnectTimer();
    if (this.socket) {
      this.suppressNextAutoReconnect = true;
      this.socket.close();
      this.socket = null;
    }
    if (token) {
      void this.attemptConnect();
    } else {
      this.setStatus("idle");
    }
  }

  private handleAppStateChange(state: AppLifecycleState): void {
    if (this.stopped) return;
    if (state === "background" || state === "inactive") {
      if (this.backgroundTimer) return;
      this.backgroundTimer = setTimeout(() => {
        this.backgroundTimer = null;
        this.closeForBackground();
      }, this.backgroundGraceMs);
      return;
    }
    if (state === "active") {
      this.clearBackgroundTimer();
      if (this.closedForBackground) {
        this.closedForBackground = false;
        this.reconnectAttempt = 0;
        void this.attemptConnect();
      }
    }
  }

  private closeForBackground(): void {
    if (!this.socket) return;
    this.closedForBackground = true;
    this.suppressNextAutoReconnect = true;
    this.clearConnectTimer();
    this.socket.close();
    this.socket = null;
    this.setStatus("closed");
  }

  private async attemptConnect(): Promise<void> {
    if (this.stopped || this.socket) return;
    this.clearConnectTimer();
    const generation = ++this.connectGeneration;

    const token = this.deps.getAccessToken();
    if (!token) {
      this.scheduleWaitRetry();
      return;
    }

    const online = this.deps.isOnline ? await this.deps.isOnline() : true;
    if (generation !== this.connectGeneration) return;
    if (!online) {
      this.scheduleWaitRetry();
      return;
    }

    this.openSocket(token);
  }

  private openSocket(token: string): void {
    this.setStatus("connecting");
    const socket = this.deps.createSocket(this.deps.getBaseUrl(), token, this.deps.getTenantSlug());
    this.socket = socket;
    this.connectedWithToken = token;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.setStatus("open");
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event.data);
    };
    socket.onerror = () => undefined; // close always follows; that is what drives retry.
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.setStatus("closed");
      if (this.stopped) return;
      if (this.suppressNextAutoReconnect) {
        this.suppressNextAutoReconnect = false;
        return;
      }
      this.scheduleReconnect();
    };
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    const message = parseRealtimeMessage(data);
    if (!message) return;

    if (message.type === "hello") {
      this.helloCount += 1;
      this.reconnectAttempt = 0;
      this.resendActiveTopics();
      if (this.helloCount > 1) {
        for (const handler of [...this.resyncHandlers]) handler();
      }
      return;
    }

    const handlers = this.eventListeners.get(message.type);
    if (!handlers) return;
    for (const handler of [...handlers]) handler(message);
  }

  private resendActiveTopics(): void {
    const topics = [...this.topicRefCounts.keys()];
    if (topics.length > 0) this.sendSubscribe(topics);
  }

  private sendSubscribe(topics: string[]): void {
    this.send({ action: "subscribe", topics });
  }

  private sendUnsubscribe(topics: string[]): void {
    this.send({ action: "unsubscribe", topics });
  }

  private send(message: { action: string; topics: string[] }): void {
    if (!this.socket || this.status !== "open") return;
    this.socket.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = reconnectDelay(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => void this.attemptConnect(), delay);
  }

  private scheduleWaitRetry(): void {
    if (this.stopped) return;
    this.setStatus("connecting");
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => void this.attemptConnect(), this.waitRetryMs);
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private clearBackgroundTimer(): void {
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }
}
