import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      id: "me-1",
      permissions: session.permissions,
      profile_kind: "teacher",
      roles: [{ id: "r1", slug: "principal", name: "Kepala sekolah" }],
      duties: [],
      disabled_modules: [],
    },
  }),
}));
vi.mock("../../dashboard/api", () => ({
  useAdminDashboardQuery: () => ({ data: undefined }),
}));

import { SchoolAttendanceToday } from "./school-attendance-today";

describe("SchoolAttendanceToday", () => {
  beforeEach(() => {
    session.permissions = [];
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
});
