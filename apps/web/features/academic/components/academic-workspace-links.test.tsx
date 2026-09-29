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

it("does not expose journals or reports to students with academic read permissions", () => {
  state.profile_kind = "student";
  state.permissions = ["view_attendance", "view_academic_data"];
  render(<AcademicWorkspaceLinks area="attendance" />);
  expect(screen.getByRole("link", { name: "sessions" })).toHaveAttribute("href", "/attendance");
  expect(screen.queryByRole("link", { name: "journal" })).toBeNull();
  expect(screen.queryByRole("link", { name: "reports" })).toBeNull();
});

it("keeps teacher history and personal reports reachable with their existing permissions", () => {
  state.permissions = ["view_attendance", "view_academic_data", "manage_attendance"];
  render(<AcademicWorkspaceLinks area="attendance" />);
  expect(screen.getByRole("link", { name: "journal" })).toHaveAttribute("href", "/journal");
  expect(screen.getByRole("link", { name: "reports" })).toHaveAttribute(
    "href",
    "/attendance/reports",
  );
});

it("never fetches the substitute inbox for a schedule reader", () => {
  state.permissions = ["view_schedules"];
  render(<AcademicWorkspaceLinks area="schedule" />);
  expect(state.inbox).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: "substitutions" })).toBeNull();
});

it("preserves source and destination years between independently authorized steps", () => {
  state.permissions = ["manage_enrollments"];
  state.search = "fromYear=old&toYear=new&unrelated=drop";
  render(<AcademicWorkspaceLinks area="years" />);
  expect(screen.getByRole("link", { name: "promotion" })).toHaveAttribute(
    "href",
    "/school/promotion?fromYear=old&toYear=new",
  );
  expect(screen.queryByRole("link", { name: "setup" })).toBeNull();
});

it("keeps role administration independent of access to user accounts", () => {
  state.permissions = ["view_roles"];
  render(<AcademicWorkspaceLinks area="users" />);
  expect(screen.getByRole("link", { name: "roles" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "accounts" })).toBeNull();
});
