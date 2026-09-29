import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CounselingWorkspaceNav,
  DutyWorkspaceActions,
  VisitorsWorkspaceNav,
} from "./service-workspace-nav";

const session = vi.hoisted(() => ({ permissions: [] as string[], pathname: "/analytics" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => session.pathname }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => session.permissions.includes(permission),
}));

beforeEach(() => {
  session.permissions = [];
  session.pathname = "/analytics";
});

describe("student service workspace boundaries", () => {
  it("does not expose counseling to a monitoring-only reader", () => {
    session.permissions = ["view_early_warning"];
    render(<CounselingWorkspaceNav />);
    expect(screen.getByRole("link", { name: "monitoring" })).toHaveAttribute("href", "/analytics");
    expect(screen.queryByRole("link", { name: "sessions" })).not.toBeInTheDocument();
  });

  it("does not imply monitoring access from counseling permission", () => {
    session.permissions = ["manage_counseling"];
    render(<CounselingWorkspaceNav />);
    expect(screen.getByRole("link", { name: "sessions" })).toHaveAttribute(
      "href",
      "/discipline/counseling",
    );
    expect(screen.queryByRole("link", { name: "monitoring" })).not.toBeInTheDocument();
  });

  it("keeps incident-only visitor access independent of gate operations and reports", () => {
    session.permissions = ["view_visitor_incidents"];
    render(<VisitorsWorkspaceNav />);
    expect(screen.getByRole("link", { name: "incidents" })).toHaveAttribute(
      "href",
      "/visitors/incidents",
    );
    expect(screen.queryAllByRole("link")).toHaveLength(1);
  });

  it("only offers the presence monitor with its own permission", () => {
    session.permissions = ["issue_scan_tokens"];
    const { rerender } = render(<DutyWorkspaceActions />);
    expect(screen.queryByRole("link", { name: "monitor" })).not.toBeInTheDocument();
    session.permissions.push("view_monitor_presence");
    rerender(<DutyWorkspaceActions />);
    expect(screen.getByRole("link", { name: "monitor" })).toHaveAttribute("target", "_blank");
  });
});
