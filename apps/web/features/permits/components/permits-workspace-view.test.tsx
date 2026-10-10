import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PermitsWorkspaceView } from "./permits-workspace-view";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  profileKind: "student",
  query: "",
  replace: vi.fn(),
  summary: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock("../../../lib/hooks/use-url-state", () => ({
  useUrlState: (_key: string, _values: readonly string[], fallback: string) => [fallback, vi.fn()],
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (code: string) => mocks.permissions.has(code),
  useSession: () => ({ me: { profile_kind: mocks.profileKind }, isReady: true }),
}));
vi.mock("../../inbox/use-action-inbox-count", () => ({ useActionInboxSummary: mocks.summary }));
vi.mock("./leave-requests-view", () => ({ LeaveRequestsView: () => <div data-testid="leave" /> }));
vi.mock("./exit-permits-view", () => ({ ExitPermitsView: () => <div data-testid="exit" /> }));
vi.mock("./late-arrivals-view", () => ({ LateArrivalsView: () => <div data-testid="late" /> }));

beforeEach(() => {
  mocks.permissions = new Set();
  mocks.profileKind = "student";
  mocks.query = "";
  mocks.replace.mockReset();
  mocks.summary.mockReset().mockReturnValue({ leave: 2, exit: 1, late: 0 });
});

describe("PermitsWorkspaceView", () => {
  it("offers a student the request kinds without any queue option and no banner", () => {
    mocks.permissions = new Set(["submit_leave_requests"]);
    render(<PermitsWorkspaceView initialType="leave" />);
    expect(screen.getByTestId("leave")).toBeInTheDocument();
    expect(screen.getByText("requestKind")).toBeInTheDocument();
    expect(screen.queryByText("allQueue")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /reviewBanner/ })).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows reviewers who also submit a banner linking to the inbox", () => {
    mocks.permissions = new Set(["submit_leave_requests", "review_leave_requests"]);
    render(<PermitsWorkspaceView initialType="leave" />);
    expect(screen.getByRole("link", { name: /reviewBanner/ })).toHaveAttribute("href", "/inbox");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["type=allQueue", "leave", "/inbox"],
    ["tab=queue", "exit", "/inbox?type=exit"],
  ])("redirects the legacy link ?%s to the inbox", (query, pageType, expected) => {
    mocks.permissions = new Set(["submit_leave_requests", "review_leave_requests"]);
    mocks.query = query;
    render(<PermitsWorkspaceView initialType={pageType} />);
    expect(mocks.replace).toHaveBeenCalledWith(expected);
    expect(screen.queryByTestId("leave")).not.toBeInTheDocument();
  });

  it("sends a reviewer with nothing to submit straight to the inbox", () => {
    mocks.permissions = new Set(["review_leave_requests"]);
    render(<PermitsWorkspaceView initialType="leave" />);
    expect(mocks.replace).toHaveBeenCalledWith("/inbox?type=leave");
  });
});
