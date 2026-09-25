import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import * as DeskApiModule from "../desk-api";

import { DeskOverdueTable } from "./desk-overdue-table";

type LibraryOverdueLoanDetail = DeskApiModule.LibraryOverdueLoanDetail;

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@newsekolah/i18n", () => ({
  formatDate: (value: string) => value,
}));

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

vi.mock("../api", () => ({
  useRenewLoanMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useReturnLoanMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../desk-api", async () => {
  const actual = await vi.importActual<typeof DeskApiModule>("../desk-api");
  return {
    ...actual,
    useOverdueLoansDetailedQuery: vi.fn(),
    useSendLibraryDueRemindersMutation: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock("./mark-lost-dialog", () => ({
  MarkLostDialog: () => null,
}));

vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

const loan = (id: string, title: string, barcode: string): LibraryOverdueLoanDetail => ({
  member_name: "Sari",
  member_no: "M-001",
  title,
  barcode,
  class_name: "X-1",
  guardian_phone: "0812",
  loan: {
    id,
    member_user_id: "member-1",
    copy_id: `copy-${id}`,
    title_id: `title-${id}`,
    borrowed_at: "2026-09-01T00:00:00Z",
    due_on: "2026-09-10",
    renewal_count: 0,
    fine_amount: 0,
    status: "active",
  },
});

const mockedQuery = vi.mocked(DeskApiModule.useOverdueLoansDetailedQuery);

describe("DeskOverdueTable", () => {
  it("keeps separate overdue loans for the same member with their own title and barcode", () => {
    mockedQuery.mockReturnValue({
      data: { data: [loan("loan-1", "Matematika", "BC-001"), loan("loan-2", "Biologi", "BC-002")] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    render(<DeskOverdueTable />);

    expect(screen.getAllByText("Matematika").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Biologi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BC-001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BC-002").length).toBeGreaterThan(0);
  });

  it("filters the local table by title and barcode", async () => {
    mockedQuery.mockReturnValue({
      data: { data: [loan("loan-1", "Matematika", "BC-001"), loan("loan-2", "Biologi", "BC-002")] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    const user = userEvent.setup();
    render(<DeskOverdueTable />);
    await user.type(screen.getByRole("searchbox"), "BC-002");

    await waitFor(() => {
      expect(screen.queryByText("Matematika")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Biologi").length).toBeGreaterThan(0);
  });

  it("paginates the overdue queue at 10 per page instead of rendering every card at once", async () => {
    const loans = Array.from({ length: 12 }, (_, i) => loan(`loan-${i}`, `Judul ${i}`, `BC-${i}`));
    mockedQuery.mockReturnValue({
      data: { data: loans },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    const user = userEvent.setup();
    render(<DeskOverdueTable />);

    // Only the first 10 render up front (finding 8, docs/analysis/
    // ux-audit-2026-09-25.md): the last 2 of 12 stay off-screen until the
    // reader pages forward. Both the desktop table and the mobile card
    // list render into the DOM at once (CSS media queries hide one of
    // them, which jsdom does not evaluate), so a rendered title matches
    // twice -- presence/absence per title is what actually distinguishes
    // "on this page" from "not yet", not a total match count.
    expect(screen.getAllByText("Judul 0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Judul 9").length).toBeGreaterThan(0);
    expect(screen.queryByText("Judul 10")).not.toBeInTheDocument();
    expect(screen.queryByText("Judul 11")).not.toBeInTheDocument();
    expect(screen.getByText("Halaman 1 dari 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ke halaman berikutnya" }));

    await waitFor(() => {
      expect(screen.getAllByText("Judul 11").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Judul 0")).not.toBeInTheDocument();
    expect(screen.getByText("Halaman 2 dari 2")).toBeInTheDocument();
  });

  it("shows a retry action when the overdue query fails instead of the empty state", async () => {
    const refetch = vi.fn();
    mockedQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);

    const user = userEvent.setup();
    render(<DeskOverdueTable />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
