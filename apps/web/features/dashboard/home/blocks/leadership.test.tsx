import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dashboardQuery = vi.hoisted(() => vi.fn());
const atRiskQuery = vi.hoisted(() => vi.fn());
const directoryQuery = vi.hoisted(() => vi.fn());
const classesQuery = vi.hoisted(() => vi.fn());

vi.mock("../../api", () => ({ useAdminDashboardQuery: dashboardQuery }));
vi.mock("../../../analytics/api", () => ({ useAtRiskStudentsQuery: atRiskQuery }));
vi.mock("../../../reference/api", () => ({
  useDirectoryQuery: directoryQuery,
  useClassesQuery: classesQuery,
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, params?: Record<string, unknown>) =>
        params ? `${key}::${JSON.stringify(params)}` : key,
      { has: () => true },
    ),
  useFormatter: () => ({ number: (value: number) => String(value) }),
  useLocale: () => "id",
}));

import type { Me } from "../types";

import { useLeadershipBlock } from "./leadership";

const me = { permissions: [], roles: [], duties: [] } as unknown as Me;

const baseDashboard = {
  active_users: { teacher: 5, staff: 2, student: 40 },
  pending: { leave_request: 0, exit_permit: 0, late_arrival: 0 },
  online_by_role: {},
  login_histogram: new Array(24).fill(0) as number[],
};

beforeEach(() => {
  dashboardQuery.mockReset();
  atRiskQuery.mockReset();
  directoryQuery.mockReset();
  classesQuery.mockReset();
  directoryQuery.mockReturnValue({ data: { data: [] } });
  classesQuery.mockReturnValue({ data: { data: [] } });
  atRiskQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  dashboardQuery.mockReturnValue({
    data: baseDashboard,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe("useLeadershipBlock", () => {
  it("returns EMPTY_BLOCK and disables every query when inactive", () => {
    const { result } = renderHook(() => useLeadershipBlock(me, false));

    expect(result.current).toEqual({ tiles: [], left: [], right: [] });
    expect(dashboardQuery).toHaveBeenCalledWith(false);
    expect(atRiskQuery).toHaveBeenCalledWith(false);
    expect(directoryQuery).toHaveBeenCalledWith("student", false);
    expect(classesQuery).toHaveBeenCalledWith(false);
  });

  it("builds the hero title from attendance_today", () => {
    dashboardQuery.mockReturnValue({
      data: { ...baseDashboard, attendance_today: { submitted: 3, total: 5 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(result.current.hero?.title).toContain('"submitted":3');
    expect(result.current.hero?.title).toContain('"total":5');
    expect(result.current.hero?.action).toEqual({
      label: "hero.action",
      href: "/monitor",
    });
  });

  it("omits the hero when no class is currently in session", () => {
    dashboardQuery.mockReturnValue({
      data: { ...baseDashboard, attendance_today: { submitted: 0, total: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(result.current.hero).toBeUndefined();
  });

  it("sums the three pending queues into one tile", () => {
    dashboardQuery.mockReturnValue({
      data: {
        ...baseDashboard,
        pending: { leave_request: 3, exit_permit: 2, late_arrival: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useLeadershipBlock(me, true));
    const pendingTile = result.current.tiles.find((tile) => tile.key === "school.pending");

    expect(pendingTile?.value).toBe("6");
  });

  it("shows no tiles while loading", () => {
    dashboardQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(result.current.tiles).toEqual([]);
    expect(result.current.hero).toBeUndefined();
  });

  it("shows no tiles and a retry action in the queue card on error", () => {
    const refetch = vi.fn();
    dashboardQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(result.current.tiles).toEqual([]);
    const queueSlot = result.current.left.find((slot) => slot.key === "school.queue");
    render(<>{queueSlot?.node}</>);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("lists the top at-risk students by score in the right column when permitted", () => {
    const meWithPermission: Me = { ...me, permissions: ["view_early_warning"] };
    directoryQuery.mockReturnValue({
      data: { data: [{ id: "s1", name: "Siswa Satu" }] },
    });
    classesQuery.mockReturnValue({ data: { data: [{ id: "c1", name: "X-A" }] } });
    atRiskQuery.mockReturnValue({
      data: {
        data: [
          {
            student_user_id: "s1",
            class_id: "c1",
            level: "at_risk",
            score: 80,
            computed_at: "2026-09-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useLeadershipBlock(meWithPermission, true));
    const atRiskSlot = result.current.right.find((slot) => slot.key === "school.atRisk");
    render(<>{atRiskSlot?.node}</>);

    expect(atRiskQuery).toHaveBeenCalledWith(true);
    expect(screen.getByText("Siswa Satu")).toBeInTheDocument();
    expect(screen.getByText("X-A")).toBeInTheDocument();
  });

  it("hides the at-risk card entirely and disables its query without view_early_warning (admin/principal seed accounts get a 403 on it)", () => {
    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(atRiskQuery).toHaveBeenCalledWith(false);
    expect(result.current.right.some((slot) => slot.key === "school.atRisk")).toBe(false);
  });
});
