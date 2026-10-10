import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useActionInboxCount, useActionInboxSummary } from "./use-action-inbox-count";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  profileKind: "teacher",
  counts: vi.fn(),
  live: vi.fn(),
}));

vi.mock("../../lib/session/session-provider", () => ({
  useCan: (code: string) => mocks.permissions.has(code),
  useSession: () => ({ me: { profile_kind: mocks.profileKind } }),
}));
vi.mock("./api", () => ({ useInboxCountsQuery: mocks.counts }));
vi.mock("./realtime", () => ({ useInboxCountsLive: mocks.live }));

function counts(data: Partial<Record<string, number>>) {
  return {
    data: { leave: 0, exit: 0, late: 0, warning_letters: 0, total: 0, ...data },
    isLoading: false,
    isError: false,
  };
}

beforeEach(() => {
  mocks.permissions = new Set();
  mocks.profileKind = "student";
  mocks.counts
    .mockReset()
    .mockReturnValue(counts({ leave: 2, exit: 1, late: 3, warning_letters: 4 }));
  mocks.live.mockReset();
});

describe("useActionInboxCount", () => {
  it("is zero and makes no request without any permission", () => {
    const { result } = renderHook(() => useActionInboxCount());
    expect(result.current).toBe(0);
    expect(mocks.counts).toHaveBeenCalledWith(false, true);
  });

  it("reads every number from the one counts query", () => {
    mocks.permissions = new Set(["review_leave_requests", "scan_exit_permits"]);
    mocks.profileKind = "teacher";
    const { result } = renderHook(() => useActionInboxSummary());
    expect(mocks.counts).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({
      leave: 2,
      exit: 1,
      late: 3,
      warningLetters: 0,
      total: 6,
    });
  });

  it("keeps a queue the reader has no screen for at zero", () => {
    mocks.permissions = new Set(["review_leave_requests"]);
    const { result } = renderHook(() => useActionInboxSummary());
    expect(result.current).toMatchObject({
      leave: 2,
      exit: 0,
      late: 0,
      warningLetters: 0,
      total: 2,
    });
  });

  it("counts late arrivals for teachers and staff", () => {
    mocks.profileKind = "staff";
    const { result } = renderHook(() => useActionInboxCount());
    expect(result.current).toBe(3);
  });

  it("counts warning letters for issuers", () => {
    mocks.permissions = new Set(["issue_warning_letters"]);
    const { result } = renderHook(() => useActionInboxSummary());
    expect(result.current.warningLetters).toBe(4);
    expect(result.current.total).toBe(4);
  });

  it("reports loading and error only while the query is enabled", () => {
    mocks.counts.mockReturnValue({ data: undefined, isLoading: true, isError: true });
    const idle = renderHook(() => useActionInboxSummary());
    expect(idle.result.current).toMatchObject({ isLoading: false, isError: false, total: 0 });

    mocks.permissions = new Set(["review_leave_requests"]);
    const active = renderHook(() => useActionInboxSummary());
    expect(active.result.current).toMatchObject({ isLoading: true, isError: true, total: 0 });
  });

  it("polls and listens for realtime only from the app shell hook", () => {
    mocks.permissions = new Set(["review_leave_requests"]);

    renderHook(() => useActionInboxSummary());
    expect(mocks.counts).toHaveBeenLastCalledWith(true, false);
    expect(mocks.live).toHaveBeenLastCalledWith(expect.anything(), false);

    renderHook(() => useActionInboxCount());
    expect(mocks.counts).toHaveBeenLastCalledWith(true, true);
    expect(mocks.live).toHaveBeenLastCalledWith(expect.anything(), true);
  });
});
