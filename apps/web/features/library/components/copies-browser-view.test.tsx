import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useLibraryCopiesFilteredQuery: vi.fn(),
  canManage: true,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/copies",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canManage }));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../../reference/api", () => ({ useLookup: () => new Map() }));
vi.mock("../copies-api", () => ({
  useLibraryCopiesFilteredQuery: mocks.useLibraryCopiesFilteredQuery,
  useCollectionCategoriesQuery: () => ({
    data: {
      data: [
        { id: "cat-fiction", name: "Fiksi" },
        { id: "cat-ref", name: "Referensi" },
      ],
    },
    isLoading: false,
  }),
  useLibraryLocationsQuery: () => ({
    data: { data: [{ id: "loc-a", name: "Rak A" }] },
    isLoading: false,
  }),
  useBulkSetLibraryCopyStatusMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  printLibraryCopyLabelsBatch: vi.fn(),
}));

import { CopiesBrowserView } from "./copies-browser-view";

describe("CopiesBrowserView filters", () => {
  beforeEach(() => {
    mocks.canManage = true;
    mocks.useLibraryCopiesFilteredQuery.mockReset();
    mocks.useLibraryCopiesFilteredQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/library/copies");
  });

  it("passes the chosen status to the copies query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<CopiesBrowserView />);

    await user.click(screen.getByRole("button", { name: "filters.status" }));
    await user.click(await screen.findByRole("button", { name: "status.available" }));

    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "available" }),
    );
    expect(new URLSearchParams(window.location.search).get("status")).toBe("available");
  });

  it("passes the chosen category to the copies query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<CopiesBrowserView />);

    await user.click(screen.getByRole("button", { name: "filters.category" }));
    await user.click(await screen.findByRole("button", { name: "Fiksi" }));

    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: "cat-fiction" }),
    );
    expect(new URLSearchParams(window.location.search).get("category_id")).toBe("cat-fiction");
  });

  it("passes the chosen location to the copies query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<CopiesBrowserView />);

    await user.click(screen.getByRole("button", { name: "filters.location" }));
    await user.click(await screen.findByRole("button", { name: "Rak A" }));

    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ locationId: "loc-a" }),
    );
    expect(new URLSearchParams(window.location.search).get("location_id")).toBe("loc-a");
  });

  it("reads an initial status=damaged URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/library/copies?status=damaged");
    render(<CopiesBrowserView />);

    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "damaged" }),
    );
    expect(
      screen.getByRole("button", { name: "filters.status: status.damaged" }),
    ).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/library/copies?category_id=cat-ref");
    const user = userEvent.setup();
    render(<CopiesBrowserView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: "" }),
    );
    expect(new URLSearchParams(window.location.search).get("category_id")).toBe("");
  });
});
