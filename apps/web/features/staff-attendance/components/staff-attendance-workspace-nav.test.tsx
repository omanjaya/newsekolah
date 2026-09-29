import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StaffAttendanceWorkspaceNav } from "./staff-attendance-workspace-nav";

const session = vi.hoisted(() => ({ profile_kind: "teacher", permissions: [] as string[] }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => "/check-in" }));
vi.mock("../../../lib/session/session-provider", () => ({ useSession: () => ({ me: session }) }));

describe("staff attendance workspace access", () => {
  beforeEach(() => {
    session.profile_kind = "teacher";
    session.permissions = [];
  });

  it("allows personal check-in without administrative attendance permission", () => {
    render(<StaffAttendanceWorkspaceNav />);
    expect(screen.getByRole("link", { name: "myAttendanceStaff" })).toHaveAttribute(
      "href",
      "/check-in",
    );
    expect(screen.queryByRole("link", { name: "allEmployees" })).not.toBeInTheDocument();
  });

  it("shows both scopes to an employee with administrative access", () => {
    session.profile_kind = "staff";
    session.permissions = ["view_staff_attendance"];
    render(<StaffAttendanceWorkspaceNav />);
    expect(screen.getByRole("link", { name: "myAttendanceStaff" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "allEmployees" })).toHaveAttribute(
      "href",
      "/staff-attendance",
    );
  });

  it("does not grant check-in to a nonemployee who may view staff reports", () => {
    session.profile_kind = "student";
    session.permissions = ["view_staff_attendance"];
    render(<StaffAttendanceWorkspaceNav />);
    expect(screen.queryByRole("link", { name: "myAttendanceStaff" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "allEmployees" })).toBeInTheDocument();
  });

  it("does not expose either scope to an unrelated parent", () => {
    session.profile_kind = "parent";
    render(<StaffAttendanceWorkspaceNav />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
