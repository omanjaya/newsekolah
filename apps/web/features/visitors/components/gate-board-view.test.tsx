import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkOutMutate: vi.fn(),
  board: vi.fn(),
  canManage: true,
}));

vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, string | number>): string =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/visitors/board",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/hooks/use-quick-action", () => ({ useQuickAction: () => undefined }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManage,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "host-1", name: "Bu Rina" }]);
});
vi.mock("../../student-services/components/service-workspace-nav", () => ({
  VisitorsWorkspaceNav: () => null,
}));
vi.mock("./check-in-form", () => ({ CheckInForm: () => null }));
vi.mock("./expected-today-panel", () => ({ ExpectedTodayPanel: () => null }));
vi.mock("../api", () => ({
  useVisitorBoardQuery: mocks.board,
  useExpectedGuestsQuery: () => ({ data: { data: [] }, isLoading: false }),
  useCheckOutVisitMutation: () => ({ mutate: mocks.checkOutMutate, isPending: false }),
}));

import { GateBoardView } from "./gate-board-view";

function visit(id: string, name: string, arrivedAt: string) {
  return {
    id,
    full_name: name,
    organization: "Dinas",
    purpose: "Rapat",
    host_user_id: "host-1",
    badge_number: "07",
    arrived_at: arrivedAt,
  };
}

beforeEach(() => {
  mocks.canManage = true;
  mocks.board.mockReturnValue({
    isLoading: false,
    isError: false,
    dataUpdatedAt: 0,
    data: {
      data: [
        { overdue: false, visit: visit("v1", "Bu Ayu", "2026-11-13T23:30:00Z") },
        { overdue: true, visit: visit("v2", "Pak Budi", "2026-11-14T01:00:00Z") },
      ],
    },
  });
});

afterEach(() => {
  cleanup();
  mocks.checkOutMutate.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("GateBoardView", () => {
  it("asks for confirmation naming the visitor before signing them out", async () => {
    const user = userEvent.setup();
    render(<GateBoardView />);

    await user.click(screen.getByRole("button", { name: "checkOutFor:Bu Ayu" }));
    expect(mocks.checkOutMutate).not.toHaveBeenCalled();
    expect(await screen.findByText("checkOutDialog.body:Bu Ayu")).toBeInTheDocument();
  });

  it("signs the visitor out once confirmed", async () => {
    const user = userEvent.setup();
    render(<GateBoardView />);

    await user.click(screen.getByRole("button", { name: "checkOutFor:Bu Ayu" }));
    await user.click(await screen.findByRole("button", { name: "checkOut" }));
    expect(mocks.checkOutMutate).toHaveBeenCalledWith("v1", expect.any(Object));
  });

  it("shows the arrival time in the school timezone and whom the visitor came to see", () => {
    render(<GateBoardView />);
    // 23:30 UTC on 13 Nov is 06.30 on 14 Nov in Asia/Jakarta.
    expect(screen.getByText(/arrived:06\.30/)).toBeInTheDocument();
    expect(screen.getAllByText(/host:Bu Rina/)).toHaveLength(2);
  });

  it("lists a visitor still here past the school day first, marked as such", () => {
    render(<GateBoardView />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveAttribute("data-overdue", "true");
    expect(rows[0]).toHaveTextContent("Pak Budi");
    expect(rows[0]).toHaveTextContent("overdue");
  });

  it("filters the on-site list by name or organization", async () => {
    const user = userEvent.setup();
    render(<GateBoardView />);

    await user.type(screen.getByRole("searchbox", { name: "searchPlaceholder" }), "budi");
    expect(screen.queryByText("Bu Ayu")).not.toBeInTheDocument();
    expect(screen.getByText("Pak Budi")).toBeInTheDocument();
  });

  it("keeps the status filter in the URL", async () => {
    const user = userEvent.setup();
    render(<GateBoardView />);

    await user.click(screen.getByRole("radio", { name: /filters\.expected/ }));
    expect(new URLSearchParams(window.location.search).get("status")).toBe("expected");
    expect(screen.queryByText("Bu Ayu")).not.toBeInTheDocument();
  });

  it("offers no sign-out to a reader who cannot manage visitors", () => {
    mocks.canManage = false;
    render(<GateBoardView />);
    expect(screen.queryByRole("button", { name: /checkOutFor/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "newVisitor" })).not.toBeInTheDocument();
  });

  it("says a failed load failed instead of showing an empty board", () => {
    mocks.board.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      dataUpdatedAt: 0,
      data: undefined,
      refetch: vi.fn(),
    });
    render(<GateBoardView />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });
});
