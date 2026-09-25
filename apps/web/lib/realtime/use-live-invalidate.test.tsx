import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveEnvelope } from "./types";
import { useLiveInvalidate } from "./use-live-invalidate";

interface FakeListener {
  matches: (type: string) => boolean;
  onMatch: (envelope: LiveEnvelope) => void;
  resync: () => void;
}

/**
 * This file exercises useLiveInvalidate in isolation from
 * LiveSocketProvider's actual WebSocket/timer machinery (already covered
 * end-to-end by live-socket-provider.test.tsx) by replacing
 * useLiveSocketContext with a minimal fake registry -- see vi.hoisted's
 * doc comment for why the shared state has to be built this way rather
 * than a plain module-scope `let`.
 */
const state = vi.hoisted(() => ({ listeners: [] as FakeListener[] }));

vi.mock("./live-socket-provider", () => ({
  useLiveSocketContext: () => ({
    status: "open",
    registerListener: (listener: FakeListener) => {
      state.listeners.push(listener);
      return () => {
        state.listeners = state.listeners.filter((l) => l !== listener);
      };
    },
    subscribeTopic: () => () => undefined,
  }),
}));

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  state.listeners.length = 0;
});

describe("useLiveInvalidate", () => {
  it("registers once, and keeps reading the latest eventTypes/queryKeys through re-renders with new array literals", () => {
    const queryClient = new QueryClient();
    const { rerender } = renderHook(
      ({ n }: { n: number }) => {
        useLiveInvalidate([`event_${n}`], [["key", n]]);
      },
      { wrapper: wrapper(queryClient), initialProps: { n: 1 } },
    );
    expect(state.listeners).toHaveLength(1);

    rerender({ n: 2 });
    // Still the same single registration -- a new array literal each
    // render must not tear down and re-create the listener.
    expect(state.listeners).toHaveLength(1);
    expect(state.listeners[0]?.matches("event_2")).toBe(true);
    expect(state.listeners[0]?.matches("event_1")).toBe(false);
  });

  it("invalidates every query key and runs onEvent when a matching event is dispatched", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const onEvent = vi.fn();
    renderHook(
      () => {
        useLiveInvalidate(["foo"], [["a"], ["b"]], { onEvent });
      },
      {
        wrapper: wrapper(queryClient),
      },
    );

    const envelope: LiveEnvelope = { type: "foo", payload: { x: 1 } };
    state.listeners[0]?.onMatch(envelope);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["a"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["b"] });
    expect(onEvent).toHaveBeenCalledWith(envelope);
  });

  it("resync invalidates the query keys without running onEvent", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const onEvent = vi.fn();
    renderHook(
      () => {
        useLiveInvalidate(["foo"], [["a"]], { onEvent });
      },
      {
        wrapper: wrapper(queryClient),
      },
    );

    state.listeners[0]?.resync();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["a"] });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("unregisters its listener on unmount", () => {
    const queryClient = new QueryClient();
    const { unmount } = renderHook(
      () => {
        useLiveInvalidate(["foo"], [["a"]]);
      },
      {
        wrapper: wrapper(queryClient),
      },
    );
    expect(state.listeners).toHaveLength(1);

    unmount();

    expect(state.listeners).toHaveLength(0);
  });
});
