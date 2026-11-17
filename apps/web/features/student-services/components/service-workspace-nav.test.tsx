import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ActivitiesWorkspaceNav,
  CounselingWorkspaceNav,
  DisciplineWorkspaceNav,
  DutyWorkspaceActions,
  VisitorsWorkspaceNav,
} from "./service-workspace-nav";

const session = vi.hoisted(() => ({
  permissions: [] as string[],
  disabled_modules: [] as string[],
  pathname: "/analytics",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => session.pathname }));
// Every offered destination as a link, a lone one included: these tests
// check access boundaries, not how the strip draws a single item.
vi.mock("../../../components/workspace-nav", () => import("../../../test/workspace-nav-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => session.permissions.includes(permission),
  useSession: () => ({ me: { disabled_modules: session.disabled_modules } }),
}));

// Each page's tab is named by its navigation registry entry (the mock returns the key).
const EARLY_WARNING = "app.analytics.navLabel";
const COUNSELING_NOTES = "app.discipline.counseling.title";
const INCIDENTS = "nav.visitors.items.incidents";
const CLUBS = "app.activities.navLabelClubs";

beforeEach(() => {
  session.permissions = [];
  session.disabled_modules = [];
  session.pathname = "/analytics";
});

describe("student service workspace boundaries", () => {
  it("does not expose counseling to a monitoring-only reader", () => {
    session.permissions = ["view_early_warning"];
    render(<CounselingWorkspaceNav />);
    expect(screen.getByRole("link", { name: EARLY_WARNING })).toHaveAttribute("href", "/analytics");
    expect(screen.queryByRole("link", { name: COUNSELING_NOTES })).not.toBeInTheDocument();
  });

  it("does not imply monitoring access from counseling permission", () => {
    session.permissions = ["manage_counseling"];
    render(<CounselingWorkspaceNav />);
    expect(screen.getByRole("link", { name: COUNSELING_NOTES })).toHaveAttribute(
      "href",
      "/discipline/counseling",
    );
    expect(screen.queryByRole("link", { name: EARLY_WARNING })).not.toBeInTheDocument();
  });

  it("keeps incident-only visitor access independent of gate operations and reports", () => {
    session.permissions = ["view_visitor_incidents"];
    render(<VisitorsWorkspaceNav />);
    expect(screen.getByRole("link", { name: INCIDENTS })).toHaveAttribute(
      "href",
      "/visitors/incidents",
    );
    expect(screen.queryAllByRole("link")).toHaveLength(1);
  });

  it("gates each student activities tab by its own permission", () => {
    session.permissions = ["view_mentoring"];
    const { rerender } = render(<ActivitiesWorkspaceNav />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/mentoring/my-groups",
    ]);
    session.permissions = ["view_activities"];
    rerender(<ActivitiesWorkspaceNav />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/activities/clubs",
      "/activities/events",
      "/activities/achievements",
    ]);
    session.permissions = ["view_activities", "view_mentoring"];
    rerender(<ActivitiesWorkspaceNav />);
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("keeps the mentoring tab active on both mentoring URLs", () => {
    session.permissions = ["view_activities", "view_mentoring"];
    session.pathname = "/mentoring/groups/abc";
    render(<ActivitiesWorkspaceNav />);
    expect(screen.getByRole("link", { name: "mentoringTab" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: CLUBS })).not.toHaveAttribute("aria-current");
  });

  it("only offers the presence monitor with its own permission", () => {
    session.permissions = ["issue_scan_tokens"];
    const { rerender } = render(<DutyWorkspaceActions />);
    expect(screen.queryByRole("link", { name: "monitor" })).not.toBeInTheDocument();
    session.permissions.push("view_monitor_presence");
    rerender(<DutyWorkspaceActions />);
    expect(screen.getByRole("link", { name: "monitor" })).toHaveAttribute("target", "_blank");
  });

  it("drops the tabs of a module the school switched off", () => {
    session.permissions = ["view_activities", "view_mentoring"];
    session.disabled_modules = ["mentoring"];
    render(<ActivitiesWorkspaceNav />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/activities/clubs",
      "/activities/events",
      "/activities/achievements",
    ]);
  });

  it("offers no visitor tab while visitors is off", () => {
    session.permissions = ["view_visitors", "view_visitor_incidents", "view_visitor_reports"];
    session.disabled_modules = ["visitors"];
    render(<VisitorsWorkspaceNav />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("hides the permits shortcut of the duty actions while permits is off", () => {
    session.disabled_modules = ["permits"];
    render(<DutyWorkspaceActions />);
    expect(screen.queryByRole("link", { name: "permits" })).not.toBeInTheDocument();
  });

  it("names the visitor tabs after their menu entries", () => {
    session.permissions = ["view_visitors", "view_visitor_incidents", "view_visitor_reports"];
    render(<VisitorsWorkspaceNav />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "nav.visitors.items.board",
      "nav.visitors.items.expected",
      INCIDENTS,
      "nav.visitors.items.reports",
    ]);
  });

  it("names the discipline tabs after their menu entries", () => {
    session.permissions = ["view_discipline"];
    render(<DisciplineWorkspaceNav />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/discipline/violations",
      "/discipline/warning-letters",
    ]);
    expect(
      screen.getByRole("link", { name: "app.discipline.violations.title" }),
    ).toBeInTheDocument();
  });
});
