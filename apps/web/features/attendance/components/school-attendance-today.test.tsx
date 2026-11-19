import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ permissions: [] as string[], roleSlug: "principal" }));
const dashboard = vi.hoisted(() => ({
  enabled: [] as boolean[],
  data: undefined as { attendance_today: { submitted: number; total: number } } | undefined,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useFormatter: () => ({ dateTime: () => "Rab, 18 Nov" }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      id: "me-1",
      permissions: session.permissions,
      profile_kind: "teacher",
      roles: [{ id: "r1", slug: session.roleSlug, name: "Kepala sekolah" }],
      duties: [],
      disabled_modules: [],
    },
  }),
}));
vi.mock("../../dashboard/api", () => ({
  useAdminDashboardQuery: (enabled: boolean) => {
    dashboard.enabled.push(enabled);
    return { data: enabled ? dashboard.data : undefined };
  },
}));

import { SchoolAttendanceToday } from "./school-attendance-today";

describe("SchoolAttendanceToday", () => {
  beforeEach(() => {
    session.permissions = [];
    session.roleSlug = "principal";
    dashboard.enabled = [];
    dashboard.data = undefined;
  });

  it("names the attendance report and promises the monitor to a reader who has both", () => {
    session.permissions = ["manage_attendance", "view_monitor_presence"];
    render(<SchoolAttendanceToday />);

    expect(screen.getByRole("link", { name: "openReports" })).toHaveAttribute(
      "href",
      "/attendance/reports",
    );
    expect(screen.getByRole("link", { name: "openMonitor" })).toHaveAttribute("href", "/monitor");
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("sends a reader without the monitor to the report centre, under its own name", () => {
    session.permissions = ["view_reports"];
    render(<SchoolAttendanceToday />);

    expect(screen.getByRole("link", { name: "openReportsHub" })).toHaveAttribute(
      "href",
      "/reports",
    );
    expect(screen.queryByRole("link", { name: "openMonitor" })).not.toBeInTheDocument();
    // The body does not promise a monitor the card does not offer.
    expect(screen.getByText("bodyReportsOnly")).toBeInTheDocument();
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });

  it("shows the principal the school's progress, as the server lets the principal read it", () => {
    dashboard.data = { attendance_today: { submitted: 3, total: 5 } };
    render(<SchoolAttendanceToday />);

    expect(dashboard.enabled).toContain(true);
    expect(screen.getByText('progressTitle:{"submitted":3,"total":5}')).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("does not ask for the snapshot on behalf of a teacher (the vice principal is one), whom the server refuses", () => {
    session.roleSlug = "teacher";
    render(<SchoolAttendanceToday />);

    expect(dashboard.enabled.every((enabled) => !enabled)).toBe(true);
  });

  it("names another day and opens that day's report instead of today's live figure", () => {
    session.permissions = ["manage_attendance", "view_monitor_presence"];
    dashboard.data = { attendance_today: { submitted: 3, total: 5 } };
    render(<SchoolAttendanceToday date="2026-11-18" today="2026-11-19" />);

    expect(screen.getByText('dayEyebrow:{"date":"Rab, 18 Nov"}')).toBeInTheDocument();
    expect(screen.getByText("dayTitle")).toBeInTheDocument();
    expect(screen.queryByText(/progressTitle/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "openReports" })).toHaveAttribute(
      "href",
      "/attendance/reports?date=2026-11-18",
    );
    // The monitor is live: it belongs to today only.
    expect(screen.queryByRole("link", { name: "openMonitor" })).not.toBeInTheDocument();
  });

  it("tells a reader on a future day that nothing is taken yet, with no report to open", () => {
    session.permissions = ["manage_attendance", "view_monitor_presence", "view_reports"];
    dashboard.data = { attendance_today: { submitted: 3, total: 5 } };
    render(<SchoolAttendanceToday date="2026-11-20" today="2026-11-19" />);

    expect(screen.getByText('dayEyebrow:{"date":"Rab, 18 Nov"}')).toBeInTheDocument();
    expect(screen.getByText("futureTitle")).toBeInTheDocument();
    expect(screen.getByText("futureBody")).toBeInTheDocument();
    // The past day's promise of a record in the reports does not apply.
    expect(screen.queryByText("dayTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("dayBody")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(dashboard.enabled.every((enabled) => !enabled)).toBe(true);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the live card when the chosen day is today", () => {
    session.permissions = ["manage_attendance"];
    render(<SchoolAttendanceToday date="2026-11-19" today="2026-11-19" />);

    expect(screen.getByText("eyebrow")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "openReports" })).toHaveAttribute(
      "href",
      "/attendance/reports",
    );
  });
});
