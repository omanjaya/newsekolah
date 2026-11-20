import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ POST: post }) }));

import { useRecordLibraryVisitMutation, useScanLibraryKioskVisitMutation } from "./visits-api";

const VISITS_REPORT = ["library", "reports", "visits", "2026-11-01", "2026-11-21"];
const SUMMARY_REPORT = ["library", "reports", "summary", "2026-11-01", "2026-11-21"];
const DASHBOARD = ["library", "dashboard"];
const GUEST_BOOK = ["library", "visits", "2026-11-21", "2026-11-21", 20, 0];

function setup() {
  // The app's own stale time: a report opened again within it is served
  // from the cache unless something marks it stale.
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
  for (const key of [VISITS_REPORT, SUMMARY_REPORT, DASHBOARD, GUEST_BOOK]) {
    queryClient.setQueryData(key, { total: 3 });
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function expectVisitCountsStale(queryClient: QueryClient) {
  for (const key of [VISITS_REPORT, SUMMARY_REPORT, DASHBOARD, GUEST_BOOK]) {
    expect(queryClient.getQueryState(key)?.isInvalidated, key.join("/")).toBe(true);
  }
}

// The visits report kept showing 3 right after a 4th visit was recorded:
// recording a visit only marked the guest book stale.
describe("recording a library visit", () => {
  it("marks the visit reports and the dashboard stale, not only the guest book", async () => {
    post.mockResolvedValue({ id: "v1" });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useRecordLibraryVisitMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ kind: "guest", guest_name: "Tamu" } as never);
    });

    expectVisitCountsStale(queryClient);
  });

  it("does the same for a visit checked in at the kiosk", async () => {
    post.mockResolvedValue({ id: "v2" });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useScanLibraryKioskVisitMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ token: "t" });
    });

    expectVisitCountsStale(queryClient);
  });
});
