import { render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
  useLocale: () => "id",
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDate: (value: string) => value,
}));

const mocks = vi.hoisted(() => ({
  schedules: vi.fn(),
  periods: vi.fn(),
  subjects: vi.fn(),
  teachers: vi.fn(),
  calendar: vi.fn(),
  leaveRequests: vi.fn(),
  grades: vi.fn(),
  library: vi.fn(),
}));

vi.mock("../../../schedule/api", () => ({
  useSchedulesQuery: mocks.schedules,
}));

vi.mock("../../../reference/directory-names", () => ({ useDirectoryLookup: mocks.teachers }));
vi.mock("../../../reference/api", () => ({
  useAllPeriodsQuery: mocks.periods,
  useSubjectsQuery: mocks.subjects,
  useLookup: (items?: { id: string }[]) => new Map((items ?? []).map((item) => [item.id, item])),
}));

vi.mock("../../../attendance/api", () => ({
  useMyCalendarQuery: mocks.calendar,
  todayInZone: () => "2026-09-26",
}));

vi.mock("../../../permits/api", () => ({
  useMyLeaveRequestsQuery: mocks.leaveRequests,
}));

vi.mock("../../../permits/components/workflow-stepper", () => ({
  WorkflowStatusBadge: () => null,
}));

vi.mock("../../../grading/api", () => ({
  useMyGradesQuery: mocks.grades,
}));

vi.mock("../../../library/me-api", () => ({
  useMyLibraryProfileQuery: mocks.library,
}));

// A student only holds view_own_library_loans, never view_library: the
// library card must never resolve a loan's title through this hook (GET
// /v1/library/titles/{titleId}), which 403s for them. Throwing here turns
// any regression into a loud test failure instead of a silent UUID.
vi.mock("../../../library/api", () => ({
  useLibraryTitleQuery: () => {
    throw new Error("useLibraryTitleQuery must not be called from the student dashboard block");
  },
}));

import type { Me as SessionMe } from "../../../../lib/session/session-provider";
import {
  clearSimulation,
  setSimulation,
  syncSimulationIdentity,
} from "../../../../lib/simulation/clock";
import { EMPTY_BLOCK, type Me } from "../types";

import { useStudentBlock } from "./student";

function superadmin(): SessionMe {
  return {
    id: "admin",
    permissions: ["platform_superadmin"],
    tenant: { tenant_id: "school", timezone: "Asia/Jakarta", name: "School", locale: "id" },
  } as unknown as SessionMe;
}

const idleQuery = {
  data: undefined,
  isLoading: false,
  isSuccess: false,
  isError: false,
  refetch: vi.fn(),
};

const loadingQuery = { ...idleQuery, isLoading: true };

function me(patch: Partial<Me> = {}): Me {
  return {
    id: "u1",
    username: "siswa1",
    name: "Siswa Satu",
    profile_kind: "student",
    roles: [],
    permissions: [],
    duties: [],
    active_academic_year: { id: "y1", label: "2026/2027" },
    current_class: { id: "c1", name: "X-A" },
    tenant: { timezone: "Asia/Jakarta", locale: "id" } as Me["tenant"],
    must_change_password: false,
    ...patch,
  } as unknown as Me;
}

function resetMocks() {
  mocks.schedules.mockReset().mockReturnValue(idleQuery);
  mocks.periods.mockReset().mockReturnValue(idleQuery);
  mocks.subjects.mockReset().mockReturnValue(idleQuery);
  mocks.teachers.mockReset().mockReturnValue({ ...idleQuery, names: new Map() });
  mocks.calendar.mockReset().mockReturnValue(idleQuery);
  mocks.leaveRequests.mockReset().mockReturnValue(idleQuery);
  mocks.grades.mockReset().mockReturnValue(idleQuery);
  mocks.library.mockReset().mockReturnValue(idleQuery);
}

describe("useStudentBlock", () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearSimulation();
    syncSimulationIdentity(undefined);
  });

  it("returns EMPTY_BLOCK and disables every query when inactive", () => {
    const { result } = renderHook(() => useStudentBlock(me(), false));

    expect(result.current).toEqual(EMPTY_BLOCK);
    expect(mocks.schedules).toHaveBeenCalledWith(
      expect.objectContaining({ academicYearId: "", classId: "c1" }),
    );
    expect(mocks.periods).toHaveBeenCalledWith(false);
    expect(mocks.subjects).toHaveBeenCalledWith(false);
    expect(mocks.teachers).toHaveBeenCalledWith([], false);
    expect(mocks.calendar).toHaveBeenCalledWith("");
    expect(mocks.leaveRequests).toHaveBeenCalledWith(false);
    expect(mocks.grades).toHaveBeenCalledWith(undefined, false);
    expect(mocks.library).toHaveBeenCalledWith(false);
  });

  it("picks the next lesson at 08:30 given lessons at 07:00-08:20 and 08:40-10:00", () => {
    vi.useFakeTimers();
    // 2026-09-26T01:30:00Z is 08:30 in Asia/Jakarta (UTC+7).
    vi.setSystemTime(new Date("2026-09-26T01:30:00Z"));

    mocks.schedules.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          {
            schedule_ids: ["s1"],
            class_id: "c1",
            subject_id: "math",
            teacher_user_id: "t1",
            day_of_week: 6,
            start_seq: 1,
            end_seq: 2,
            source: "manual",
          },
          {
            schedule_ids: ["s2"],
            class_id: "c1",
            subject_id: "science",
            teacher_user_id: "t2",
            day_of_week: 6,
            start_seq: 3,
            end_seq: 4,
            source: "manual",
          },
        ],
      },
    });
    mocks.periods.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          {
            id: "p1",
            template_id: "tpl",
            name: "1",
            sequence: 1,
            starts_at: "07:00",
            ends_at: "07:40",
            is_break: false,
          },
          {
            id: "p2",
            template_id: "tpl",
            name: "2",
            sequence: 2,
            starts_at: "07:40",
            ends_at: "08:20",
            is_break: false,
          },
          {
            id: "p3",
            template_id: "tpl",
            name: "3",
            sequence: 3,
            starts_at: "08:40",
            ends_at: "09:20",
            is_break: false,
          },
          {
            id: "p4",
            template_id: "tpl",
            name: "4",
            sequence: 4,
            starts_at: "09:20",
            ends_at: "10:00",
            is_break: false,
          },
        ],
      },
    });
    mocks.subjects.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          { id: "math", code: "MTK", name: "Matematika" },
          { id: "science", code: "IPA", name: "IPA" },
        ],
      },
    });
    mocks.teachers.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      names: new Map([
        ["t1", { id: "t1", name: "Bu Sari", username: "sari" }],
        ["t2", { id: "t2", name: "Pak Budi", username: "budi" }],
      ]),
    });

    const { result } = renderHook(() => useStudentBlock(me(), true));

    expect(result.current.hero?.title).toBe("IPA");
    expect(result.current.hero?.chip).toContain("10");
  });

  it("follows a superadmin's simulated clock, not the real system clock, to pick today's lesson", () => {
    // Real system time: a Tuesday (day_of_week 2), which has no lesson in
    // this fixture -- if the block read the real clock the hero would be
    // empty. Asia/Jakarta is UTC+7, so 2026-09-22T01:30:00Z is 08:30 local.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T01:30:00Z"));

    // The simulated clock is set to Saturday 08:30 Jakarta instead --
    // 2026-09-26T01:30:00Z -- the same instant the sibling test above uses
    // via vi.setSystemTime, so the same fixture picks the same hero.
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2026-09-26T01:30:00Z"));

    mocks.schedules.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          {
            schedule_ids: ["s1"],
            class_id: "c1",
            subject_id: "math",
            teacher_user_id: "t1",
            day_of_week: 6,
            start_seq: 1,
            end_seq: 2,
            source: "manual",
          },
          {
            schedule_ids: ["s2"],
            class_id: "c1",
            subject_id: "science",
            teacher_user_id: "t2",
            day_of_week: 6,
            start_seq: 3,
            end_seq: 4,
            source: "manual",
          },
        ],
      },
    });
    mocks.periods.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          {
            id: "p1",
            template_id: "tpl",
            name: "1",
            sequence: 1,
            starts_at: "07:00",
            ends_at: "07:40",
            is_break: false,
          },
          {
            id: "p2",
            template_id: "tpl",
            name: "2",
            sequence: 2,
            starts_at: "07:40",
            ends_at: "08:20",
            is_break: false,
          },
          {
            id: "p3",
            template_id: "tpl",
            name: "3",
            sequence: 3,
            starts_at: "08:40",
            ends_at: "09:20",
            is_break: false,
          },
          {
            id: "p4",
            template_id: "tpl",
            name: "4",
            sequence: 4,
            starts_at: "09:20",
            ends_at: "10:00",
            is_break: false,
          },
        ],
      },
    });
    mocks.subjects.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          { id: "math", code: "MTK", name: "Matematika" },
          { id: "science", code: "IPA", name: "IPA" },
        ],
      },
    });
    mocks.teachers.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      names: new Map([
        ["t1", { id: "t1", name: "Bu Sari", username: "sari" }],
        ["t2", { id: "t2", name: "Pak Budi", username: "budi" }],
      ]),
    });

    const { result } = renderHook(() => useStudentBlock(me(), true));

    expect(result.current.hero?.title).toBe("IPA");
    expect(result.current.hero?.chip).toContain("10");
  });

  it("shows only today's lessons and picks the hero from them, ignoring blocks on other weekdays", () => {
    vi.useFakeTimers();
    // 2026-09-26T01:30:00Z is 08:30 in Asia/Jakarta (UTC+7), a Saturday
    // (ISO weekday 6).
    vi.setSystemTime(new Date("2026-09-26T01:30:00Z"));

    mocks.schedules.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          // Monday's block: an earlier future start than today's block, so
          // an unfiltered pick-next would wrongly surface it as the hero.
          {
            schedule_ids: ["s-mon"],
            class_id: "c1",
            subject_id: "history",
            teacher_user_id: "t1",
            day_of_week: 1,
            start_seq: 3,
            end_seq: 3,
            source: "manual",
          },
          // Today (Saturday, day_of_week 6): the only block that should
          // appear in "Jadwal hari ini" and drive the hero.
          {
            schedule_ids: ["s-sat"],
            class_id: "c1",
            subject_id: "science",
            teacher_user_id: "t2",
            day_of_week: 6,
            start_seq: 4,
            end_seq: 4,
            source: "manual",
          },
          // Every other weekday repeats the same slot as Monday (the
          // reported bug: one lesson per day rendered as 7 identical rows).
          {
            schedule_ids: ["s-tue"],
            class_id: "c1",
            subject_id: "history",
            teacher_user_id: "t1",
            day_of_week: 2,
            start_seq: 3,
            end_seq: 3,
            source: "manual",
          },
        ],
      },
    });
    mocks.periods.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          {
            id: "p3",
            template_id: "tpl",
            name: "3",
            sequence: 3,
            starts_at: "08:40",
            ends_at: "09:20",
            is_break: false,
          },
          {
            id: "p4",
            template_id: "tpl",
            name: "4",
            sequence: 4,
            starts_at: "09:20",
            ends_at: "10:00",
            is_break: false,
          },
        ],
      },
    });
    mocks.subjects.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          { id: "history", code: "SEJ", name: "Sejarah" },
          { id: "science", code: "IPA", name: "IPA" },
        ],
      },
    });
    mocks.teachers.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      names: new Map([
        ["t1", { id: "t1", name: "Bu Sari", username: "sari" }],
        ["t2", { id: "t2", name: "Pak Budi", username: "budi" }],
      ]),
    });

    const { result } = renderHook(() => useStudentBlock(me(), true));

    expect(result.current.hero?.title).toBe("IPA");

    render(<>{result.current.left.find((slot) => slot.key === "student.schedule")?.node}</>);
    expect(screen.getByText("IPA")).toBeInTheDocument();
    expect(screen.queryByText("Sejarah")).not.toBeInTheDocument();
  });

  it("computes a 75% attendance rate for 3 of 4 known days", () => {
    mocks.calendar.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        data: [
          {
            date: "2026-09-01",
            status_code: "H",
            expected_sessions: 1,
            submitted_sessions: 1,
            complete: true,
          },
          {
            date: "2026-09-02",
            status_code: "H",
            expected_sessions: 1,
            submitted_sessions: 1,
            complete: true,
          },
          {
            date: "2026-09-03",
            status_code: "H",
            expected_sessions: 1,
            submitted_sessions: 1,
            complete: true,
          },
          {
            date: "2026-09-04",
            status_code: "S",
            expected_sessions: 1,
            submitted_sessions: 1,
            complete: true,
          },
        ],
      },
    });

    const { result } = renderHook(() => useStudentBlock(me(), true));

    const attendanceTile = result.current.tiles.find((tile) => tile.key === "student.attendance");
    expect(attendanceTile?.value).toBe("75%");
  });

  it("shows the empty sentence in the library card when there are no active loans", () => {
    mocks.library.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: { active_loans: [], history: [], reservations: [], violations: [] },
    });

    const { result } = renderHook(() => useStudentBlock(me(), true));
    const libraryNode = result.current.right.find((slot) => slot.key === "student.library")?.node;
    render(<>{libraryNode}</>);

    expect(screen.getByText("libraryEmpty")).toBeInTheDocument();
  });

  it("shows the loan's title text from /v1/library/me, never a raw title id", () => {
    mocks.library.mockReturnValue({
      ...idleQuery,
      isSuccess: true,
      data: {
        active_loans: [
          {
            id: "loan1",
            copy_id: "copy1",
            title_id: "11111111-1111-1111-1111-111111111111",
            title_name: "Matematika Dasar",
            member_user_id: "u1",
            borrowed_at: "2026-09-01T00:00:00Z",
            due_on: "2026-10-01",
            renewal_count: 0,
            status: "active",
            fine_amount: 0,
          },
        ],
        history: [],
        reservations: [],
        violations: [],
      },
    });

    const { result } = renderHook(() => useStudentBlock(me(), true));
    const libraryNode = result.current.right.find((slot) => slot.key === "student.library")?.node;
    render(<>{libraryNode}</>);

    expect(screen.getByText("Matematika Dasar")).toBeInTheDocument();
    expect(screen.queryByText("11111111-1111-1111-1111-111111111111")).not.toBeInTheDocument();
  });

  it("shows no tiles while the tile data sources are still loading", () => {
    mocks.calendar.mockReturnValue(loadingQuery);
    mocks.leaveRequests.mockReturnValue(loadingQuery);
    mocks.grades.mockReturnValue(loadingQuery);
    mocks.library.mockReturnValue(loadingQuery);

    const { result } = renderHook(() => useStudentBlock(me(), true));

    expect(result.current.tiles).toEqual([]);
  });
});
