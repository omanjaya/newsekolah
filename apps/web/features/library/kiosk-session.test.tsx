import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useKioskMemberSession } from "./kiosk-session";

const borrowingStatus = vi.hoisted(() => vi.fn());
const policy = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ GET: vi.fn() }) }));
vi.mock("./api", () => ({
  useMemberLoanHistoryQuery: () => ({
    data: { data: [{ id: "l1", status: "active", title_id: "t1", copy_id: "c1" }] },
    isLoading: false,
  }),
  useLibraryPolicyQuery: policy,
}));
vi.mock("./members-api", () => ({
  useLibraryMemberBorrowingStatusQuery: borrowingStatus,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useKioskMemberSession", () => {
  it("counts against the member's own limit, not the school-wide default", () => {
    policy.mockReturnValue({ data: { max_active_loans: 3 } });
    borrowingStatus.mockReturnValue({
      data: {
        allow_loans: true,
        max_loan_items: 2,
        max_loan_days: 7,
        active_loan_count: 1,
        has_unpaid_fine: false,
        unpaid_fine_blocks_loans: false,
      },
    });

    const { result } = renderHook(() => useKioskMemberSession("u1"), { wrapper });

    expect(borrowingStatus).toHaveBeenCalledWith("u1");
    expect(result.current.activeLoanCount).toBe(1);
    expect(result.current.maxActiveLoans).toBe(2);
  });

  it("shows no limit until the member's own one is known", () => {
    borrowingStatus.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useKioskMemberSession("u1"), { wrapper });

    expect(result.current.maxActiveLoans).toBeUndefined();
  });
});
