import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useBillsQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/billing/bills",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: { data: [{ id: "class-7a", name: "7A" }] },
    isLoading: false,
  }),
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
  useLookup: () => new Map(),
}));
vi.mock("../api", () => ({ useBillsQuery: mocks.useBillsQuery }));
vi.mock("./bill-detail-sheet", () => ({ BillDetailSheet: () => null }));

import { BillsListView } from "./bills-list-view";

function bills(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bill-${index}`,
    student_user_id: `student-${index}`,
    fee_type_name: "SPP",
    period: "2026-09",
    due_date: "2026-09-10",
    amount_minor: 100000,
    currency: "IDR",
    status: "unpaid",
  }));
}

describe("BillsListView paging", () => {
  beforeEach(() => {
    mocks.useBillsQuery.mockReset();
    mocks.useBillsQuery.mockReturnValue({
      data: { data: bills(50) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    window.history.replaceState(null, "", "/billing/bills");
  });

  it("requests the second page at offset 50 and keeps it in the URL", async () => {
    const user = userEvent.setup();
    render(<BillsListView />);

    expect(mocks.useBillsQuery).toHaveBeenLastCalledWith(expect.anything(), {
      limit: 50,
      offset: 0,
    });
    await user.click(screen.getByRole("button", { name: "pageNext" }));

    expect(mocks.useBillsQuery).toHaveBeenLastCalledWith(expect.anything(), {
      limit: 50,
      offset: 50,
    });
    expect(new URLSearchParams(window.location.search).get("page")).toBe("2");
  });

  it("returns to the first page when a filter changes", async () => {
    window.history.replaceState(null, "", "/billing/bills?page=3");
    const user = userEvent.setup();
    render(<BillsListView />);

    await user.click(screen.getByRole("button", { name: "statusLabel" }));
    await user.click(await screen.findByRole("button", { name: "status.paid" }));

    expect(mocks.useBillsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "paid" }),
      { limit: 50, offset: 0 },
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("1");
  });
});
