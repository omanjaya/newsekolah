import { render, screen } from "@testing-library/react";
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

vi.mock("@newsekolah/i18n", () => ({
  formatTime: () => "07:10",
}));

const mePermissions: string[] = ["view_reports", "view_monitor_presence"];
const meRoleSlug = "teacher";

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      id: "me-1",
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
  it("spans the last card full width for an odd session count", () => {
    todaySessions = [
      session({ schedule_id: "s1" }),
      session({ schedule_id: "s2" }),
      session({ schedule_id: "s3" }),
    ];
    render(<DaySessions />);

    const cells = ["s1", "s2", "s3"].map((id) =>
      screen.getByTestId(`attendance-session-cell-${id}`),
    );
    expect(cells[0]?.className).not.toContain("lg:col-span-2");
    expect(cells[1]?.className).not.toContain("lg:col-span-2");
    expect(cells[2]?.className).toContain("lg:col-span-2");
  });

  it("does not span any card for an even session count", () => {
    todaySessions = [session({ schedule_id: "s1" }), session({ schedule_id: "s2" })];
    render(<DaySessions />);

    for (const id of ["s1", "s2"]) {
      expect(screen.getByTestId(`attendance-session-cell-${id}`).className).not.toContain(
        "lg:col-span-2",
      );
    }
  });

  it("gives the running session card the accent ring", () => {
    todaySessions = [
      // 07:10 falls inside p1 (07:00-07:40): this one is "ongoing".
      session({ schedule_id: "running", start_period_id: "p1", end_period_id: "p1" }),
      // p2 (07:40-08:20) has not started yet.
      session({ schedule_id: "future", start_period_id: "p2", end_period_id: "p2" }),
    ];
    render(<DaySessions />);

    const runningCard = screen.getByTestId("attendance-session-card-running");
    const futureCard = screen.getByTestId("attendance-session-card-future");
    expect(runningCard.className).toContain("ring-accent");
    expect(futureCard.className).not.toContain("ring-accent");
  });

  it("shows the primary fill action for the running, unsubmitted session", () => {
    todaySessions = [
      session({ schedule_id: "running", start_period_id: "p1", end_period_id: "p1" }),
    ];
    render(<DaySessions />);

    expect(screen.getByRole("button", { name: "fillAttendance" })).toBeInTheDocument();
  });

  it("shows the secondary open action for a future, unsubmitted session", () => {
    todaySessions = [
      session({ schedule_id: "future", start_period_id: "p2", end_period_id: "p2" }),
    ];
    render(<DaySessions />);

    expect(screen.getByRole("button", { name: "openSubmitted" })).toBeInTheDocument();
  });

  it("shows a clickable saved badge for a submitted session", () => {
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
    expect(screen.queryByRole("button", { name: "openSubmitted" })).not.toBeInTheDocument();
    const savedButtons = screen
      .getAllByRole("button")
      .filter((b) => b.textContent.includes("statusSavedAt"));
    expect(savedButtons).toHaveLength(1);
  });

  it("renders exactly three stat tiles for the day", () => {
    todaySessions = [session({ schedule_id: "s1" })];
    render(<DaySessions />);

    expect(screen.getByTestId("attendance-day-tile-total")).toBeInTheDocument();
    expect(screen.getByTestId("attendance-day-tile-saved")).toBeInTheDocument();
    expect(screen.getByTestId("attendance-day-tile-pending")).toBeInTheDocument();
  });
});
