import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExportMonthlyRecapMutation, useMonthlyRecapQuery } from "./api";

const get = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ GET: get }) }));

function wrapper({ children }: { children: ReactNode }): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("monthly visitor recap", () => {
  beforeEach(() => {
    get.mockResolvedValue({ total_visits: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // The endpoint declares month as a full date; the picker's "2026-11" was
  // refused with 400 VALIDATION_FAILED.
  it("asks for the month by its first day", async () => {
    renderHook(() => useMonthlyRecapQuery("2026-11"), { wrapper });

    await waitFor(() => {
      expect(get).toHaveBeenCalled();
    });
    expect(get).toHaveBeenCalledWith("/v1/visitors/recap/monthly", {
      params: { query: { month: "2026-11-01" } },
    });
  });

  it("exports the month by its first day", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("x", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    // jsdom has no object URLs; the download only needs them to exist.
    URL.createObjectURL = () => "blob:recap";
    URL.revokeObjectURL = vi.fn();

    const { result } = renderHook(() => useExportMonthlyRecapMutation(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        month: "2026-11",
        options: { format: "xlsx", title: "", showLetterhead: false, columns: [] },
      }),
    );

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(new URL(url, "http://localhost").searchParams.get("month")).toBe("2026-11-01");
  });
});
