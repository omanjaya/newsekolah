import { render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Me as SessionMe } from "../../../../lib/session/session-provider";
import {
  clearSimulation,
  setSimulation,
  syncSimulationIdentity,
} from "../../../../lib/simulation/clock";
import type * as ReferenceApi from "../../../reference/api";
import { HERO_PRIORITY, type Me } from "../types";

type PeriodRef = ReferenceApi.PeriodRef;

const sessionsQuery = vi.hoisted(() => vi.fn());
const periodsQuery = vi.hoisted(() => vi.fn());
const classesQuery = vi.hoisted(() => vi.fn());
const subjectsQuery = vi.hoisted(() => vi.fn());

vi.mock("../../../attendance/api", () => ({
  todayInZone: () => "2026-09-26",
  useTodaySessionsQuery: sessionsQuery,
}));

vi.mock("../../../reference/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ReferenceApi>();
  return {
    ...actual,
    useAllPeriodsQuery: periodsQuery,
    useClassesQuery: classesQuery,
    useSubjectsQuery: subjectsQuery,
  };
});

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
}));

import { useTeacherBlock } from "./teacher";

function superadmin(): SessionMe {
  return {
    id: "admin",
    permissions: ["platform_superadmin"],
    tenant: { tenant_id: "school", timezone: "Asia/Jakarta", name: "School", locale: "id" },
  } as unknown as SessionMe;
}

const me = { tenant: { timezone: "Asia/Jakarta" } } as unknown as Me;

function idle() {
  return { data: undefined, isLoading: false, isError: false, isSuccess: false, refetch: vi.fn() };
}

const PERIODS: PeriodRef[] = [
  {
    id: "p1",
    template_id: "t1",
    name: "Jam 1",
    sequence: 1,
    starts_at: "07:00",
    ends_at: "08:40",
    is_break: false,
  },
  {
    id: "p2",
    template_id: "t1",
    name: "Jam 2",
    sequence: 2,
    starts_at: "08:40",
    ends_at: "09:20",
    is_break: false,
  },
];

function session(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "s1",
    schedule_id: "sc1",
    date: "2026-09-26",
    class_id: "c1",
    subject_id: "sub1",
    teacher_user_id: "u1",
    start_period_id: "p2",
    end_period_id: "p2",
    is_substitute: false,
    ...overrides,
  };
}

describe("useTeacherBlock", () => {
  beforeEach(() => {
    sessionsQuery.mockReset().mockReturnValue(idle());
    periodsQuery.mockReset().mockReturnValue(idle());
    classesQuery.mockReset().mockReturnValue(idle());
    subjectsQuery.mockReset().mockReturnValue(idle());
  });

  afterEach(() => {
    vi.useRealTimers();
    clearSimulation();
    syncSimulationIdentity(undefined);
  });

  it("returns EMPTY_BLOCK and disables every query when inactive", () => {
    const { result } = renderHook(() => useTeacherBlock(me, false));

    expect(result.current).toEqual({ tiles: [], left: [], right: [] });
    expect(sessionsQuery).toHaveBeenCalledWith(expect.anything(), false);
    expect(periodsQuery).toHaveBeenCalledWith(false);
    expect(classesQuery).toHaveBeenCalledWith(false);
    expect(subjectsQuery).toHaveBeenCalledWith(false);
  });

  it("follows a superadmin's simulated clock, not the real system clock, to pick the running session", () => {
    // Real system time: well outside teaching hours (03:00 in Asia/Jakarta),
    // so reading the real clock would fall through to "next" or no hero.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T20:00:00Z"));

    // The simulated clock is set to 08:50 Jakarta instead -- the same
    // instant the sibling "teacherNowPending" test above reaches via
    // vi.setSystemTime -- so the same fixture should pick the same hero.
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2026-09-26T01:50:00Z"));

    sessionsQuery.mockReturnValue({
      data: { data: [session({ submitted_at: undefined })] },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });
    periodsQuery.mockReturnValue({
      data: { data: PERIODS },
      isSuccess: true,
      isLoading: false,
      isError: false,
    });
    classesQuery.mockReturnValue({ data: { data: [{ id: "c1", name: "X-A" }] } });
    subjectsQuery.mockReturnValue({ data: { data: [{ id: "sub1", name: "Matematika" }] } });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.hero?.priority).toBe(HERO_PRIORITY.teacherNowPending);
    expect(result.current.hero?.action?.href).toBe("/attendance");
  });

  it("shows a teacherNowPending hero for a running, unsubmitted session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T01:50:00Z")); // 08:50 in Asia/Jakarta

    sessionsQuery.mockReturnValue({
      data: { data: [session({ submitted_at: undefined })] },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });
    periodsQuery.mockReturnValue({
      data: { data: PERIODS },
      isSuccess: true,
      isLoading: false,
      isError: false,
    });
    classesQuery.mockReturnValue({ data: { data: [{ id: "c1", name: "X-A" }] } });
    subjectsQuery.mockReturnValue({ data: { data: [{ id: "sub1", name: "Matematika" }] } });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.hero?.priority).toBe(HERO_PRIORITY.teacherNowPending);
    expect(result.current.hero?.action?.href).toBe("/attendance");
  });

  it("shows no hero once the running session is submitted and nothing else is upcoming", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T01:50:00Z")); // 08:50 in Asia/Jakarta

    sessionsQuery.mockReturnValue({
      data: { data: [session({ submitted_at: "2026-09-26T01:00:00Z" })] },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });
    periodsQuery.mockReturnValue({
      data: { data: PERIODS },
      isSuccess: true,
      isLoading: false,
      isError: false,
    });
    classesQuery.mockReturnValue({ data: { data: [{ id: "c1", name: "X-A" }] } });
    subjectsQuery.mockReturnValue({ data: { data: [{ id: "sub1", name: "Matematika" }] } });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.hero).toBeUndefined();
  });

  it("falls back to the next unsubmitted session once the running one is submitted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T01:50:00Z")); // 08:50 in Asia/Jakarta

    sessionsQuery.mockReturnValue({
      data: {
        data: [
          session({
            id: "s1",
            start_period_id: "p2",
            end_period_id: "p2",
            submitted_at: "2026-09-26T01:00:00Z",
          }),
          session({
            id: "s2",
            class_id: "c2",
            subject_id: "sub2",
            start_period_id: "p3",
            end_period_id: "p3",
            submitted_at: undefined,
          }),
        ],
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });
    periodsQuery.mockReturnValue({
      data: {
        data: [
          ...PERIODS,
          {
            id: "p3",
            template_id: "t1",
            name: "Jam 3",
            sequence: 3,
            starts_at: "09:20",
            ends_at: "10:00",
            is_break: false,
          },
        ],
      },
      isSuccess: true,
      isLoading: false,
      isError: false,
    });
    classesQuery.mockReturnValue({
      data: {
        data: [
          { id: "c1", name: "X-A" },
          { id: "c2", name: "X-B" },
        ],
      },
    });
    subjectsQuery.mockReturnValue({
      data: {
        data: [
          { id: "sub1", name: "Matematika" },
          { id: "sub2", name: "Fisika" },
        ],
      },
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.hero?.priority).toBe(HERO_PRIORITY.teacherNext);
    expect(result.current.hero?.title).toBe("Fisika · X-B");
  });

  it("counts only unsubmitted sessions in the pending tile", () => {
    sessionsQuery.mockReturnValue({
      data: {
        data: [
          session({ id: "s1", submitted_at: "2026-09-26T01:00:00Z" }),
          session({ id: "s2", submitted_at: undefined }),
        ],
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    });
    periodsQuery.mockReturnValue({
      data: { data: PERIODS },
      isSuccess: true,
      isLoading: false,
      isError: false,
    });
    classesQuery.mockReturnValue({ data: { data: [{ id: "c1", name: "X-A" }] } });
    subjectsQuery.mockReturnValue({ data: { data: [{ id: "sub1", name: "Matematika" }] } });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    const pendingTile = result.current.tiles.find((tile) => tile.key === "teacher.pending");
    expect(pendingTile?.value).toBe("1");
  });

  it("shows no tiles while sessions are still loading", () => {
    sessionsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    });
    periodsQuery.mockReturnValue({
      data: { data: PERIODS },
      isSuccess: true,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.tiles).toEqual([]);
  });

  it("renders the today card's left slot with a retry action on error", () => {
    sessionsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      refetch: vi.fn(),
    });
    periodsQuery.mockReturnValue({
      data: { data: PERIODS },
      isSuccess: true,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));
    render(<>{result.current.left.map((slot) => slot.node)}</>);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
