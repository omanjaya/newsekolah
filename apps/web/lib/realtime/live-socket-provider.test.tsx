import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({ API_URL: "http://api.test" }));

vi.mock("../api/access-token", () => {
  let listeners: ((token: string | null) => void)[] = [];
  return {
    getAccessToken: vi.fn(() => "token-a"),
    subscribeAccessToken: vi.fn((listener: (token: string | null) => void) => {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    }),
    __emitToken: (token: string | null) => {
      for (const listener of [...listeners]) listener(token);
    },
    __reset: () => {
      listeners = [];
    },
  };
});

import { getAccessToken } from "../api/access-token";
import * as accessTokenMock from "../api/access-token";

import { LiveSocketProvider, useLiveSocketContext } from "./live-socket-provider";
import { MockWebSocket } from "./mock-websocket";
import type { LiveSocketStatus } from "./types";
import { useLiveInvalidate } from "./use-live-invalidate";
import { useLiveTopic } from "./use-live-topic";

// Mirrors live-socket-provider.tsx's own private constants -- this file
// tests the provider as a black box, through its wire behavior, not its
// internals, so these are duplicated rather than exported.
const INITIAL_CONNECT_DELAY_MS = 1_500;
const HIDDEN_PAUSE_AFTER_MS = 60_000;

function emitToken(token: string | null) {
  (accessTokenMock as unknown as { __emitToken: (t: string | null) => void }).__emitToken(token);
}

function resetTokenListeners() {
  (accessTokenMock as unknown as { __reset: () => void }).__reset();
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** Advances past the initial connect delay and returns the freshly created socket. */
function firstConnect(): MockWebSocket {
  act(() => {
    vi.advanceTimersByTime(INITIAL_CONNECT_DELAY_MS);
  });
  return MockWebSocket.latest();
}

/** Drives one socket through open + hello, LiveSocketProvider's definition of "connected". */
function sayHello(ws: MockWebSocket, connectionId = "connection-1") {
  act(() => {
    ws.open();
  });
  act(() => {
    ws.message({
      type: "hello",
      topic: "user:tenant-1:user-1",
      at: new Date().toISOString(),
      payload: { connection_id: connectionId },
    });
  });
}

function createHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <QueryClientProvider client={queryClient}>
        <LiveSocketProvider userId="user-1">{children}</LiveSocketProvider>
      </QueryClientProvider>
    );
  }
  return { Wrapper, queryClient };
}

function StatusProbe({ onStatus }: { onStatus: (status: LiveSocketStatus) => void }) {
  const { status } = useLiveSocketContext();
  useEffect(() => {
    onStatus(status);
  }, [status, onStatus]);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.reset();
  vi.stubGlobal("WebSocket", MockWebSocket);
  resetTokenListeners();
  vi.mocked(getAccessToken).mockReturnValue("token-a");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("LiveSocketProvider: dispatch by event type", () => {
  it("invokes only the listener whose event types match, leaving others untouched", () => {
    const { Wrapper } = createHarness();
    const matched = vi.fn();
    const ignored = vi.fn();

    renderHook(
      () => {
        useLiveInvalidate(["foo_event"], [["foo"]], { onEvent: matched });
        useLiveInvalidate(["bar_event"], [["bar"]], { onEvent: ignored });
      },
      { wrapper: Wrapper },
    );

    const ws = firstConnect();
    sayHello(ws);

    act(() => {
      ws.message({ type: "foo_event", payload: { x: 1 } });
    });

    expect(matched).toHaveBeenCalledTimes(1);
    expect(matched.mock.calls[0]?.[0]).toMatchObject({ type: "foo_event", payload: { x: 1 } });
    expect(ignored).not.toHaveBeenCalled();
  });

  it("also dispatches the flat (non-Envelope-wrapped) shape a not-yet-migrated publisher sends", () => {
    const { Wrapper } = createHarness();
    const onEvent = vi.fn();
    renderHook(
      () => {
        useLiveInvalidate(["classroom_entry_scanned"], [["permits"]], { onEvent });
      },
      {
        wrapper: Wrapper,
      },
    );

    const ws = firstConnect();
    sayHello(ws);

    act(() => {
      ws.message({ type: "classroom_entry_scanned", student_name: "Budi", nis: "1" });
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      type: "classroom_entry_scanned",
      payload: { student_name: "Budi", nis: "1" },
    });
  });
});

describe("LiveSocketProvider: ref-counted topic subscriptions", () => {
  function Consumer() {
    useLiveTopic("role:librarian");
    return null;
  }

  it("sends one subscribe for N mounted consumers of the same topic and one unsubscribe once the last unmounts", () => {
    const { Wrapper } = createHarness();
    const { rerender } = render(
      <Wrapper>
        <div />
      </Wrapper>,
    );
    const ws = firstConnect();
    sayHello(ws);

    rerender(
      <Wrapper>
        <Consumer />
      </Wrapper>,
    );
    expect(
      ws
        .sentActions()
        .filter((m) => m.action === "subscribe" && m.topics.includes("role:librarian")),
    ).toHaveLength(1);

    rerender(
      <Wrapper>
        <Consumer />
        <Consumer />
      </Wrapper>,
    );
    // Second mount only increments the ref count -- no second subscribe message.
    expect(ws.sentActions().filter((m) => m.action === "subscribe")).toHaveLength(1);

    rerender(
      <Wrapper>
        <Consumer />
      </Wrapper>,
    );
    // One of two unmounts: ref count 2 -> 1, still held, no unsubscribe yet.
    expect(ws.sentActions().filter((m) => m.action === "unsubscribe")).toHaveLength(0);

    rerender(<Wrapper>{null}</Wrapper>);
    // Last unmount: ref count 1 -> 0, now released.
    expect(
      ws
        .sentActions()
        .filter((m) => m.action === "unsubscribe" && m.topics.includes("role:librarian")),
    ).toHaveLength(1);
  });

  it("re-sends every currently held topic on every hello, since a fresh connection grants none by default", () => {
    const { Wrapper } = createHarness();
    render(
      <Wrapper>
        <Consumer />
      </Wrapper>,
    );

    const ws1 = firstConnect();
    sayHello(ws1);
    expect(
      ws1
        .sentActions()
        .some((m) => m.action === "subscribe" && m.topics.includes("role:librarian")),
    ).toBe(true);

    act(() => {
      ws1.close();
    });
    act(() => {
      vi.advanceTimersByTime(1_000); // attempt 0's ceiling (reconnect.ts)
    });
    const ws2 = MockWebSocket.latest();
    expect(ws2).not.toBe(ws1);
    sayHello(ws2, "connection-2");

    expect(
      ws2
        .sentActions()
        .some((m) => m.action === "subscribe" && m.topics.includes("role:librarian")),
    ).toBe(true);
  });
});

describe("LiveSocketProvider: resync on reconnect", () => {
  it("does not resync on the very first hello, but does on every hello after that", () => {
    const { Wrapper, queryClient } = createHarness();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const onEvent = vi.fn();

    renderHook(
      () => {
        useLiveInvalidate(["foo_event"], [["foo"]], { onEvent });
      },
      {
        wrapper: Wrapper,
      },
    );

    const ws1 = firstConnect();
    sayHello(ws1);
    expect(invalidateSpy).not.toHaveBeenCalled();

    act(() => {
      ws1.close();
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    const ws2 = MockWebSocket.latest();
    sayHello(ws2, "connection-2");

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["foo"] });
    // Resync invalidates the cache, it never re-runs the event's own side effect.
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe("LiveSocketProvider: backoff with jitter and no give-up", () => {
  it("keeps scheduling new attempts well past the old 6-attempt cutoff", () => {
    const { Wrapper } = createHarness();
    const statuses: LiveSocketStatus[] = [];
    render(
      <Wrapper>
        <StatusProbe
          onStatus={(s) => {
            statuses.push(s);
          }}
        />
      </Wrapper>,
    );

    firstConnect();
    // Never call open(): every handshake fails outright, repeatedly, well
    // past MAX_HANDSHAKE_FAILURES and the old MAX_RECONNECT_ATTEMPTS (6).
    for (let round = 0; round < 10; round += 1) {
      act(() => {
        MockWebSocket.latest().close();
      });
      // 30s safely covers any attempt's actual (jittered) delay, since the
      // ceiling never exceeds MAX_DELAY_MS (reconnect.ts).
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
    }

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(10);
    // Never reached "open" in this test (the handshake always fails before
    // onopen), so status stays "connecting"/"reconnecting" throughout --
    // the point is that it keeps retrying, never settling permanently into
    // "idle" (its only pre-effect/no-session value) as a give-up state.
    expect(["connecting", "reconnecting"]).toContain(statuses.at(-1));
  });

  it("reconnects eagerly once a fresh access token appears after repeated handshake failures", () => {
    const { Wrapper } = createHarness();
    render(
      <Wrapper>
        <div />
      </Wrapper>,
    );

    firstConnect();
    // MAX_HANDSHAKE_FAILURES worth of failures with the same token.
    act(() => {
      MockWebSocket.latest().close();
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    act(() => {
      MockWebSocket.latest().close();
    });

    const countBeforeRefresh = MockWebSocket.instances.length;
    vi.mocked(getAccessToken).mockReturnValue("token-b");
    act(() => {
      emitToken("token-b");
    });

    // No timer advance needed: the token-change listener reconnects immediately.
    expect(MockWebSocket.instances.length).toBe(countBeforeRefresh + 1);
  });
});

describe("LiveSocketProvider: visibility pause/resume", () => {
  it("closes the socket and reports paused after the tab stays hidden long enough", () => {
    const { Wrapper } = createHarness();
    const statuses: LiveSocketStatus[] = [];
    render(
      <Wrapper>
        <StatusProbe
          onStatus={(s) => {
            statuses.push(s);
          }}
        />
      </Wrapper>,
    );

    const ws = firstConnect();
    sayHello(ws);

    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(HIDDEN_PAUSE_AFTER_MS);
    });

    expect(ws.closed).toBe(true);
    expect(statuses.at(-1)).toBe("paused");
  });

  it("does not pause a tab that is hidden only briefly", () => {
    const { Wrapper } = createHarness();
    const ws = (() => {
      render(
        <Wrapper>
          <div />
        </Wrapper>,
      );
      const socket = firstConnect();
      sayHello(socket);
      return socket;
    })();

    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(HIDDEN_PAUSE_AFTER_MS - 1);
    });
    setVisibility("visible");
    act(() => {
      vi.advanceTimersByTime(HIDDEN_PAUSE_AFTER_MS);
    });

    expect(ws.closed).toBe(false);
  });

  it("reconnects immediately (no backoff wait) once the tab becomes visible again", () => {
    const { Wrapper } = createHarness();
    render(
      <Wrapper>
        <div />
      </Wrapper>,
    );
    const ws = firstConnect();
    sayHello(ws);

    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(HIDDEN_PAUSE_AFTER_MS);
    });
    expect(MockWebSocket.instances.length).toBe(1);

    setVisibility("visible");

    expect(MockWebSocket.instances.length).toBe(2);
  });
});
