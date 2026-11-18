import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dashboardQuery = vi.hoisted(() => vi.fn());
const atRiskQuery = vi.hoisted(() => vi.fn());
const namesQuery = vi.hoisted(() => vi.fn());
const classesQuery = vi.hoisted(() => vi.fn());

vi.mock("../../api", () => ({ useAdminDashboardQuery: dashboardQuery }));
vi.mock("../../../analytics/api", () => ({ useAtRiskStudentsQuery: atRiskQuery }));
vi.mock("../../../reference/directory-names", () => ({ useDirectoryNames: namesQuery }));
vi.mock("../../../reference/api", () => ({
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
  namesQuery.mockReset();
  classesQuery.mockReset();
  namesQuery.mockReturnValue(new Map());
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

    expect(result.current).toEqual({ tiles: [], main: [], side: [] });
    expect(dashboardQuery).toHaveBeenCalledWith(false);
    expect(atRiskQuery).toHaveBeenCalledWith(false);
    expect(namesQuery).toHaveBeenCalledWith([], false);
    expect(classesQuery).toHaveBeenCalledWith(false);
  });

  it("builds the hero title from attendance_today", () => {
    dashboardQuery.mockReturnValue({
      data: { ...baseDashboard, attendance_today: { submitted: 3, total: 5 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useLeadershipBlock({ ...me, permissions: ["view_monitor_presence"] }, true),
    );

    expect(result.current.hero?.title).toContain('"submitted":3');
    expect(result.current.hero?.title).toContain('"total":5');
    expect(result.current.hero?.action).toEqual({
      label: "hero.action",
      href: "/monitor",
    });
  });

  it("offers the monitor with the reports beside it, for the home to guard by access", () => {
    dashboardQuery.mockReturnValue({
      data: { ...baseDashboard, attendance_today: { submitted: 3, total: 5 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(result.current.hero?.action?.href).toBe("/monitor");
    expect(result.current.hero?.secondaryAction?.href).toBe("/reports");
    expect(result.current.hero?.progress).toMatchObject({ value: 3, max: 5 });
  });

  it("states the attendance figure once: title and meter, no meta, its tile covered", () => {
    dashboardQuery.mockReturnValue({
      data: {
        ...baseDashboard,
        online_by_role: { admin: 1 },
        attendance_today: { submitted: 3, total: 5 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(result.current.hero?.meta).toBeUndefined();
    expect(result.current.hero?.coversTiles).toEqual(["school.sessions"]);
    // Who is online is named in the activity card, not counted again as a tile.
    expect(result.current.tiles.map((tile) => tile.key)).not.toContain("school.online");
  });

  it("opens on a calm hero when no class is in session and nothing waits", () => {
    dashboardQuery.mockReturnValue({
      data: { ...baseDashboard, attendance_today: { submitted: 0, total: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(result.current.hero?.key).toBe("school.idle");
    expect(result.current.hero?.tone).toBe("neutral");
    expect(result.current.hero?.action?.href).toBe("/reports");
  });

  it("leads with the waiting requests when no class is in session", () => {
    dashboardQuery.mockReturnValue({
      data: {
        ...baseDashboard,
        pending: { leave_request: 2, exit_permit: 0, late_arrival: 1 },
        attendance_today: { submitted: 0, total: 0 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(result.current.hero?.key).toBe("school.queue");
    expect(result.current.hero?.action?.href).toBe("/inbox");
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
      error: new Error("failed"),
      refetch,
    });

    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(result.current.tiles).toEqual([]);
    const queueSlot = result.current.main.find((slot) => slot.key === "school.queue");
    render(<>{queueSlot?.node}</>);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("lists the top at-risk students by score in the right column when permitted", () => {
    const meWithPermission: Me = { ...me, permissions: ["view_early_warning"] };
    namesQuery.mockReturnValue(new Map([["s1", { id: "s1", name: "Siswa Satu" }]]));
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
    const atRiskSlot = result.current.main.find((slot) => slot.key === "school.atRisk");
    render(<>{atRiskSlot?.node}</>);

    expect(atRiskQuery).toHaveBeenCalledWith(true);
    expect(screen.getByText("Siswa Satu")).toBeInTheDocument();
    expect(screen.getByText("X-A")).toBeInTheDocument();
  });

  it("hides the at-risk card entirely and disables its query without view_early_warning (admin/principal seed accounts get a 403 on it)", () => {
    const { result } = renderHook(() => useLeadershipBlock(me, true));

    expect(atRiskQuery).toHaveBeenCalledWith(false);
    expect(result.current.main.some((slot) => slot.key === "school.atRisk")).toBe(false);
  });

  it("says the attendance progress once, in the hero, not again in a card", () => {
    dashboardQuery.mockReturnValue({
      data: { ...baseDashboard, attendance_today: { submitted: 3, total: 5 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const withMonitor = renderHook(() =>
      useLeadershipBlock({ ...me, permissions: ["view_monitor_presence"] }, true),
    );

    expect(withMonitor.result.current.main.map((slot) => slot.key)).toEqual([
      "school.queue",
      "school.activity",
    ]);
    expect(withMonitor.result.current.side).toEqual([]);
  });

  it("links a queue row only to a screen the reader may open", () => {
    dashboardQuery.mockReturnValue({
      data: { ...baseDashboard, pending: { leave_request: 1, exit_permit: 2, late_arrival: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const plain = renderHook(() => useLeadershipBlock(me, true));
    render(<>{plain.result.current.main[0]?.node}</>);
    const plainHrefs = screen.queryAllByRole("link").map((link) => link.getAttribute("href"));
    expect(plainHrefs).not.toContain("/leave-requests");
    expect(plainHrefs).not.toContain("/exit-permits");

    const reviewer = renderHook(() =>
      useLeadershipBlock({ ...me, permissions: ["review_leave_requests"] }, true),
    );
    cleanup();
    render(<>{reviewer.result.current.main[0]?.node}</>);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/leave-requests");
    expect(hrefs).not.toContain("/exit-permits");
  });

  it("leaves students at level none out of the at-risk card", () => {
    namesQuery.mockReturnValue(
      new Map([
        ["s1", { id: "s1", name: "Siswa Satu" }],
        ["s2", { id: "s2", name: "Siswa Aman" }],
      ]),
    );
    atRiskQuery.mockReturnValue({
      data: {
        data: [
          { student_user_id: "s1", class_id: "c1", level: "at_risk", score: 80, computed_at: "x" },
          { student_user_id: "s2", class_id: "c1", level: "none", score: 90, computed_at: "x" },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { result } = renderHook(() =>
      useLeadershipBlock({ ...me, permissions: ["view_early_warning"] }, true),
    );
    const slot = result.current.main.find((s) => s.key === "school.atRisk");
    render(<>{slot?.node}</>);
    expect(screen.getByText("Siswa Satu")).toBeInTheDocument();
    expect(screen.queryByText("Siswa Aman")).not.toBeInTheDocument();
  });
});
