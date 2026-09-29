import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LeaveRequestsView } from "./leave-requests-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("../../../lib/hooks/use-url-state", () => ({
  useUrlState: (_key: string, _values: readonly string[], fallback: string) => [fallback, vi.fn()],
}));

let canSubmit = false;
let canReview = false;
let canIssue = false;

vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => {
    if (permission === "submit_leave_requests") return canSubmit;
    if (permission === "review_leave_requests") return canReview;
    if (permission === "issue_leave_letters") return canIssue;
    return false;
  },
}));

let queueLength: number | undefined;

vi.mock("../api", () => ({
  useLeaveReviewQueueQuery: () => ({
    data: queueLength === undefined ? undefined : { data: Array.from({ length: queueLength }) },
  }),
}));

vi.mock("./leave-review-queue", () => ({
  ReviewQueue: () => <div data-testid="review-queue-stub" />,
}));

vi.mock("./my-leave-requests", () => ({
  MyLeaveRequests: () => <div data-testid="my-leave-requests-stub" />,
}));

describe("LeaveRequestsView", () => {
  it("renders a single page heading", () => {
    canSubmit = true;
    canReview = false;
    canIssue = false;
    render(<LeaveRequestsView />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("shows the primary 'Ajukan izin' action in the header for a student with only the mine tab", () => {
    canSubmit = true;
    canReview = false;
    canIssue = false;
    render(<LeaveRequestsView />);
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
    // A lone tab renders its content directly, with no tablist.
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("renders a pill tablist when both the queue and mine tabs are available", () => {
    canSubmit = true;
    canReview = true;
    canIssue = false;
    render(<LeaveRequestsView />);
    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabQueue" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabMine" })).toBeInTheDocument();
  });

  it("hides the header submit action while the queue tab (not mine) is the default view", () => {
    canSubmit = true;
    canReview = true;
    canIssue = false;
    render(<LeaveRequestsView />);
    // useUrlState is stubbed to always return the first tab's value, which
    // is "queue" whenever it exists -- see the tabs array in the view.
    expect(screen.queryByRole("button", { name: "submit" })).not.toBeInTheDocument();
  });

  it("shows the no-access empty state for a role with neither permission", () => {
    canSubmit = false;
    canReview = false;
    canIssue = false;
    render(<LeaveRequestsView />);
    expect(screen.getByText("noAccessTitle")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "submit" })).not.toBeInTheDocument();
  });

  it("carries the review queue's count on the queue tab label", () => {
    canSubmit = true;
    canReview = true;
    canIssue = false;
    queueLength = 2;
    render(<LeaveRequestsView />);
    expect(screen.getByRole("tab", { name: "tabWithCount" })).toBeInTheDocument();
    queueLength = undefined;
  });
});
