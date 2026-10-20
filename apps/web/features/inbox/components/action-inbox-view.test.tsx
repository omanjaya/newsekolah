import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActionInboxView } from "./action-inbox-view";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  profileKind: "student",
  summary: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (code: string) => mocks.permissions.has(code),
  useSession: () => ({ me: { profile_kind: mocks.profileKind } }),
}));
vi.mock("../use-action-inbox-count", () => ({ useActionInboxSummary: mocks.summary }));
vi.mock("../../permits/components/permit-unified-queue", () => ({
  PermitUnifiedQueue: () => <div data-testid="permit-queue" />,
}));
vi.mock("./warning-letter-candidates-section", () => ({
  WarningLetterCandidatesSection: () => <div data-testid="sp-section" />,
}));

function summary(overrides: Record<string, unknown> = {}) {
  return {
    leave: 1,
    exit: 0,
    late: 0,
    warningLetters: 1,
    total: 2,
    isLoading: false,
    isError: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.permissions = new Set();
  mocks.profileKind = "student";
  mocks.summary.mockReset().mockReturnValue(summary());
});

describe("ActionInboxView", () => {
  it("shows the no-access state when the reader has no queue", () => {
    render(<ActionInboxView />);
    expect(screen.getByText("noAccessTitle")).toBeInTheDocument();
    expect(screen.queryByTestId("permit-queue")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sp-section")).not.toBeInTheDocument();
  });

  it.each([["review_leave_requests"], ["issue_scan_tokens"], ["scan_exit_permits"]])(
    "shows only the permits section for %s",
    (code) => {
      mocks.permissions = new Set([code]);
      render(<ActionInboxView />);
      expect(screen.getByTestId("permit-queue")).toBeInTheDocument();
      expect(screen.queryByTestId("sp-section")).not.toBeInTheDocument();
    },
  );

  it("shows the permits section to teachers for the late-arrival queue", () => {
    mocks.profileKind = "teacher";
    render(<ActionInboxView />);
    expect(screen.getByTestId("permit-queue")).toBeInTheDocument();
  });

  it("shows only the warning letter section for issue_warning_letters", () => {
    mocks.permissions = new Set(["issue_warning_letters"]);
    render(<ActionInboxView />);
    expect(screen.getByTestId("sp-section")).toBeInTheDocument();
    expect(screen.queryByTestId("permit-queue")).not.toBeInTheDocument();
  });

  it("shows both sections when the reader holds both duties", () => {
    mocks.permissions = new Set(["review_leave_requests", "issue_warning_letters"]);
    render(<ActionInboxView />);
    expect(screen.getByTestId("permit-queue")).toBeInTheDocument();
    expect(screen.getByTestId("sp-section")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is waiting", () => {
    mocks.permissions = new Set(["review_leave_requests"]);
    mocks.summary.mockReturnValue(summary({ leave: 0, warningLetters: 0, total: 0 }));
    render(<ActionInboxView />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.queryByTestId("permit-queue")).not.toBeInTheDocument();
  });

  it("keeps the sections visible when a queue failed so its retry stays reachable", () => {
    mocks.permissions = new Set(["review_leave_requests"]);
    mocks.summary.mockReturnValue(summary({ leave: 0, total: 0, isError: true }));
    render(<ActionInboxView />);
    expect(screen.getByTestId("permit-queue")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });
});
