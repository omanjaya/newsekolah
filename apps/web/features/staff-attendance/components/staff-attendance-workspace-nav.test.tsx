import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StaffAttendanceWorkspaceNav } from "./staff-attendance-workspace-nav";

const session = vi.hoisted(() => ({ profile_kind: "teacher", permissions: [] as string[] }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => "/check-in" }));
// Every offered destination as a link, a lone one included: these tests
// check access boundaries, not how the strip draws a single item.
vi.mock("../../../components/workspace-nav", () => import("../../../test/workspace-nav-stub"));
vi.mock("../../../lib/session/session-provider", () => ({ useSession: () => ({ me: session }) }));

// Each tab is named by its navigation registry entry (the mock returns the key).
const MY_ATTENDANCE = "app.staffAttendance.self.navLabel";
const ALL_EMPLOYEES = "app.staffAttendance.navLabel";

describe("staff attendance workspace access", () => {
  beforeEach(() => {
    session.profile_kind = "teacher";
    session.permissions = [];
  });

  it("allows personal check-in without administrative attendance permission", () => {
    render(<StaffAttendanceWorkspaceNav />);
    expect(screen.getByRole("link", { name: MY_ATTENDANCE })).toHaveAttribute("href", "/check-in");
    expect(screen.queryByRole("link", { name: ALL_EMPLOYEES })).not.toBeInTheDocument();
  });

  it("shows both scopes to an employee with administrative access", () => {
    session.profile_kind = "staff";
    session.permissions = ["view_staff_attendance"];
    render(<StaffAttendanceWorkspaceNav />);
    expect(screen.getByRole("link", { name: MY_ATTENDANCE })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: ALL_EMPLOYEES })).toHaveAttribute(
      "href",
      "/staff-attendance",
    );
  });

  it("does not grant check-in to a nonemployee who may view staff reports", () => {
    session.profile_kind = "student";
    session.permissions = ["view_staff_attendance"];
    render(<StaffAttendanceWorkspaceNav />);
    expect(screen.queryByRole("link", { name: MY_ATTENDANCE })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: ALL_EMPLOYEES })).toBeInTheDocument();
  });

  it("does not expose either scope to an unrelated parent", () => {
    session.profile_kind = "parent";
    render(<StaffAttendanceWorkspaceNav />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
