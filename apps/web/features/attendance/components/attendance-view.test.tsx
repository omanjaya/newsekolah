import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

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
let meRoleSlug = "teacher";

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

interface TeacherOptionsResult {
  data?: { data: { id: string; name: string }[] };
  isLoading: boolean;
}

function noTeacherOptions(enabled: boolean): TeacherOptionsResult {
  return enabled ? { data: { data: [] }, isLoading: false } : { data: undefined, isLoading: false };
}

const teacherOptionsQuery = vi.fn(
  (_yearId: string, _search: string, enabled: boolean): TeacherOptionsResult =>
    noTeacherOptions(enabled),
);

vi.mock("../../schedule/api", () => ({
  useTeacherOptionsQuery: (yearId: string, search: string, enabled: boolean) =>
    teacherOptionsQuery(yearId, search, enabled),
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
let holidayName: string | undefined;

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof AttendanceApiModule>("../api");
  return {
    ...actual,
    todayInZone: () => TODAY,
    nowTimeInZone: () => "07:10:00",
    useTodaySessionsQuery: () => ({
      data: { data: todaySessions, holiday_name: holidayName },
      isLoading: false,
    }),
    useOpenSessionMutation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    }),
  };
});

beforeAll(() => {
  // Radix Select reads pointer-capture and scroll APIs jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
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
    // The viewer may still save it, unless a test says otherwise.
    editable_until: "2099-12-31T23:59:59Z",
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

  it("shows a lesson on a later day as not held yet, with nothing to open", () => {
    // The list answered for a later day (the teacher stepped forward).
    todaySessions = [
      session({ schedule_id: "monday", date: "2099-01-05", start_period_id: "p1" }),
      session({ schedule_id: "monday-2", date: "2099-01-05", start_period_id: "p2" }),
    ];
    render(<DaySessions />);

    const row = screen.getByTestId("attendance-session-row-monday-2");
    expect(row).toHaveTextContent("statusUpcoming");
    expect(within(row).getByRole("button", { name: /Matematika · Kelas 10 A/ })).toBeDisabled();
    // Even in the hero spot, the action is a disabled "not held yet".
    expect(screen.getByRole("button", { name: "statusUpcoming" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "fillAttendance" })).not.toBeInTheDocument();
  });

  it("sums the day up in one line beside the day switcher, not in the header", () => {
    todaySessions = [
      session({ schedule_id: "s1" }),
      session({ schedule_id: "s2", submitted_at: `${TODAY}T07:10:00Z` }),
    ];
    render(<DaySessions />);

    // The header has no description, so the area's tab row keeps its
    // place on every sibling tab (/journal, /attendance/reports).
    expect(screen.getByTestId("attendance-day-summary")).toHaveTextContent(
      'daySummary:{"total":2,"saved":1,"pending":1}',
    );
  });

  it("marks a lesson handed to a substitute and does not count it as waiting", () => {
    todaySessions = [
      // Running now, but an accepted substitute teaches it.
      session({ schedule_id: "handed", handed_over_to_user_id: "sub-1" }),
      session({ schedule_id: "own", start_period_id: "p2", end_period_id: "p2" }),
    ];
    render(<DaySessions />);

    expect(screen.getByTestId("attendance-session-hero")).not.toHaveTextContent("statusHandedOver");
    expect(screen.getByTestId("attendance-session-row-handed")).toHaveTextContent(
      "statusHandedOver",
    );
    expect(screen.getByTestId("attendance-session-row-handed")).not.toHaveTextContent(
      "statusPending",
    );
    expect(screen.getByTestId("attendance-day-summary")).toHaveTextContent(
      'daySummary:{"total":2,"saved":0,"pending":1}',
    );
    expect(screen.getByTestId("attendance-day-summary")).toHaveTextContent(
      'dayHandedOver:{"count":1}',
    );
  });

  it("shows a lesson on a date that has not arrived as not open yet, and does not open it", () => {
    todaySessions = [
      session({ schedule_id: "tomorrow", date: "2026-09-30", start_period_id: "p2" }),
      session({ schedule_id: "today" }),
    ];
    render(<DaySessions />);

    const row = screen.getByTestId("attendance-session-row-tomorrow");
    expect(row).toHaveTextContent("statusUpcoming");
    expect(within(row).queryByRole("button") ?? row.closest("button")).toBeDisabled();
  });

  it("does not count lessons on a future date as waiting to be filled", () => {
    todaySessions = [
      session({ schedule_id: "a", date: "2026-09-30" }),
      session({ schedule_id: "b", date: "2026-09-30", start_period_id: "p2", end_period_id: "p2" }),
    ];
    render(<DaySessions />);

    expect(screen.getByTestId("attendance-day-summary")).toHaveTextContent(
      'daySummary:{"total":2,"saved":0,"pending":0}',
    );
  });

  // schedule-attendance-R1: a later-day lesson that already has a
  // submission (saved under the time simulation, or by an older build) was
  // counted as saved and as not open yet, so pending read -1.
  it("never counts a submitted later-day lesson twice", () => {
    todaySessions = [
      session({
        schedule_id: "own",
        date: "2026-09-30",
        submitted_at: "2026-09-29T15:30:00Z",
      }),
      session({
        schedule_id: "handed",
        date: "2026-09-30",
        start_period_id: "p2",
        end_period_id: "p2",
        submitted_at: "2026-09-29T15:30:00Z",
        handed_over_to_user_id: "sub-1",
      }),
    ];
    render(<DaySessions />);

    const summary = screen.getByTestId("attendance-day-summary");
    expect(summary).toHaveTextContent('daySummary:{"total":2,"saved":0,"pending":0}');
    expect(summary).not.toHaveTextContent("dayHandedOver");
  });

  it("badges a session by the viewer's save deadline, not by its date (R1)", () => {
    todaySessions = [
      // Saved last week and still correctable: not "locked".
      session({
        schedule_id: "correctable",
        date: "2026-09-22",
        submitted_at: "2026-09-22T07:10:00Z",
        editable_until: "2099-12-31T23:59:59Z",
      }),
      // Saved, and the deadline has passed: locked.
      session({
        schedule_id: "locked",
        date: "2026-09-08",
        submitted_at: "2026-09-08T07:10:00Z",
        editable_until: "2026-09-15T23:59:59+07:00",
        start_period_id: "p2",
        end_period_id: "p2",
      }),
      // Never saved, and the deadline has passed: no longer to fill.
      session({
        schedule_id: "missed",
        date: "2026-09-08",
        editable_until: "2026-09-15T23:59:59+07:00",
        start_period_id: "p2",
        end_period_id: "p2",
      }),
    ];
    render(<DaySessions />);

    // The running period makes the correctable session the hero.
    const correctable = screen.getByTestId("attendance-session-hero");
    expect(correctable).toHaveTextContent("statusSavedAt");
    expect(correctable).not.toHaveTextContent("statusLocked");
    expect(screen.getByTestId("attendance-session-row-locked")).toHaveTextContent("statusLocked");
    const missed = screen.getByTestId("attendance-session-row-missed");
    expect(missed).toHaveTextContent("statusMissed");
    expect(missed).not.toHaveTextContent("statusPending");
    expect(screen.getByTestId("attendance-day-summary")).toHaveTextContent(
      'daySummary:{"total":3,"saved":2,"pending":0}',
    );
    expect(screen.getByTestId("attendance-day-summary")).toHaveTextContent('dayMissed:{"count":1}');
  });

  // A past day's badge ("Tersimpan pukul 07.40", "Terkunci, belum diisi")
  // is wider than a phone's row has to spare beside "Mapel · Kelas". The
  // row keeps the class name and each period range whole: out of room,
  // the badge moves under the text (ListRow keepMetaWhole) and the title
  // may take a second line, instead of being cut to "Matemati…".
  it.each(["missed", "locked"] as const)(
    "keeps the class name and periods of a %s row whole beside its badge",
    (scheduleId) => {
      todaySessions = [
        // The running lesson takes the hero, so the row under test is listed.
        session({ schedule_id: "running" }),
        session({
          schedule_id: scheduleId,
          date: "2026-09-08",
          editable_until: "2026-09-15T23:59:59+07:00",
          start_period_id: "p1",
          end_period_id: "p2",
          roster_count: 4,
          entered_count: 1,
          ...(scheduleId === "locked" ? { submitted_at: "2026-09-08T07:10:00Z" } : {}),
        }),
      ];
      render(<DaySessions />);

      const row = screen.getByTestId(`attendance-session-row-${scheduleId}`);
      expect(row.querySelector("[data-slot=list-row-body]")).toHaveClass("flex-wrap");
      const title = within(row).getByRole("button", { name: /Matematika · Kelas 10 A/ });
      expect(title).toHaveClass("line-clamp-2");
      expect(title).not.toHaveClass("truncate");
      // Each fact is its own unbreakable box, so the line never wraps
      // inside "Jam ke-1 – Jam ke-2".
      const facts = Array.from(row.querySelectorAll("[data-meta-fact]"), (fact) =>
        fact.textContent.trim(),
      );
      expect(facts).toEqual(["Jam ke-1 – Jam ke-2 ·", 'fillProgress:{"entered":1,"roster":4}']);
    },
  );

  it("badges another teacher's day by that teacher's deadline, not the viewer's lock (R1)", async () => {
    // A manager without correction rights may not save another teacher's
    // session (no editable_until), but that teacher still fills it today.
    const user = userEvent.setup();
    mePermissions.push("manage_schedules");
    teacherOptionsQuery.mockImplementation(() => ({
      data: {
        data: [
          { id: "me-1", name: "Saya" },
          { id: "teacher-2", name: "Bu Ani" },
        ],
      },
      isLoading: false,
    }));
    todaySessions = [
      session({
        schedule_id: "theirs",
        teacher_user_id: "teacher-2",
        editable_until: undefined,
        owner_editable_until: "2099-12-31T23:59:59Z",
      }),
    ];
    try {
      render(<DaySessions />);
      await user.click(screen.getByRole("combobox", { name: "teacherLabel" }));
      await user.click(screen.getByRole("option", { name: "Bu Ani" }));

      // Still to fill: the running lesson keeps its fill action.
      const hero = screen.getByTestId("attendance-session-hero");
      expect(hero).toHaveTextContent("fillAttendance");
      expect(hero).not.toHaveTextContent("statusMissed");
      const summary = screen.getByTestId("attendance-day-summary");
      expect(summary).toHaveTextContent('daySummary:{"total":1,"saved":0,"pending":1}');
      expect(summary).not.toHaveTextContent("dayMissed");
    } finally {
      mePermissions.pop();
      teacherOptionsQuery.mockImplementation((_yearId, _search, enabled) =>
        noTeacherOptions(enabled),
      );
    }
  });

  it("names the holiday instead of listing lessons on a holiday", () => {
    todaySessions = [];
    holidayName = "Hari Guru Nasional";
    try {
      render(<DaySessions />);
      expect(screen.getByText('holidayTitle:{"name":"Hari Guru Nasional"}')).toBeInTheDocument();
      expect(screen.getByText("holidayBody")).toBeInTheDocument();
      expect(screen.queryByText("noScheduleTitle")).not.toBeInTheDocument();
    } finally {
      holidayName = undefined;
    }
  });

  it("offers the monitor once, in the school card, before a teacher is picked", () => {
    meRoleSlug = "admin";
    try {
      render(<DaySessions />);
      const links = screen.getAllByRole("link", { name: "openMonitor" });
      expect(links).toHaveLength(1);
      expect(
        within(screen.getByTestId("school-attendance-today")).getByRole("link", {
          name: "openMonitor",
        }),
      ).toBe(links[0]);
    } finally {
      meRoleSlug = "teacher";
    }
  });

  it("points a day without lessons to the timetable", () => {
    todaySessions = [];
    mePermissions.push("view_schedules");
    try {
      render(<DaySessions />);
      expect(screen.getByText("noScheduleTitle")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "openSchedule" })).toHaveAttribute(
        "href",
        "/schedule",
      );
    } finally {
      mePermissions.pop();
    }
  });

  it("does not ask for teacher options a teacher without schedule rights may not read", () => {
    // A picket teacher (manage_attendance by duty, no teaching load) is
    // refused the list with a 403; the picker would only hold themselves.
    teacherOptionsQuery.mockClear();
    todaySessions = [];
    render(<DaySessions />);

    expect(teacherOptionsQuery).toHaveBeenCalled();
    expect(teacherOptionsQuery.mock.calls.every(([, , enabled]) => !enabled)).toBe(true);
    expect(screen.queryByText("teacherLabel")).not.toBeInTheDocument();
  });

  it("asks for teacher options when the reader may pick any teacher", () => {
    teacherOptionsQuery.mockClear();
    mePermissions.push("manage_schedules");
    try {
      render(<DaySessions />);
      expect(teacherOptionsQuery).toHaveBeenCalledWith("year-1", "", true);
    } finally {
      mePermissions.pop();
    }
  });

  it("leaves the teacher's own report to the area's tab, not a header link", () => {
    todaySessions = [session({ schedule_id: "s1" })];
    render(<DaySessions />);

    expect(screen.queryByRole("link", { name: "myReportLink" })).not.toBeInTheDocument();
  });
});
