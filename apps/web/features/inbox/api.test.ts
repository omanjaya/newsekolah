import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INBOX_COUNTS_POLL_MS, useInboxCountsQuery } from "./api";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ GET: mocks.get }) }));

function options(enabled: boolean, poll: boolean) {
  renderHook(() => useInboxCountsQuery(enabled, poll));
  return mocks.useQuery.mock.calls.at(-1)?.[0] as {
    queryKey: unknown;
    queryFn: () => unknown;
    enabled: boolean;
    refetchInterval: () => number | false;
    refetchIntervalInBackground: boolean;
  };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  mocks.useQuery.mockReset().mockReturnValue({});
  mocks.get.mockReset();
  setVisibility("visible");
});

afterEach(() => {
  Reflect.deleteProperty(document, "visibilityState");
});

describe("useInboxCountsQuery", () => {
  it("is one GET of the counts endpoint", () => {
    const opts = options(true, true);
    expect(opts.queryKey).toEqual(["inbox", "counts"]);
    opts.queryFn();
    expect(mocks.get).toHaveBeenCalledWith("/v1/inbox/counts");
  });

  it("passes the enabled flag through", () => {
    expect(options(false, true).enabled).toBe(false);
  });

  it("polls every 120 s while the document is visible and never in the background", () => {
    const opts = options(true, true);
    expect(INBOX_COUNTS_POLL_MS).toBe(120_000);
    expect(opts.refetchInterval()).toBe(120_000);
    expect(opts.refetchIntervalInBackground).toBe(false);
  });

  it("pauses polling while the document is hidden", () => {
    const opts = options(true, true);
    setVisibility("hidden");
    expect(opts.refetchInterval()).toBe(false);
  });

  it("does not poll for display-only readers", () => {
    expect(options(true, false).refetchInterval()).toBe(false);
  });
});
