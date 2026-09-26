import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HERO_PRIORITY, type Me } from "../types";

const attendanceQuery = vi.hoisted(() => vi.fn());
const leaveQueueQuery = vi.hoisted(() => vi.fn());

vi.mock("../../../attendance/api", () => ({
  todayInZone: () => "2026-09-26",
  useHomeroomAttendanceQuery: attendanceQuery,
}));

vi.mock("../../../permits/api", () => ({
  useLeaveReviewQueueQuery: leaveQueueQuery,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
}));

import { useHomeroomBlock } from "./homeroom";

function meWithHomeroom(): Me {
  return {
    tenant: { timezone: "Asia/Jakarta" },
    duties: [{ slug: "homeroom", scope_kind: "class", scope_id: "c1", scope_label: "X-A" }],
  } as unknown as Me;
}

function idle() {
  return { data: undefined, isLoading: false, isError: false, isSuccess: false, refetch: vi.fn() };
}

describe("useHomeroomBlock", () => {
  beforeEach(() => {
    attendanceQuery.mockReset().mockReturnValue(idle());
    leaveQueueQuery.mockReset().mockReturnValue(idle());
  });

  it("returns EMPTY_BLOCK and disables every query when inactive", () => {
    const { result } = renderHook(() => useHomeroomBlock(meWithHomeroom(), false));

    expect(result.current).toEqual({ tiles: [], left: [], right: [] });
    expect(attendanceQuery).toHaveBeenCalledWith(expect.anything(), false);
    expect(leaveQueueQuery).toHaveBeenCalledWith(false);
  });

  it("computes a 50% rate for two present out of four", () => {
    attendanceQuery.mockReturnValue({
      data: { data: [], total: 4, status_counts: { H: 2, A: 2 } },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });
    leaveQueueQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useHomeroomBlock(meWithHomeroom(), true));

    const rateTile = result.current.tiles.find((tile) => tile.key === "homeroom.rate");
    expect(rateTile?.value).toBe("50%");
  });

  it("shows no hero and a zero tile when the class's leave queue is empty", () => {
    attendanceQuery.mockReturnValue({
      data: { data: [], total: 0, status_counts: {} },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });
    leaveQueueQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useHomeroomBlock(meWithHomeroom(), true));

    expect(result.current.hero).toBeUndefined();
    const leaveTile = result.current.tiles.find((tile) => tile.key === "homeroom.leave");
    expect(leaveTile?.value).toBe("0");
  });

  it("shows a leaveQueue hero scoped to the homeroom class only", () => {
    leaveQueueQuery.mockReturnValue({
      data: {
        data: [
          {
            instance_id: "l1",
            student_user_id: "st1",
            class_id: "c1",
            status: "in_progress",
            current_stage_index: 0,
            category: "sick",
            starts_on: "2026-09-26",
            ends_on: "2026-09-26",
            student_name: "Budi",
            class_name: "X-A",
            opened_at: "2026-09-26T00:00:00Z",
          },
          {
            instance_id: "l2",
            student_user_id: "st2",
            class_id: "other-class",
            status: "in_progress",
            current_stage_index: 0,
            category: "sick",
            starts_on: "2026-09-26",
            ends_on: "2026-09-26",
            student_name: "Someone Else",
            class_name: "X-B",
            opened_at: "2026-09-26T00:00:00Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useHomeroomBlock(meWithHomeroom(), true));

    expect(result.current.hero?.priority).toBe(HERO_PRIORITY.leaveQueue);
    expect(result.current.hero?.action?.href).toBe("/leave-requests");
    const leaveTile = result.current.tiles.find((tile) => tile.key === "homeroom.leave");
    expect(leaveTile?.value).toBe("1");
  });

  it("renders the class card's left slot with a retry action on error", () => {
    attendanceQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      refetch: vi.fn(),
    });
    leaveQueueQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useHomeroomBlock(meWithHomeroom(), true));
    render(<>{result.current.left.map((slot) => slot.node)}</>);

    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });
});
