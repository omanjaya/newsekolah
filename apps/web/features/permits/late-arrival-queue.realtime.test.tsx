import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/env", () => ({ API_URL: "http://api.test" }));

vi.mock("../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { profile_kind: "teacher", roles: [], duties: [] } }),
  useCan: () => false,
}));

const getMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({
  useApiClient: () => ({ GET: getMock }),
}));

import { setAccessToken } from "../../lib/api/access-token";
import { LiveSocketProvider } from "../../lib/realtime/live-socket-provider";
import { MockWebSocket } from "../../lib/realtime/mock-websocket";

import { useLateArrivalQueueQuery } from "./api";

const INITIAL_CONNECT_DELAY_MS = 1_500;

function Probe() {
  useLateArrivalQueueQuery();
  return null;
}

function harness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <QueryClientProvider client={queryClient}>
        <LiveSocketProvider userId="user-1">{children}</LiveSocketProvider>
      </QueryClientProvider>
    );
  }
  return Wrapper;
}

beforeEach(() => {
  MockWebSocket.reset();
  vi.stubGlobal("WebSocket", MockWebSocket);
  setAccessToken("token-a");
  getMock.mockReset();
  getMock.mockResolvedValue({ data: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

/**
 * Chunk E's required integration test (docs/analysis/realtime-plan-2026-09-25.md):
 * a real `useLateArrivalQueueQuery` (real TanStack Query, real
 * LiveSocketProvider, real useLiveTopic/useLiveInvalidate -- only the API
 * client and session are stubbed) refetches once a `late_arrival.opened`
 * envelope arrives on the `duty:picket` topic it subscribed to on mount,
 * exercising docs/analysis/realtime-plan-2026-09-25.md section 4.4 row 1
 * end to end instead of only asserting that a listener was registered
 * (covered per-feature by realtime.test.ts files next to this one).
 */
describe("useLateArrivalQueueQuery realtime wiring (integration)", () => {
  it("refetches the review queue when late_arrival.opened arrives on duty:picket", async () => {
    const Wrapper = harness();
    render(<Probe />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    await new Promise((resolve) => setTimeout(resolve, INITIAL_CONNECT_DELAY_MS + 50));
    const ws = MockWebSocket.latest();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.message({
        type: "hello",
        topic: "user:tenant-1:user-1",
        at: new Date().toISOString(),
        payload: { connection_id: "connection-1" },
      });
    });

    expect(ws.sentActions()).toContainEqual({ action: "subscribe", topics: ["duty:picket"] });

    // The hello itself resyncs every useLiveInvalidate listener now (live-
    // socket-provider.tsx's doc comment: even the very first hello can
    // land after this query's on-mount fetch already ran), so this is
    // already a second fetch before the late_arrival.opened event below
    // triggers a third.
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(2);
    });

    act(() => {
      ws.message({
        type: "late_arrival.opened",
        topic: "duty:picket",
        at: new Date().toISOString(),
        payload: { instance_id: "late-arrival-1" },
      });
    });

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(3);
    });
  }, 10_000);
});
