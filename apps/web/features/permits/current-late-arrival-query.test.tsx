import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentLateArrivalQuery } from "./api";

const get = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({
  useApiClient: () => ({ GET: get }),
}));

function wrapper({ children }: { children: ReactNode }): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  get.mockReset();
});

describe("useCurrentLateArrivalQuery", () => {
  it("resolves the API's 204 'none in progress' answer to null, not an error", async () => {
    // A 204 has no body: the client resolves undefined.
    get.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCurrentLateArrivalQuery(), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toBeNull();
    expect(get).toHaveBeenCalledWith("/v1/late-arrivals/current");
  });

  it("returns the late arrival in progress", async () => {
    const detail = { instance: { id: "late-1" }, reason: "Ban bocor" };
    get.mockResolvedValue(detail);
    const { result } = renderHook(() => useCurrentLateArrivalQuery(), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual(detail);
  });
});
