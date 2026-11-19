import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActionInboxView } from "./action-inbox-view";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  profileKind: "student",
  duties: [] as { slug: string }[],
  summary: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (code: string) => mocks.permissions.has(code),
  useSession: () => ({
    me: {
      profile_kind: mocks.profileKind,
      permissions: [...mocks.permissions],
      roles: [],
      duties: mocks.duties,
      disabled_modules: [],
    },
  }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../use-action-inbox-count", () => ({ useActionInboxSummary: mocks.summary }));
vi.mock("../../permits/components/permit-unified-queue", () => ({
  PermitUnifiedQueue: ({ onSheetOpenChange }: { onSheetOpenChange?: (open: boolean) => void }) => (
    <div data-testid="permit-queue">
      <button type="button" onClick={() => onSheetOpenChange?.(true)}>
        open-sheet
      </button>
      <button type="button" onClick={() => onSheetOpenChange?.(false)}>
        close-sheet
      </button>
    </div>
  ),
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
  mocks.duties = [];
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
    // A reviewer has no leave history: /leave-requests would send them back here.
    expect(screen.queryByRole("link", { name: "historyLeave" })).not.toBeInTheDocument();
  });

  it("keeps the queue mounted while a sheet is open after the last item clears", () => {
    mocks.permissions = new Set(["issue_scan_tokens"]);
    const { rerender } = render(<ActionInboxView />);
    fireEvent.click(screen.getByRole("button", { name: "open-sheet" }));

    // The approval (or its live push) drops the count to zero: the sheet
    // must stay up so its success line can be read.
    mocks.summary.mockReturnValue(summary({ leave: 0, warningLetters: 0, total: 0 }));
    rerender(<ActionInboxView />);
    expect(screen.getByTestId("permit-queue")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "close-sheet" }));
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.queryByTestId("permit-queue")).not.toBeInTheDocument();
  });

  it("offers the warning letters as the history of an all-clear issuer", () => {
    mocks.permissions = new Set([
      "review_leave_requests",
      "issue_warning_letters",
      "view_discipline",
    ]);
    mocks.summary.mockReturnValue(summary({ leave: 0, warningLetters: 0, total: 0 }));
    render(<ActionInboxView />);
    expect(screen.getByRole("link", { name: "historyWarningLetters" })).toHaveAttribute(
      "href",
      "/discipline/warning-letters",
    );
  });

  it("does not offer warning letters to an all-clear reader who cannot issue them", () => {
    mocks.profileKind = "teacher";
    mocks.permissions = new Set(["view_discipline"]);
    mocks.summary.mockReturnValue(summary({ leave: 0, warningLetters: 0, total: 0 }));
    render(<ActionInboxView />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "historyWarningLetters" })).not.toBeInTheDocument();
  });

  it("offers the duty desk to an all-clear teacher on picket duty", () => {
    mocks.profileKind = "teacher";
    mocks.duties = [{ slug: "picket" }];
    mocks.permissions = new Set(["issue_scan_tokens", "view_discipline"]);
    mocks.summary.mockReturnValue(summary({ leave: 0, warningLetters: 0, total: 0 }));
    render(<ActionInboxView />);
    expect(screen.getByRole("link", { name: "openDuty" })).toHaveAttribute("href", "/duty");
    expect(screen.queryByRole("link", { name: "historyWarningLetters" })).not.toBeInTheDocument();
  });

  it("offers the way home from the no-access state", () => {
    render(<ActionInboxView />);
    expect(screen.getByRole("link", { name: "backHome" })).toHaveAttribute("href", "/dashboard");
  });

  it("keeps the sections visible when a queue failed so its retry stays reachable", () => {
    mocks.permissions = new Set(["review_leave_requests"]);
    mocks.summary.mockReturnValue(summary({ leave: 0, total: 0, isError: true }));
    render(<ActionInboxView />);
    expect(screen.getByTestId("permit-queue")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });
});
