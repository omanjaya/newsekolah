import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LeaveRequestsView } from "./leave-requests-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

let canSubmit = false;
let canIssue = false;
let canReview = false;
let profileKind = "student";

vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => {
    if (permission === "submit_leave_requests") return canSubmit;
    if (permission === "issue_leave_letters") return canIssue;
    if (permission === "review_leave_requests") return canReview;
    return false;
  },
  useSession: () => ({ me: { profile_kind: profileKind } }),
}));

vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("./review-inbox-banner", () => ({ ReviewInboxBanner: () => null }));

vi.mock("./my-leave-requests", () => ({
  MyLeaveRequests: () => <div data-testid="my-leave-requests-stub" />,
}));

describe("LeaveRequestsView", () => {
  it("leaves the h1 and eyebrow to the template, so they stay the area's on every tab", () => {
    canSubmit = true;
    canIssue = false;
    render(<LeaveRequestsView />);
    // The stub renders a title the view passes as the h1; the real
    // template derives the area's label when none is passed.
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText("permits")).not.toBeInTheDocument();
  });

  it("shows the submit action and the history, with no tabs, for a student", () => {
    canSubmit = true;
    canIssue = false;
    render(<LeaveRequestsView />);
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
    expect(screen.getByTestId("my-leave-requests-stub")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("sends an issuer-only counselor to the inbox's leave queue, where the letter stage waits", () => {
    canSubmit = false;
    canIssue = true;
    render(<LeaveRequestsView />);
    expect(screen.getByText("issuerTitle")).toBeInTheDocument();
    expect(screen.getByText("issuerQueueInboxBody")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "submit" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "issuerOpenInbox" })).toHaveAttribute(
      "href",
      "/inbox?type=leave",
    );
  });

  it("sends an issuer who also reviews to the inbox's leave queue, notifications second", () => {
    canSubmit = false;
    canIssue = true;
    canReview = true;
    render(<LeaveRequestsView />);
    expect(screen.getByRole("link", { name: "issuerOpenInbox" })).toHaveAttribute(
      "href",
      "/inbox?type=leave",
    );
    // The text and the icon point where the main button goes, not to the
    // notifications.
    expect(screen.getByText("issuerQueueInboxBody")).toBeInTheDocument();
    expect(document.querySelector("svg.lucide-inbox")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "openNotifications" })).toHaveAttribute(
      "href",
      "/notifications",
    );
    canReview = false;
  });

  it("gives an admin, who holds the permission but files nothing, no submit flow", () => {
    canSubmit = true;
    canIssue = false;
    profileKind = "staff";
    render(<LeaveRequestsView />);
    expect(screen.queryByRole("button", { name: "submit" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("my-leave-requests-stub")).not.toBeInTheDocument();
    profileKind = "student";
  });

  it("shows the no-access empty state for a role with neither permission", () => {
    canSubmit = false;
    canIssue = false;
    const { container } = render(<LeaveRequestsView />);
    expect(screen.getByText("noAccessTitle")).toBeInTheDocument();
    // The leave icon, not the exit permit door.
    expect(container.querySelector(".lucide-clipboard-list")).not.toBeNull();
    expect(container.querySelector(".lucide-door-open")).toBeNull();
  });
});
