import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoanDeskView } from "./loan-desk-view";
import type { useDeskSession } from "./use-desk-session";

type DeskSession = ReturnType<typeof useDeskSession>;

const deskSession = vi.hoisted(() => vi.fn());
const dashboardQuery = vi.hoisted(() => vi.fn());

vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("./use-desk-session", () => ({ useDeskSession: deskSession }));
vi.mock("../dashboard-api", () => ({ useLibraryDashboardQuery: dashboardQuery }));
vi.mock("./library-workspace-nav", () => ({ LibraryWorkspaceNav: () => null }));
vi.mock("./desk-overdue-table", () => ({ DeskOverdueTable: () => null }));
vi.mock("./desk-receipt-dialog", () => ({ DeskReceiptDialog: () => null }));
// The member search reads the lookup endpoint, which needs an API client.
vi.mock("../desk-api", () => ({
  useLibraryLookupQuery: () => ({ data: undefined, isFetching: false }),
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      permissions: ["manage_library_circulation", "view_library_reports"],
      profile_kind: "staff",
    },
  }),
  useCan: () => true,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function baseSession(overrides: Partial<DeskSession> = {}): DeskSession {
  return {
    mode: "borrow",
    setMode: vi.fn(),
    member: null,
    memberStatus: null,
    borrowingStatus: null,
    selectMember: vi.fn(),
    endSession: vi.fn(),
    basket: { borrow: [], return: [], renew: [] },
    scanning: false,
    scanError: "",
    handleScan: vi.fn(),
    removeItem: vi.fn(),
    undo: vi.fn(),
    confirmBorrow: vi.fn(),
    confirmingBorrow: false,
    receiptOpen: false,
    setReceiptOpen: vi.fn(),
    ...overrides,
  };
}

const member = { userId: "u1", name: "Siswa Satu", memberNo: "M-1" };

describe("LoanDeskView", () => {
  beforeEach(() => {
    deskSession.mockReset();
    dashboardQuery
      .mockReset()
      .mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it("opens on the scan bar, focused, so a member card scan starts the session", () => {
    deskSession.mockReturnValue(baseSession());
    render(<LoanDeskView />);

    expect(screen.getByRole("textbox", { name: "member.scanLabel" })).toHaveFocus();
    expect(screen.getByText("member.hintTitle")).toBeInTheDocument();
  });

  it("keeps the scan bar as the focus target once a member is selected", () => {
    deskSession.mockReturnValue(baseSession({ member }));
    render(<LoanDeskView />);

    expect(screen.getByRole("textbox", { name: "modes.scanLabel.borrow" })).toHaveFocus();
  });

  it("returns focus to the scan bar when a member is picked and when the session ends", () => {
    deskSession.mockReturnValue(baseSession());
    const { rerender } = render(<LoanDeskView />);

    (document.activeElement as HTMLElement).blur();
    deskSession.mockReturnValue(baseSession({ member }));
    rerender(<LoanDeskView />);
    expect(screen.getByRole("textbox", { name: "modes.scanLabel.borrow" })).toHaveFocus();

    (document.activeElement as HTMLElement).blur();
    deskSession.mockReturnValue(baseSession());
    rerender(<LoanDeskView />);
    expect(screen.getByRole("textbox", { name: "member.scanLabel" })).toHaveFocus();
  });

  it("attaches the mode to the bar as a radio group, not tabs without panels", async () => {
    const setMode = vi.fn();
    deskSession.mockReturnValue(baseSession({ member, setMode }));
    render(<LoanDeskView />);

    const modes = screen.getByRole("radiogroup", { name: "modes.label" });
    expect(within(modes).getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);

    await userEvent.setup().click(within(modes).getByRole("radio", { name: /modes.return/ }));
    expect(setMode).toHaveBeenCalledWith("return");
  });

  it("announces a scan error in the result banner", () => {
    deskSession.mockReturnValue(baseSession({ scanError: "Kode tidak dikenali" }));
    const { container } = render(<LoanDeskView />);

    const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(live).toHaveTextContent("Kode tidak dikenali");
    expect(live?.querySelector('[data-tone="danger"]')).not.toBeNull();
  });

  it("shows the latest scanned book as the last result", () => {
    deskSession.mockReturnValue(
      baseSession({
        member,
        basket: {
          borrow: [
            { barcode: "BC-2", title: "Laskar Pelangi", state: "pending" },
            { barcode: "BC-1", title: "Sapiens", state: "pending" },
          ],
          return: [],
          renew: [],
        },
      }),
    );
    const { container } = render(<LoanDeskView />);

    const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(live).toHaveTextContent("Laskar Pelangi");
    expect(live).not.toHaveTextContent("Sapiens");
  });

  it("offers the borrow confirmation only once a book is waiting", () => {
    deskSession.mockReturnValue(baseSession({ member }));
    const { rerender } = render(<LoanDeskView />);
    expect(screen.queryByRole("button", { name: "basket.confirmBorrow" })).not.toBeInTheDocument();

    deskSession.mockReturnValue(
      baseSession({
        member,
        basket: {
          borrow: [{ barcode: "BC-1", title: "Sapiens", state: "pending" }],
          return: [],
          renew: [],
        },
      }),
    );
    rerender(<LoanDeskView />);
    expect(screen.getByRole("button", { name: "basket.confirmBorrow" })).toBeInTheDocument();
  });

  it("shows today's four figures beside the desk once the dashboard query resolves", () => {
    deskSession.mockReturnValue(baseSession());
    dashboardQuery.mockReturnValue({
      data: { summary: { loans_today: 3, returns_today: 2, overdue: 1, visits_today: 9 } },
      isLoading: false,
      isError: false,
    });
    render(<LoanDeskView />);

    const aside = screen.getByTestId("desk-aside");
    expect(within(aside).getByTestId("desk-tile-loansToday")).toBeInTheDocument();
    expect(within(aside).getByTestId("desk-tile-returnsToday")).toBeInTheDocument();
    expect(within(aside).getByTestId("desk-tile-overdue")).toBeInTheDocument();
    expect(within(aside).getByTestId("desk-tile-visitsToday")).toBeInTheDocument();
  });

  it("takes book barcodes for a return with no member, and shows what was returned", () => {
    deskSession.mockReturnValue(
      baseSession({
        mode: "return",
        basket: {
          borrow: [],
          return: [
            {
              barcode: "2026/00012",
              title: "Matematika",
              state: "done",
              detail: "basket.returnedOnTime",
            },
          ],
          renew: [],
        },
      }),
    );
    const { container } = render(<LoanDeskView />);

    expect(screen.getByRole("textbox", { name: "modes.scanLabel.return" })).toHaveFocus();
    expect(screen.queryByText("member.hintTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "basket.heading.return" })).toBeInTheDocument();
    const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(live).toHaveTextContent("Matematika");
  });

  it("warns about an unpaid fine and shows the quota in use before lending", () => {
    deskSession.mockReturnValue(
      baseSession({
        member,
        borrowingStatus: {
          allow_loans: true,
          max_loan_items: 2,
          max_loan_days: 7,
          active_loan_count: 1,
          has_unpaid_fine: true,
          unpaid_fine_blocks_loans: true,
        },
      }),
    );
    const { container } = render(<LoanDeskView />);

    expect(screen.getByText("member.unpaidFineBlocks")).toBeInTheDocument();
    expect(screen.getByText("member.quota")).toBeInTheDocument();
    const live = container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(live).toHaveTextContent("result.memberUnpaidFine");
    expect(live?.querySelector('[data-tone="warning"]')).not.toBeNull();
  });

  it("drops the figures card when the dashboard query has not resolved and is not loading", () => {
    deskSession.mockReturnValue(baseSession());
    render(<LoanDeskView />);

    expect(screen.queryByTestId("desk-tiles")).not.toBeInTheDocument();
  });
});
