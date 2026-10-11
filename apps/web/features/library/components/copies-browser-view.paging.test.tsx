import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useLibraryCopiesFilteredQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/copies",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => false }));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../../reference/api", () => ({ useLookup: () => new Map() }));
vi.mock("../copies-api", () => ({
  useLibraryCopiesFilteredQuery: mocks.useLibraryCopiesFilteredQuery,
  useCollectionCategoriesQuery: () => ({
    data: { data: [{ id: "cat-fiction", name: "Fiksi" }] },
    isLoading: false,
  }),
  useLibraryLocationsQuery: () => ({ data: { data: [] }, isLoading: false }),
  useBulkSetLibraryCopyStatusMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  printLibraryCopyLabelsBatch: vi.fn(),
}));

import { CopiesBrowserView } from "./copies-browser-view";

function copies(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `copy-${index}`,
    title_id: `title-${index}`,
    barcode: `B-${index}`,
    accession_number: `A-${index}`,
    call_number: `C-${index}`,
    status: "available",
  }));
}

describe("CopiesBrowserView paging", () => {
  beforeEach(() => {
    mocks.useLibraryCopiesFilteredQuery.mockReset();
    mocks.useLibraryCopiesFilteredQuery.mockReturnValue({
      data: { data: copies(50) },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/library/copies");
  });

  it("requests the second page at offset 50 and keeps it in the URL", async () => {
    const user = userEvent.setup();
    render(<CopiesBrowserView />);

    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 50 }),
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("2");
  });

  it("returns to the first page when a filter changes", async () => {
    window.history.replaceState(null, "", "/library/copies?page=4");
    const user = userEvent.setup();
    render(<CopiesBrowserView />);

    await user.click(screen.getByRole("button", { name: "filters.category" }));
    await user.click(await screen.findByRole("button", { name: "Fiksi" }));

    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: "cat-fiction", limit: 50, offset: 0 }),
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("1");
  });
});
