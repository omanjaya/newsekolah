import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reader = vi.hoisted(() => ({ permissions: [] as string[], role: "teacher" }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => reader.permissions.includes(permission),
  useSession: () => ({
    me: {
      id: "me-1",
      permissions: reader.permissions,
      roles: [{ id: "r1", slug: reader.role, name: reader.role }],
      tenant: { timezone: "Asia/Jakarta" },
    },
  }),
}));
vi.mock("../../../lib/hooks/use-date-filter", () => ({
  useDateFilter: (_key: string, fallback: string) => [fallback, vi.fn()],
}));
vi.mock("../api", () => ({
  todayInZone: () => "2026-09-29",
  useOwnDailyAttendanceReportQuery: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("./attendance-daily-sessions", () => ({ AttendanceDailySessions: () => null }));
vi.mock("./daily-report-tab", () => ({ DailyReportTab: () => <div>panel:daily</div> }));
vi.mock("./monthly-report-tab", () => ({ MonthlyReportTab: () => <div>panel:monthly</div> }));

import { AttendanceReportsView } from "./attendance-reports-view";

function tabNames(): (string | null)[] {
  return screen.queryAllByRole("tab").map((tab) => tab.textContent);
}

describe("AttendanceReportsView", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/attendance/reports");
  });

  it("offers a teacher with view_reports their own report beside the school's", () => {
    reader.permissions = ["manage_attendance", "view_reports"];
    reader.role = "teacher";
    render(<AttendanceReportsView />);
    expect(tabNames()).toEqual(["tabs.mine", "tabs.daily", "tabs.monthly"]);
  });

  it("leaves 'Presensi saya' out for a reader who teaches nothing", () => {
    reader.permissions = ["manage_attendance", "view_reports"];
    reader.role = "admin";
    render(<AttendanceReportsView />);
    expect(tabNames()).toEqual(["tabs.daily", "tabs.monthly"]);
  });

  it("shows a teacher without view_reports their own report, with no switch", () => {
    reader.permissions = ["manage_attendance"];
    reader.role = "teacher";
    render(<AttendanceReportsView />);
    expect(tabNames()).toEqual([]);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });

  it("writes the shared ?date= in the short shape the 'Harian' tab uses", () => {
    reader.permissions = ["manage_attendance"];
    reader.role = "teacher";
    render(<AttendanceReportsView />);
    // "29 Sep 2026", not the picker's default long month.
    expect(screen.getByText(/^29 Sep 2026$/)).toBeInTheDocument();
    expect(screen.queryByText(/September/)).not.toBeInTheDocument();
  });
});
