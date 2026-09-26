import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const libraryDashboardQuery = vi.hoisted(() => vi.fn());

vi.mock("../../../library/dashboard-api", () => ({
  useLibraryDashboardQuery: libraryDashboardQuery,
}));
vi.mock("../../../library/api", () => ({
  useLibraryTitleQuery: () => ({ data: { title: "Judul Buku" }, isLoading: false }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, params?: Record<string, unknown>) =>
        params ? `${key}::${JSON.stringify(params)}` : key,
      { has: () => true },
    ),
  useLocale: () => "id",
}));

import type { Me } from "../types";

import { useLibrarianBlock } from "./librarian";

const me = { permissions: [], roles: [], duties: [] } as unknown as Me;

const baseData = {
  summary: {
    titles: 1,
    copies: 1,
    available: 1,
    on_loan: 1,
    overdue: 2,
    members: 1,
    active_members: 1,
    visits_today: 1,
    loans_today: 4,
    returns_today: 3,
    unpaid_fines_total: 0,
  },
  latest_loans: [],
  longest_overdue: [] as {
    id: string;
    copy_id: string;
    title_id: string;
    member_user_id: string;
    borrowed_at: string;
    due_on: string;
    renewal_count: number;
    status: string;
    fine_amount: number;
  }[],
  popular_titles: [],
  series: [],
};

beforeEach(() => {
  libraryDashboardQuery.mockReset();
  libraryDashboardQuery.mockReturnValue({
    data: baseData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe("useLibrarianBlock", () => {
  it("returns EMPTY_BLOCK and disables the query when inactive", () => {
    const { result } = renderHook(() => useLibrarianBlock(me, false));

    expect(result.current).toEqual({ tiles: [], left: [], right: [] });
    expect(libraryDashboardQuery).toHaveBeenCalledWith(false);
  });

  it("builds the circulation-desk hero from today's counts", () => {
    const { result } = renderHook(() => useLibrarianBlock(me, true));

    expect(result.current.hero?.title).toContain('"loans":4');
    expect(result.current.hero?.title).toContain('"returns":3');
    expect(result.current.hero?.meta).toContain('"overdue":2');
    expect(result.current.hero?.action).toEqual({
      label: "hero.action",
      href: "/library/desk",
    });
  });

  it("keeps the overdue tile in sync with the summary", () => {
    const { result } = renderHook(() => useLibrarianBlock(me, true));
    const overdueTile = result.current.tiles.find((tile) => tile.key === "library.overdue");

    expect(overdueTile?.value).toBe("2");
    expect(overdueTile?.tone).toBe("red");
  });

  it("hides the hero while loading", () => {
    libraryDashboardQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { result } = renderHook(() => useLibrarianBlock(me, true));

    expect(result.current.hero).toBeUndefined();
    expect(result.current.tiles).toEqual([]);
  });

  it("shows retry on the overdue card when the query fails", () => {
    const refetch = vi.fn();
    libraryDashboardQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    const { result } = renderHook(() => useLibrarianBlock(me, true));
    const overdueSlot = result.current.right.find((slot) => slot.key === "library.overdue");
    render(<>{overdueSlot?.node}</>);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("lists the longest-overdue loans", () => {
    libraryDashboardQuery.mockReturnValue({
      data: {
        ...baseData,
        longest_overdue: [
          {
            id: "loan-1",
            copy_id: "copy-1",
            title_id: "title-1",
            member_user_id: "member-1",
            borrowed_at: "2026-08-01T00:00:00Z",
            due_on: "2026-08-15",
            renewal_count: 0,
            status: "active",
            fine_amount: 0,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useLibrarianBlock(me, true));
    const overdueSlot = result.current.right.find((slot) => slot.key === "library.overdue");
    render(<>{overdueSlot?.node}</>);

    expect(screen.getByText("Judul Buku")).toBeInTheDocument();
  });
});
