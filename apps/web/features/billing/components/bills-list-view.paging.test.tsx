import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useBillsQuery: vi.fn(),
}));

// One translator for every call, as next-intl's own is stable: a new one per
// render would rebuild the view's memoized columns, and TanStack would then
// remount every cell of the table and the phone cards on each re-render.
const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({
  useTranslations: () => translate,
  useLocale: () => "id",
}));

/**
 * A full page is 50 bills (the API's page size, which is what turns on
 * Next), drawn twice: as the desktop table and as the phone cards. Each
 * role query after a re-render walks every node, so the test needs more
 * than vitest's 5s default when the whole monorepo runs in parallel.
 */
const FULL_PAGE_TIMEOUT_MS = 20_000;
vi.mock("next/navigation", () => ({
  usePathname: () => "/billing/bills",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
  useCan: () => true,
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: { data: [{ id: "class-7a", name: "7A" }] },
    isLoading: false,
  }),
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
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

  it(
    "requests the second page at offset 50 and keeps it in the URL",
    async () => {
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
    },
    FULL_PAGE_TIMEOUT_MS,
  );

  it("returns to the first page when a filter changes", async () => {
    // The reset follows the filter, not the rows: one bill is enough.
    mocks.useBillsQuery.mockReturnValue({
      data: { data: bills(1) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    window.history.replaceState(null, "", "/billing/bills?page=3");
    const user = userEvent.setup();
    render(<BillsListView />);
    expect(mocks.useBillsQuery).toHaveBeenLastCalledWith(expect.anything(), {
      limit: 50,
      offset: 100,
    });

    await user.click(screen.getByRole("button", { name: "statusLabel" }));
    await user.click(await screen.findByRole("button", { name: "status.paid" }));

    expect(mocks.useBillsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "paid" }),
      { limit: 50, offset: 0 },
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("1");
  });
});
