import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";

import { StaffAttendanceHub } from "./staff-attendance-hub";

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  roles: [] as { slug: string }[],
  adminQueryEnabled: [] as boolean[],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useFormatter: () => ({ dateTime: () => "Rab, 18 Nov" }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      permissions: state.permissions,
      profile_kind: "staff",
      roles: state.roles,
      modules: [],
    },
  }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../dashboard/api", () => ({
  useAdminDashboardQuery: (enabled: boolean) => {
    state.adminQueryEnabled.push(enabled);
    return {
      data: enabled ? { attendance_today: { submitted: 3, total: 10 } } : undefined,
    };
  },
}));

afterEach(() => {
  cleanup();
  state.roles = [];
  state.adminQueryEnabled = [];
});

it("offers only links the route guard lets the principal open", () => {
  state.permissions = ["view_reports", "view_attendance"];
  render(<StaffAttendanceHub />);
  const access = navAccessFromMe({
    permissions: state.permissions,
    profile_kind: "staff",
    roles: [],
  } as never);
  for (const link of screen.queryAllByRole("link")) {
    expect(canOpenPath(link.getAttribute("href") ?? "", access)).toBe(true);
  }
  // view_reports opens the attendance reports (daily and monthly recaps).
  expect(screen.getByRole("link", { name: "openReports" })).toHaveAttribute(
    "href",
    "/attendance/reports",
  );
});

it("links the monitor for a holder of view_monitor_presence", () => {
  state.permissions = ["view_monitor_presence"];
  render(<StaffAttendanceHub />);
  expect(screen.getByRole("link", { name: "openMonitor" })).toHaveAttribute("href", "/monitor");
});

it("asks for the admin snapshot only for an administrator or the principal, and shows its progress", () => {
  state.permissions = ["view_reports"];
  render(<StaffAttendanceHub />);
  expect(state.adminQueryEnabled.every((enabled) => !enabled)).toBe(true);
  cleanup();

  for (const slug of ["admin", "principal"]) {
    state.roles = [{ slug }];
    render(<StaffAttendanceHub />);
    expect(
      screen.getByRole("heading", { name: 'progressTitle:{"submitted":3,"total":10}' }),
    ).toBeInTheDocument();
    cleanup();
  }
});
