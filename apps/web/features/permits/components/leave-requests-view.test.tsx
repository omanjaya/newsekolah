import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LeaveRequestsView } from "./leave-requests-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

let canSubmit = false;
let canIssue = false;

vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => {
    if (permission === "submit_leave_requests") return canSubmit;
    if (permission === "issue_leave_letters") return canIssue;
    return false;
  },
}));

vi.mock("./my-leave-requests", () => ({
  MyLeaveRequests: () => <div data-testid="my-leave-requests-stub" />,
}));

describe("LeaveRequestsView", () => {
  it("renders a single page heading", () => {
    canSubmit = true;
    canIssue = false;
    render(<LeaveRequestsView />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("shows the submit action and the history, with no tabs, for a student", () => {
    canSubmit = true;
    canIssue = false;
    render(<LeaveRequestsView />);
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
    expect(screen.getByTestId("my-leave-requests-stub")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("tells an issuer-only counselor where requests arrive", () => {
    canSubmit = false;
    canIssue = true;
    render(<LeaveRequestsView />);
    expect(screen.getByText("issuerQueueUnavailableTitle")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "submit" })).not.toBeInTheDocument();
  });

  it("shows the no-access empty state for a role with neither permission", () => {
    canSubmit = false;
    canIssue = false;
    render(<LeaveRequestsView />);
    expect(screen.getByText("noAccessTitle")).toBeInTheDocument();
  });
});
