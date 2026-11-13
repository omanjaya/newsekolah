import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";

import { StaffAttendanceHub } from "./staff-attendance-hub";

const state = vi.hoisted(() => ({
  permissions: [] as string[],
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: { permissions: state.permissions, profile_kind: "staff", roles: [], modules: [] },
  }),
}));
vi.mock("../../academic/components/academic-workspace-links", () => ({
  AcademicWorkspaceLinks: () => null,
}));

afterEach(cleanup);

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
  expect(screen.queryByRole("link", { name: "openReports" })?.getAttribute("href")).not.toBe(
    "/attendance/reports",
  );
});

it("links the monitor for a holder of view_monitor_presence", () => {
  state.permissions = ["view_monitor_presence"];
  render(<StaffAttendanceHub />);
  expect(screen.getByRole("link", { name: "openMonitor" })).toHaveAttribute("href", "/monitor");
});
