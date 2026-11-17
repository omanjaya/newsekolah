import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type * as ReferenceApiModule from "../../reference/api";
import type * as AttendanceApiModule from "../api";

import { DaySessions } from "./attendance-view";

type SessionSummary = AttendanceApiModule.SessionSummary;

const TODAY = "2026-09-29";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useFormatter: () => ({
    dateTime: () => "Selasa, 29 September",
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../dashboard/api", () => ({
  useAdminDashboardQuery: () => ({ data: undefined }),
}));

vi.mock("@newsekolah/i18n", () => ({
  formatTime: () => "07:10",
}));

const mePermissions: string[] = ["view_reports", "view_monitor_presence"];
const meRoleSlug = "teacher";

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      id: "me-1",
      permissions: mePermissions,
      profile_kind: "teacher",
      modules: [],
      tenant: { timezone: "Asia/Jakarta" },
      roles: [{ id: "r1", slug: meRoleSlug, name: "Guru" }],
    },
  }),
  useCan: (permission: string) => mePermissions.includes(permission),
}));

vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1", label: "2026/2027" }),
}));

vi.mock("../../../lib/hooks/use-date-filter", () => ({
  useDateFilter: (_key: string, fallback: string) => [fallback, vi.fn()],
}));

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

vi.mock("../../schedule/api", () => ({
  useTeacherOptionsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

vi.mock("../../reference/api", async () => {
  const actual = await vi.importActual<typeof ReferenceApiModule>("../../reference/api");
  return {
    ...actual,
    useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "Kelas 10 A" }] } }),
    useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
    useAllPeriodsQuery: () => ({
      data: {
        data: [
          { id: "p1", name: "Jam ke-1", sequence: 1, starts_at: "07:00", ends_at: "07:40" },
          { id: "p2", name: "Jam ke-2", sequence: 2, starts_at: "07:40", ends_at: "08:20" },
        ],
      },
    }),
    useSchoolDaysQuery: () => ({
      data: { data: [{ day_of_week: 2, is_active: true }] },
      isLoading: false,
    }),
  };
});

let todaySessions: SessionSummary[] = [];

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof AttendanceApiModule>("../api");
  return {
    ...actual,
    todayInZone: () => TODAY,
    nowTimeInZone: () => "07:10:00",
    useTodaySessionsQuery: () => ({ data: { data: todaySessions }, isLoading: false }),
    useOpenSessionMutation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    }),
  };
});

function session(overrides: Partial<SessionSummary> & { schedule_id: string }): SessionSummary {
  return {
    id: overrides.schedule_id,
    date: TODAY,
    class_id: "class-1",
    subject_id: "subject-1",
    teacher_user_id: "me-1",
    start_period_id: "p1",
    end_period_id: "p1",
    is_substitute: false,
    ...overrides,
  };
}

describe("DaySessions", () => {
  it("makes the running, unsubmitted session the hero with the fill action", () => {
    todaySessions = [
      // 07:10 falls inside p1 (07:00-07:40): this one is "ongoing".
      session({ schedule_id: "running", start_period_id: "p1", end_period_id: "p1" }),
      // p2 (07:40-08:20) has not started yet.
      session({ schedule_id: "future", start_period_id: "p2", end_period_id: "p2" }),
    ];
    render(<DaySessions />);

    const hero = screen.getByTestId("attendance-session-hero");
    expect(hero).toHaveTextContent("Matematika · Kelas 10 A");
    expect(screen.getByRole("button", { name: "fillAttendance" })).toBeInTheDocument();
    // The other session is a row of the list, marked as the next one.
    const row = screen.getByTestId("attendance-session-row-future");
    expect(row).toHaveTextContent("nextBadge");
    expect(screen.queryByTestId("attendance-session-row-running")).not.toBeInTheDocument();
  });

  it("makes the next session the hero, with the quieter open action, when none is running", () => {
    todaySessions = [
      session({ schedule_id: "future", start_period_id: "p2", end_period_id: "p2" }),
    ];
    render(<DaySessions />);

    expect(screen.getByTestId("attendance-session-hero")).toHaveTextContent("heroNext");
    expect(screen.getByRole("button", { name: "openSubmitted" })).toBeInTheDocument();
  });

  it("shows a submitted session's saved time and no fill action", () => {
    todaySessions = [
      session({
        schedule_id: "saved",
        start_period_id: "p1",
        end_period_id: "p1",
        submitted_at: `${TODAY}T07:10:00Z`,
      }),
    ];
    render(<DaySessions />);

    expect(screen.queryByRole("button", { name: "fillAttendance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "viewSaved" })).toBeInTheDocument();
    expect(screen.getByText(/statusSavedAt/)).toBeInTheDocument();
  });

  it("opens any listed session from its whole row", () => {
    todaySessions = [
      session({ schedule_id: "running", start_period_id: "p1", end_period_id: "p1" }),
      session({ schedule_id: "future", start_period_id: "p2", end_period_id: "p2" }),
    ];
    render(<DaySessions />);

    const row = screen.getByTestId("attendance-session-row-future");
    expect(within(row).getByRole("button", { name: /Matematika · Kelas 10 A/ })).toBeEnabled();
  });

  it("sums the day up in one line under the title", () => {
    todaySessions = [
      session({ schedule_id: "s1" }),
      session({ schedule_id: "s2", submitted_at: `${TODAY}T07:10:00Z` }),
    ];
    render(<DaySessions />);

    expect(screen.getByText('daySummary:{"total":2,"saved":1,"pending":1}')).toBeInTheDocument();
  });

  it("leaves the teacher's own report to the area's tab, not a header link", () => {
    todaySessions = [session({ schedule_id: "s1" })];
    render(<DaySessions />);

    expect(screen.queryByRole("link", { name: "myReportLink" })).not.toBeInTheDocument();
  });
});
