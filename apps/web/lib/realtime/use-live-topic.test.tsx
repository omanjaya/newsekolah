import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Same isolation approach as use-live-invalidate.test.tsx -- see its doc comment. */
const state = vi.hoisted(() => ({
  subscribeCalls: [] as string[],
  unsubscribeCalls: [] as string[],
}));

vi.mock("./live-socket-provider", () => ({
  useLiveSocketContext: () => ({
    status: "open",
    registerListener: () => () => undefined,
    subscribeTopic: (topic: string) => {
      state.subscribeCalls.push(topic);
      return () => {
        state.unsubscribeCalls.push(topic);
      };
    },
  }),
}));

import { useLiveTopic } from "./use-live-topic";

beforeEach(() => {
  state.subscribeCalls = [];
  state.unsubscribeCalls = [];
});

describe("useLiveTopic", () => {
  it("subscribes on mount and unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => {
      useLiveTopic("role:librarian");
    });

    expect(state.subscribeCalls).toEqual(["role:librarian"]);
    expect(state.unsubscribeCalls).toEqual([]);

    unmount();

    expect(state.unsubscribeCalls).toEqual(["role:librarian"]);
  });

  it("re-subscribes when the topic string itself changes", () => {
    const { rerender } = renderHook(
      ({ topic }: { topic: string }) => {
        useLiveTopic(topic);
      },
      {
        initialProps: { topic: "duty:homeroom:class-1" },
      },
    );
    expect(state.subscribeCalls).toEqual(["duty:homeroom:class-1"]);

    rerender({ topic: "duty:homeroom:class-2" });

    expect(state.unsubscribeCalls).toEqual(["duty:homeroom:class-1"]);
    expect(state.subscribeCalls).toEqual(["duty:homeroom:class-1", "duty:homeroom:class-2"]);
  });

  it("never subscribes for an undefined or empty topic", () => {
    const { rerender } = renderHook(
      ({ topic }: { topic: string | undefined }) => {
        useLiveTopic(topic);
      },
      {
        initialProps: { topic: undefined as string | undefined },
      },
    );
    expect(state.subscribeCalls).toEqual([]);

    rerender({ topic: "" });
    expect(state.subscribeCalls).toEqual([]);

    rerender({ topic: "role:admin" });
    expect(state.subscribeCalls).toEqual(["role:admin"]);
  });
});
