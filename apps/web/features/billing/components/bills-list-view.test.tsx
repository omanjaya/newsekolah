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
    data: {
      data: [
        { id: "class-7a", name: "7A" },
        { id: "class-7b", name: "7B" },
      ],
    },
    isLoading: false,
  }),
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
  useLookup: () => new Map(),
}));
vi.mock("../api", () => ({
  useBillsQuery: mocks.useBillsQuery,
}));
vi.mock("./bill-detail-sheet", () => ({ BillDetailSheet: () => null }));

import { BillsListView } from "./bills-list-view";

describe("BillsListView filters", () => {
  beforeEach(() => {
    mocks.useBillsQuery.mockReset();
    mocks.useBillsQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    window.history.replaceState(null, "", "/billing/bills");
  });

  it("passes the chosen status to the bills query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<BillsListView />);

    await user.click(screen.getByRole("button", { name: "statusLabel" }));
    await user.click(await screen.findByRole("button", { name: "status.paid" }));

    expect(mocks.useBillsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "paid" }),
      expect.anything(),
    );
    expect(new URLSearchParams(window.location.search).get("status")).toBe("paid");
  });

  it("passes the chosen class to the bills query and writes class_id to the URL", async () => {
    const user = userEvent.setup();
    render(<BillsListView />);

    await user.click(screen.getByRole("button", { name: "classLabel" }));
    await user.click(await screen.findByRole("button", { name: "7B" }));

    expect(mocks.useBillsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7b" }),
      expect.anything(),
    );
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("class-7b");
  });

  it("reads an initial status URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/billing/bills?status=unpaid");
    render(<BillsListView />);

    expect(mocks.useBillsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "unpaid" }),
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "statusLabel: status.unpaid" })).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/billing/bills?class_id=class-7a");
    const user = userEvent.setup();
    render(<BillsListView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useBillsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "" }),
      expect.anything(),
    );
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("");
  });
});
