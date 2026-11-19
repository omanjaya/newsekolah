import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  profileKind: "teacher",
  permissions: [] as string[],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      id: "me-1",
      profile_kind: session.profileKind,
      permissions: session.permissions,
      tenant: { timezone: "Asia/Jakarta" },
    },
  }),
  useCan: (permission: string) => session.permissions.includes(permission),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/hooks/use-url-state", () => ({
  useUrlState: (_key: string, _values: string[], fallback: string) => [fallback, vi.fn()],
}));
vi.mock("../../../lib/hooks/use-date-filter", () => ({
  useDateFilter: (_key: string, fallback: string) => [fallback, vi.fn()],
}));
vi.mock("../../attendance/components/day-stepper", () => ({ DayStepper: () => null }));
vi.mock("../api", () => ({
  todayInZone: () => "2026-11-19",
  useStaffAttendanceRosterQuery: () => ({ data: { data: [] } }),
}));
vi.mock("./today-board-view", () => ({ TodayBoardView: () => null }));
vi.mock("./schedule-editor-view", () => ({ ScheduleEditorView: () => null }));
vi.mock("./employee-recap-view", () => ({ EmployeeRecapView: () => null }));
vi.mock("./import-view", () => ({ StaffAttendanceImportView: () => null }));

import { StaffAttendanceView } from "./staff-attendance-view";

describe("StaffAttendanceView", () => {
  beforeEach(() => {
    session.profileKind = "teacher";
    session.permissions = [];
  });

  it("links an employee to their own check-in under the check-in page's icon", () => {
    render(<StaffAttendanceView />);

    const link = screen.getByRole("link", { name: "self.title" });
    expect(link).toHaveAttribute("href", "/check-in");
    // Each link carries its destination's registry icon: /check-in is LogIn.
    expect(link.querySelector("svg.lucide-log-in")).toBeInTheDocument();
    expect(link.querySelector("svg.lucide-fingerprint")).not.toBeInTheDocument();
  });

  it("offers no check-in link to a reader who is not an employee", () => {
    session.profileKind = "student";
    render(<StaffAttendanceView />);

    expect(screen.queryByRole("link", { name: "self.title" })).not.toBeInTheDocument();
  });
});
