import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AcademicWorkspaceLinks } from "./academic-workspace-links";

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  profile_kind: "teacher",
  pathname: "/attendance",
  search: "",
  inbox: vi.fn(() => ({ data: { data: [] } })),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useSession: () => ({ me: state }) }));
vi.mock("../../substitutions/api", () => ({ useSubstitutionsQuery: state.inbox }));
afterEach(cleanup);
beforeEach(() => {
  state.permissions = [];
  state.profile_kind = "teacher";
  state.pathname = "/attendance";
  state.search = "";
  state.inbox.mockClear();
});

// Tab labels are the navigation registry's own keys (the mock returns the key).
const JOURNAL = "app.journal.navLabel";
const ATTENDANCE_REPORTS = "app.attendanceReports.navLabel";
const SUBSTITUTIONS = "nav.academic.items.substituteTeacher";
const NEW_YEAR_SETUP = "nav.schoolData.items.newYearSetup";
const PROMOTION = "nav.schoolData.items.promotion";
const ACCOUNTS = "app.navigation.users";
const ROLES = "nav.settings.items.rolesAndAccess";

it("does not expose journals or reports to students with academic read permissions", () => {
  state.profile_kind = "student";
  state.permissions = ["view_attendance", "view_academic_data"];
  render(<AcademicWorkspaceLinks area="attendance" />);
  expect(screen.queryByRole("link", { name: JOURNAL })).toBeNull();
  expect(screen.queryByRole("link", { name: ATTENDANCE_REPORTS })).toBeNull();
});

it("renders no strip when only one destination is reachable", () => {
  state.profile_kind = "student";
  state.permissions = ["view_attendance", "view_academic_data"];
  const { container } = render(<AcademicWorkspaceLinks area="attendance" />);
  expect(container).toBeEmptyDOMElement();
});

it("keeps teacher history and personal reports reachable with their existing permissions", () => {
  state.permissions = ["view_attendance", "view_academic_data", "manage_attendance"];
  render(<AcademicWorkspaceLinks area="attendance" />);
  expect(screen.getByRole("link", { name: JOURNAL })).toHaveAttribute("href", "/journal");
  expect(screen.getByRole("link", { name: ATTENDANCE_REPORTS })).toHaveAttribute(
    "href",
    "/attendance/reports",
  );
});

it("never fetches the substitute inbox for a schedule reader", () => {
  state.permissions = ["view_schedules"];
  render(<AcademicWorkspaceLinks area="schedule" />);
  expect(state.inbox).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: SUBSTITUTIONS })).toBeNull();
});

it("preserves source and destination years between independently authorized steps", () => {
  state.permissions = ["manage_enrollments", "view_academic_data"];
  state.search = "fromYear=old&toYear=new&unrelated=drop";
  render(<AcademicWorkspaceLinks area="years" />);
  expect(screen.getByRole("link", { name: PROMOTION })).toHaveAttribute(
    "href",
    "/school/promotion?fromYear=old&toYear=new",
  );
  expect(screen.queryByRole("link", { name: NEW_YEAR_SETUP })).toBeNull();
});

it("withholds the accounts link from a reader who can only administer roles", () => {
  state.permissions = ["view_roles"];
  render(<AcademicWorkspaceLinks area="users" />);
  expect(screen.queryByRole("link", { name: ACCOUNTS })).toBeNull();
});

it("renders both role and account links when both are permitted", () => {
  state.permissions = ["view_roles", "view_users"];
  render(<AcademicWorkspaceLinks area="users" />);
  expect(screen.getByRole("link", { name: ROLES })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: ACCOUNTS })).toBeInTheDocument();
});

it("names the strip after the area's menu entry", () => {
  state.permissions = ["view_roles", "view_users"];
  render(<AcademicWorkspaceLinks area="users" />);
  expect(screen.getByRole("navigation", { name: "app.shell.nav.items.users" })).toBeInTheDocument();
});

it("renders no strip for a schedule viewer who can open only the calendar", () => {
  state.permissions = ["view_academic_data"];
  state.pathname = "/school/calendar";
  const { container } = render(<AcademicWorkspaceLinks area="schedule" />);
  expect(container).toBeEmptyDOMElement();
});

it("draws the schedule area as its pages only, the same strip as its sibling pages", () => {
  state.permissions = ["view_schedules", "view_academic_data", "manage_attendance"];
  state.pathname = "/school/calendar";
  render(<AcademicWorkspaceLinks area="schedule" />);
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
    "/schedule",
    "/school/calendar",
    "/substitutions",
  ]);
  expect(screen.queryByRole("button")).toBeNull();
  expect(state.inbox).not.toHaveBeenCalled();
});
