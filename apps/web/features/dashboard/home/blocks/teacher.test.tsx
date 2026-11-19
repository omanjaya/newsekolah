import { fireEvent, render, renderHook, screen } from "@testing-library/react";
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
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        key === "hero.nowMeta" || key === "hero.nextMeta"
          ? `${key}:${JSON.stringify(values)}`
          : key,
      { has: () => true },
    ),
  useLocale: () => "id",
}));

import { useTeacherBlock } from "./teacher";

function superadmin(): SessionMe {
  return {
    id: "admin",
    permissions: ["platform_superadmin"],
    tenant: { tenant_id: "school", timezone: "Asia/Jakarta", name: "School", locale: "id" },
  } as unknown as SessionMe;
}

const me = {
  tenant: { timezone: "Asia/Jakarta" },
  permissions: ["manage_attendance", "view_academic_data"],
} as unknown as Me;

/** A custom role that may take attendance but not read the academic lists. */
const attendanceOnly: Me = { ...me, permissions: ["manage_attendance"] };

/** Today's running, unsubmitted lesson with its periods read. */
function runningLessonLoaded() {
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
}

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

    expect(result.current).toEqual({ tiles: [], main: [], side: [] });
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
    classesQuery.mockReturnValue({ isSuccess: true, data: { data: [{ id: "c1", name: "X-A" }] } });
    subjectsQuery.mockReturnValue({
      isSuccess: true,
      data: { data: [{ id: "sub1", name: "Matematika" }] },
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.hero?.priority).toBe(HERO_PRIORITY.teacherNowPending);
    expect(result.current.hero?.action?.href).toBe("/attendance/s1");
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
    classesQuery.mockReturnValue({ isSuccess: true, data: { data: [{ id: "c1", name: "X-A" }] } });
    subjectsQuery.mockReturnValue({
      isSuccess: true,
      data: { data: [{ id: "sub1", name: "Matematika" }] },
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.hero?.priority).toBe(HERO_PRIORITY.teacherNowPending);
    expect(result.current.hero?.action?.href).toBe("/attendance/s1");
    // The span reads as on the schedule and attendance: spaced en dash.
    expect(result.current.hero?.meta).toBe('hero.nowMeta:{"range":"08.40 – 09.20"}');
  });

  it("flags the block failed when today's sessions cannot be read", () => {
    sessionsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error("x"),
      refetch: vi.fn(),
    });
    periodsQuery.mockReturnValue({
      data: { data: PERIODS },
      isSuccess: true,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.failed).toBe(true);
    expect(result.current.hero).toBeUndefined();
  });

  // A failed name read hid the lesson that waited for attendance behind the
  // home's notice and the card's error box (audit r4-n3).
  it("fails the block but keeps the lesson's hero and rows when the class or subject names cannot be read", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T01:50:00Z"));
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
    const refetchClasses = vi.fn();
    classesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error("classes"),
      refetch: refetchClasses,
    });
    subjectsQuery.mockReturnValue({
      isSuccess: true,
      data: { data: [{ id: "sub1", name: "Matematika" }] },
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.failed).toBe(true);
    // The hero still asks for the running lesson, named by what is known.
    expect(result.current.hero?.priority).toBe(HERO_PRIORITY.teacherNowPending);
    expect(result.current.hero?.title).toBe("Matematika");
    expect(result.current.hero?.action?.href).toBe("/attendance/s1");
    // The tile stands on the sessions alone, so it stays.
    expect(result.current.tiles.map((tile) => tile.key)).toEqual(["teacher.pending"]);

    // The card says the names failed and still lists the session, named
    // by its period.
    render(<>{result.current.main[0]?.node}</>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const sessionLinks = screen
      .queryAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/attendance/"));
    expect(sessionLinks).toHaveLength(1);
    expect(sessionLinks[0]).toHaveTextContent("Jam 2");
    fireEvent.click(screen.getByRole("button"));
    expect(refetchClasses).toHaveBeenCalledTimes(1);
  });

  it("does not read the class and subject lists without view_academic_data", () => {
    runningLessonLoaded();

    const { result } = renderHook(() => useTeacherBlock(attendanceOnly, true));

    expect(classesQuery).toHaveBeenCalledWith(false);
    expect(subjectsQuery).toHaveBeenCalledWith(false);
    expect(result.current.failed).toBe(false);
    expect(result.current.pending).toBe(false);
    // The hero still asks for the running lesson, named by its period.
    expect(result.current.hero?.priority).toBe(HERO_PRIORITY.teacherNowPending);
    expect(result.current.hero?.title).toBe("Jam 2");
    expect(result.current.hero?.action?.href).toBe("/attendance/s1");
  });

  it("does not count a class list the reader cannot read as a failure", () => {
    runningLessonLoaded();
    // The classes list needs view_academic_data, which this reader lacks; a
    // 403 from it must not fail the home with a retry that cannot work.
    classesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error("forbidden"),
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useTeacherBlock(attendanceOnly, true));

    expect(result.current.failed).toBe(false);
    expect(result.current.hero?.title).toBe("Jam 2");
  });

  it("names the lesson by its subject while the class list waits on an active school year", () => {
    runningLessonLoaded();
    // No active year: the classes query stays disabled (neither loading,
    // failed, nor loaded), so only the subject name is known.
    subjectsQuery.mockReturnValue({
      isSuccess: true,
      data: { data: [{ id: "sub1", name: "Matematika" }] },
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.failed).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(result.current.hero?.priority).toBe(HERO_PRIORITY.teacherNowPending);
    expect(result.current.hero?.title).toBe("Matematika");
  });

  it("calms the hero once the running session is submitted and nothing else is upcoming", () => {
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
    classesQuery.mockReturnValue({ isSuccess: true, data: { data: [{ id: "c1", name: "X-A" }] } });
    subjectsQuery.mockReturnValue({
      isSuccess: true,
      data: { data: [{ id: "sub1", name: "Matematika" }] },
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));

    expect(result.current.hero?.key).toBe("teacher.idle");
    expect(result.current.hero?.tone).toBe("neutral");
    expect(result.current.hero?.action?.href).toBe("/journal");
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
      isSuccess: true,
      data: {
        data: [
          { id: "c1", name: "X-A" },
          { id: "c2", name: "X-B" },
        ],
      },
    });
    subjectsQuery.mockReturnValue({
      isSuccess: true,
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
    classesQuery.mockReturnValue({ isSuccess: true, data: { data: [{ id: "c1", name: "X-A" }] } });
    subjectsQuery.mockReturnValue({
      isSuccess: true,
      data: { data: [{ id: "sub1", name: "Matematika" }] },
    });

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
      error: new Error("failed"),
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
    render(<>{result.current.main.map((slot) => slot.node)}</>);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("links each teaching row to its own attendance session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T01:50:00Z"));
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
    classesQuery.mockReturnValue({ isSuccess: true, data: { data: [{ id: "c1", name: "X-A" }] } });
    subjectsQuery.mockReturnValue({
      isSuccess: true,
      data: { data: [{ id: "sub1", name: "Matematika" }] },
    });

    const { result } = renderHook(() => useTeacherBlock(me, true));
    render(<>{result.current.main.map((slot) => slot.node)}</>);

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/attendance/s1");
  });
});
