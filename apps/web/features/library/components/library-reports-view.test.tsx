import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  overdue: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/reports",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/simulation/clock", () => ({
  useSimulation: () => undefined,
  businessNow: () => new Date("2026-09-15T02:00:00Z"),
}));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Jakarta" }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/hooks/use-date-range-presets", () => ({ useDateRangePresets: () => [] }));
vi.mock("../../../components/report-export-dialog", () => ({ ReportExportDialog: () => null }));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "user-1", name: "Siti Aminah" }]);
});
vi.mock("../api", () => ({
  downloadMonthlyLibraryReportPdf: vi.fn(),
  useLoansReportQuery: () => ({ data: { data: [] }, isLoading: false }),
  useMostBorrowedReportQuery: () => ({ data: { data: [] }, isLoading: false }),
  useOverdueMembersReportQuery: mocks.overdue,
}));
vi.mock("../reports-api", () => ({
  downloadLibraryAccessionRegisterReportXlsx: vi.fn(),
  downloadLibraryMembersReportXlsx: vi.fn(),
  downloadLibrarySummaryReportXlsx: vi.fn(),
  downloadLibraryVisitsReportXlsx: vi.fn(),
  downloadLoansReportXlsx: vi.fn(),
  downloadMostBorrowedReportXlsx: vi.fn(),
  downloadOverdueMembersReportXlsx: vi.fn(),
}));

import { LibraryReportsView } from "./library-reports-view";

describe("LibraryReportsView overdue members tab", () => {
  beforeEach(() => {
    mocks.overdue.mockReset();
    window.history.replaceState(null, "", "/library/reports?tab=overdueMembers");
  });

  it("shows the member's name and a formatted fine, never the user id", () => {
    mocks.overdue.mockReturnValue({
      data: { data: [{ member_user_id: "user-1", loan_count: 2, total_fine: 5000 }] },
      isLoading: false,
    });
    render(<LibraryReportsView />);

    expect(screen.getAllByText("Siti Aminah").length).toBeGreaterThan(0);
    expect(screen.queryByText("user-1")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Rp/).length).toBeGreaterThan(0);
  });

  it("shows an empty state when nobody is overdue", () => {
    mocks.overdue.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<LibraryReportsView />);

    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });

  it("points each tab at a panel that exists", () => {
    mocks.overdue.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<LibraryReportsView />);

    const selected = screen.getByRole("tab", { selected: true });
    const panelId = selected.getAttribute("aria-controls") ?? "";
    expect(document.getElementById(panelId)).not.toBeNull();
  });

  it("falls back to a translated label for a member the directory does not know", () => {
    mocks.overdue.mockReturnValue({
      data: { data: [{ member_user_id: "ghost-id", loan_count: 1, total_fine: 0 }] },
      isLoading: false,
    });
    render(<LibraryReportsView />);

    expect(screen.getAllByText("unknownMember").length).toBeGreaterThan(0);
    expect(screen.queryByText("ghost-id")).not.toBeInTheDocument();
  });

  it("shows an error, not the empty state, when the request failed", () => {
    mocks.overdue.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("offline"),
      refetch: vi.fn(),
    });
    render(<LibraryReportsView />);

    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
  });

  it("names the period with the shared range picker, not native date inputs", () => {
    window.history.replaceState(null, "", "/library/reports?tab=loans");
    mocks.overdue.mockReturnValue({ data: { data: [] }, isLoading: false });
    const { container } = render(<LibraryReportsView />);

    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(container.querySelector('input[type="month"]')).toBeNull();
    expect(screen.getByText("periodLabel")).toBeInTheDocument();
  });
});
