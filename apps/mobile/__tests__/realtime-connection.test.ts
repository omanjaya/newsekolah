import { RealtimeConnection, type AppLifecycleState } from "@/lib/realtime/connection";
import type { RealtimeSocketLike } from "@/lib/realtime/socket";

/** In-memory stand-in for React Native's WebSocket (via socket.ts's
 * RealtimeSocketLike), controlled entirely from the test: no real network,
 * no timers of its own. Mirrors __tests__/offline-queue.test.ts's
 * createFakeDatabase pattern -- inject a fake at the dependency boundary
 * rather than mocking a native module. */
class FakeSocket implements RealtimeSocketLike {
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly sent: unknown[] = [];
  private closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({ code: 1000 });
  }

  /** Simulates the handshake completing. */
  open(): void {
    this.onopen?.();
  }

  /** Simulates the server pushing one frame. */
  receive(message: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  /** Simulates the connection dropping from the other end (network loss,
   * server restart) -- unlike close(), the test controls this directly
   * rather than going through this side's own close(). */
  drop(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({ code: 1006 });
  }
}

function helloMessage(): Record<string, unknown> {
  return {
    type: "hello",
    topic: "user:t1:u1",
    at: new Date().toISOString(),
    payload: { connection_id: "c1" },
  };
}

/** Builds a harness: a RealtimeConnection wired to fake sockets the test
 * can reach through `sockets` (one entry per createSocket call, in order)
 * and a fake AppState the test drives through `appState`. */
function buildHarness(overrides: { backgroundGraceMs?: number; waitRetryMs?: number } = {}) {
  const sockets: FakeSocket[] = [];
  let token: string | null = "token-1";
  let tenantSlug: string | null = "school-a";
  let appStateListener: ((state: AppLifecycleState) => void) | null = null;

  const connection = new RealtimeConnection({
    getBaseUrl: () => "http://api.example.test",
    getTenantSlug: () => tenantSlug,
    getAccessToken: () => token,
    createSocket: (_baseUrl, _token, _tenant) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    subscribeAppState: (listener) => {
      appStateListener = listener;
      return () => {
        appStateListener = null;
      };
    },
    backgroundGraceMs: overrides.backgroundGraceMs ?? 5_000,
    waitRetryMs: overrides.waitRetryMs ?? 2_000,
  });

  return {
    connection,
    sockets,
    setToken: (next: string | null) => {
      token = next;
    },
    setTenantSlug: (next: string | null) => {
      tenantSlug = next;
    },
    sendAppState: (state: AppLifecycleState) => appStateListener?.(state),
  };
}

describe("RealtimeConnection reconnect and backoff", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("opens one socket on start()", () => {
    const { connection, sockets } = buildHarness();
    connection.start();
    expect(sockets).toHaveLength(1);
    expect(connection.getStatus()).toBe("connecting");
  });

  it("reconnects after an unclean drop, with a growing delay and no give-up", () => {
    const { connection, sockets } = buildHarness();
    connection.start();
    sockets[0]?.open();
    sockets[0]?.drop();

    // Math.random mocked to 0: reconnectDelay(0) = ceiling/2 = 500ms.
    jest.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    // Second failure without an intervening "hello" backs off further
    // (reconnectDelay(1) = 1000ms at random=0), never stopping.
    sockets[1]?.drop();
    jest.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
  });

  it("caps the backoff delay instead of growing unbounded", () => {
    const { connection, sockets } = buildHarness();
    connection.start();
    // Fail enough times that reconnectDelay's ceiling (30_000ms at
    // random=0, so a 15_000ms delay) is reached well before this loop ends.
    for (let i = 0; i < 10; i += 1) {
      sockets[sockets.length - 1]?.open();
      sockets[sockets.length - 1]?.drop();
      jest.advanceTimersByTime(15_000);
    }
    // Every failure kept producing a new socket -- no silent give-up.
    expect(sockets.length).toBeGreaterThan(10);
  });

  it("resets the backoff attempt counter once hello confirms a healthy connection", () => {
    const { connection, sockets } = buildHarness();
    connection.start();
    sockets[0]?.open();
    sockets[0]?.drop();
    jest.advanceTimersByTime(500); // reconnectDelay(0) at random=0
    expect(sockets).toHaveLength(2);

    sockets[1]?.open();
    sockets[1]?.receive(helloMessage());
    sockets[1]?.drop();

    // Attempt counter was reset by the hello, so this failure again waits
    // reconnectDelay(0) = 500ms, not reconnectDelay(1) = 1000ms.
    jest.advanceTimersByTime(499);
    expect(sockets).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
  });

  it("does not reconnect after stop()", () => {
    const { connection, sockets } = buildHarness();
    connection.start();
    sockets[0]?.open();
    connection.stop();
    sockets[0]?.drop();
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(connection.getStatus()).toBe("closed");
  });
});

describe("RealtimeConnection resync on hello", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("does not resync on the first hello", () => {
    const { connection, sockets } = buildHarness();
    const resync = jest.fn();
    connection.onResync(resync);

    connection.start();
    sockets[0]?.open();
    sockets[0]?.receive(helloMessage());

    expect(resync).not.toHaveBeenCalled();
  });

  it("resyncs on every hello after the first", () => {
    const { connection, sockets } = buildHarness();
    const resync = jest.fn();
    connection.onResync(resync);

    connection.start();
    sockets[0]?.open();
    sockets[0]?.receive(helloMessage());
    sockets[0]?.drop();
    jest.advanceTimersByTime(500);
    sockets[1]?.open();
    sockets[1]?.receive(helloMessage());

    expect(resync).toHaveBeenCalledTimes(1);

    sockets[1]?.drop();
    jest.advanceTimersByTime(500);
    sockets[2]?.open();
    sockets[2]?.receive(helloMessage());

    expect(resync).toHaveBeenCalledTimes(2);
  });

  it("dispatches non-hello messages to matching event-type listeners", () => {
    const { connection, sockets } = buildHarness();
    const onNotification = jest.fn();
    const onOther = jest.fn();
    connection.onEventTypes(["notification_created"], onNotification);
    connection.onEventTypes(["classroom_entry_scanned"], onOther);

    connection.start();
    sockets[0]?.open();
    sockets[0]?.receive({
      type: "notification_created",
      topic: "user:t1:u1",
      payload: { title: "Hi" },
    });

    expect(onNotification).toHaveBeenCalledTimes(1);
    expect(onOther).not.toHaveBeenCalled();
  });
});

describe("RealtimeConnection ref-counted topic subscriptions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("sends one subscribe for two concurrent subscribers, and one unsubscribe once both release", () => {
    const { connection, sockets } = buildHarness();
    connection.start();
    sockets[0]?.open();

    const release1 = connection.subscribeTopic("role:librarian");
    const release2 = connection.subscribeTopic("role:librarian");

    const subscribeMessages = sockets[0]?.sent.filter(
      (m) => (m as { action: string }).action === "subscribe",
    );
    expect(subscribeMessages).toHaveLength(1);
    expect(subscribeMessages?.[0]).toEqual({ action: "subscribe", topics: ["role:librarian"] });

    release1();
    const unsubscribeMessages = sockets[0]?.sent.filter(
      (m) => (m as { action: string }).action === "unsubscribe",
    );
    expect(unsubscribeMessages).toHaveLength(0);

    release2();
    const unsubscribeMessagesAfter = sockets[0]?.sent.filter(
      (m) => (m as { action: string }).action === "unsubscribe",
    );
    expect(unsubscribeMessagesAfter).toHaveLength(1);
    expect(unsubscribeMessagesAfter?.[0]).toEqual({
      action: "unsubscribe",
      topics: ["role:librarian"],
    });

    // Releasing an already-released subscription is a harmless no-op.
    release2();
    expect(
      sockets[0]?.sent.filter((m) => (m as { action: string }).action === "unsubscribe"),
    ).toHaveLength(1);
  });

  it("re-subscribes every still-held topic on the next hello (a new connection has none of it)", () => {
    const { connection, sockets } = buildHarness();
    connection.start();
    sockets[0]?.open();
    connection.subscribeTopic("duty:homeroom:class-1");
    sockets[0]?.drop();
    jest.advanceTimersByTime(500);

    sockets[1]?.open();
    sockets[1]?.receive(helloMessage());

    const subscribeMessages = sockets[1]?.sent.filter(
      (m) => (m as { action: string }).action === "subscribe",
    );
    expect(subscribeMessages).toEqual([{ action: "subscribe", topics: ["duty:homeroom:class-1"] }]);
  });
});

describe("RealtimeConnection AppState transitions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("closes the socket after the background grace period elapses", () => {
    const { connection, sockets, sendAppState } = buildHarness({ backgroundGraceMs: 5_000 });
    connection.start();
    sockets[0]?.open();

    sendAppState("background");
    jest.advanceTimersByTime(4_999);
    expect(connection.getStatus()).toBe("open");

    jest.advanceTimersByTime(1);
    expect(connection.getStatus()).toBe("closed");
    // Backgrounding is an intentional close, not a dropped connection: it
    // must not also schedule a backoff reconnect on its own.
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it("cancels the pending background close if the app returns to foreground first", () => {
    const { connection, sockets, sendAppState } = buildHarness({ backgroundGraceMs: 5_000 });
    connection.start();
    sockets[0]?.open();

    sendAppState("background");
    jest.advanceTimersByTime(3_000);
    sendAppState("active");
    jest.advanceTimersByTime(5_000);

    expect(connection.getStatus()).toBe("open");
    expect(sockets).toHaveLength(1);
  });

  it("reconnects and resyncs when the app returns to foreground after a background close", () => {
    const { connection, sockets, sendAppState } = buildHarness({ backgroundGraceMs: 5_000 });
    const resync = jest.fn();
    connection.onResync(resync);

    connection.start();
    sockets[0]?.open();
    sockets[0]?.receive(helloMessage());

    sendAppState("background");
    jest.advanceTimersByTime(5_000);
    expect(connection.getStatus()).toBe("closed");

    sendAppState("active");
    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    sockets[1]?.receive(helloMessage());

    expect(resync).toHaveBeenCalledTimes(1);
  });
});

describe("RealtimeConnection token change", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("reconnects immediately with the new token, closing the old socket first", () => {
    const { connection, sockets, setToken } = buildHarness();
    connection.start();
    sockets[0]?.open();

    setToken("token-2");
    connection.notifyTokenChanged();

    expect(sockets).toHaveLength(2);
    // The old socket's own close must not also trigger a backoff retry --
    // notifyTokenChanged already started the replacement.
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });

  it("is a no-op when the token has not actually changed", () => {
    const { connection, sockets } = buildHarness();
    connection.start();
    sockets[0]?.open();

    connection.notifyTokenChanged();

    expect(sockets).toHaveLength(1);
  });

  it("closes and waits, without opening a socket, when the token is cleared (sign-out)", () => {
    const { connection, sockets, setToken } = buildHarness();
    connection.start();
    sockets[0]?.open();

    setToken(null);
    connection.notifyTokenChanged();

    expect(connection.getStatus()).toBe("idle");
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });
});
