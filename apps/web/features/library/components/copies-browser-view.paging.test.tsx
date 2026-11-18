import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useLibraryCopiesFilteredQuery: vi.fn(),
}));

// One translator for every call, as next-intl's own is stable: a new one per
// render would rebuild the view's memoized columns, and TanStack would then
// remount every cell of the table and the phone cards on each re-render.
const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({ useTranslations: () => translate }));

/**
 * A full page is 50 copies (the API's page size, which is what turns on
 * Next), drawn twice: as the desktop table and as the phone cards. Each
 * role query after a re-render walks every node, so the test needs more
 * than vitest's 5s default when the whole monorepo runs in parallel.
 */
const FULL_PAGE_TIMEOUT_MS = 20_000;
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/copies",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => false }));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../../reference/api", () => ({ useLookup: () => new Map() }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("./library-title-name", () => ({
  LibraryTitleName: ({ titleId }: { titleId: string }) => titleId,
}));
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

  it(
    "requests the second page at offset 50 and keeps it in the URL",
    async () => {
      const user = userEvent.setup();
      render(<CopiesBrowserView />);

      expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50, offset: 0 }),
      );
      await user.click(screen.getByRole("button", { name: "Ke halaman berikutnya" }));

      expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50, offset: 50 }),
      );
      expect(new URLSearchParams(window.location.search).get("page")).toBe("2");
    },
    FULL_PAGE_TIMEOUT_MS,
  );

  it("returns to the first page when a filter changes", async () => {
    // The reset follows the filter, not the rows: one copy is enough.
    mocks.useLibraryCopiesFilteredQuery.mockReturnValue({
      data: { data: copies(1) },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/library/copies?page=4");
    const user = userEvent.setup();
    render(<CopiesBrowserView />);
    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 150 }),
    );

    await user.click(screen.getByRole("button", { name: "filters.category" }));
    await user.click(await screen.findByRole("button", { name: "Fiksi" }));

    expect(mocks.useLibraryCopiesFilteredQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: "cat-fiction", limit: 50, offset: 0 }),
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("1");
  });
});
