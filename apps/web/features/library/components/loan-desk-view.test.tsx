import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoanDeskView } from "./loan-desk-view";
import type { useDeskSession } from "./use-desk-session";

type DeskSession = ReturnType<typeof useDeskSession>;

const deskSession = vi.hoisted(() => vi.fn());
const dashboardQuery = vi.hoisted(() => vi.fn());

vi.mock("./use-desk-session", () => ({ useDeskSession: deskSession }));
vi.mock("../dashboard-api", () => ({ useLibraryDashboardQuery: dashboardQuery }));
vi.mock("./library-workspace-nav", () => ({ LibraryWorkspaceNav: () => null }));
vi.mock("./desk-overdue-table", () => ({ DeskOverdueTable: () => null }));
vi.mock("./desk-receipt-dialog", () => ({ DeskReceiptDialog: () => null }));
// `DeskMemberPanel` renders `LibraryLookupField` while no member is picked
// yet, which calls this hook -- it needs an `ApiClientProvider` this view
// test does not set up, so it is stubbed like every other API hook here.
vi.mock("../desk-api", () => ({
  useLibraryLookupQuery: () => ({ data: undefined, isFetching: false }),
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

describe("LoanDeskView", () => {
  beforeEach(() => {
    deskSession.mockReset();
    dashboardQuery
      .mockReset()
      .mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it("renders the scan and basket cards as an equal half-width bento row", () => {
    deskSession.mockReturnValue(baseSession());
    render(<LoanDeskView />);

    const cards = screen.getByTestId("desk-cards");
    expect(cards).toHaveClass("grid", "lg:grid-cols-2");
    expect(screen.getByTestId("desk-cell-scan")).not.toHaveClass("lg:col-span-2");
    expect(screen.getByTestId("desk-cell-basket")).not.toHaveClass("lg:col-span-2");
  });

  it("shows four equal-width stat tiles for today's counts once the dashboard query resolves", () => {
    deskSession.mockReturnValue(baseSession());
    dashboardQuery.mockReturnValue({
      data: { summary: { loans_today: 3, returns_today: 2, overdue: 1, visits_today: 9 } },
      isLoading: false,
      isError: false,
    });

    render(<LoanDeskView />);

    expect(screen.getByTestId("desk-tiles")).toHaveClass("lg:grid-cols-4");
    expect(screen.getByTestId("desk-tile-loansToday")).toBeInTheDocument();
    expect(screen.getByTestId("desk-tile-returnsToday")).toBeInTheDocument();
    expect(screen.getByTestId("desk-tile-overdue")).toBeInTheDocument();
    expect(screen.getByTestId("desk-tile-visitsToday")).toBeInTheDocument();
  });

  it("shows no tile row while the dashboard query has not resolved and is not loading", () => {
    deskSession.mockReturnValue(baseSession());

    render(<LoanDeskView />);

    expect(screen.queryByTestId("desk-tiles")).not.toBeInTheDocument();
  });

  it("keeps the barcode scanner field as the first focus target once a member is selected", () => {
    deskSession.mockReturnValue(baseSession({ member: { userId: "u1", name: "Siswa Satu" } }));

    render(<LoanDeskView />);

    expect(screen.getByRole("textbox", { name: "modes.scanLabel.borrow" })).toHaveFocus();
  });

  it("does not render the scanner field before a member is selected", () => {
    deskSession.mockReturnValue(baseSession());

    render(<LoanDeskView />);

    expect(screen.queryByRole("textbox", { name: /scanLabel/ })).not.toBeInTheDocument();
  });

  it("puts the pill mode switch in the page header", () => {
    deskSession.mockReturnValue(baseSession());

    render(<LoanDeskView />);

    expect(screen.getByRole("tab", { name: /borrow/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /return/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /renew/ })).toBeInTheDocument();
  });
});
