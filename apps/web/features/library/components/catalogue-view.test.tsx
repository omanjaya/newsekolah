import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useLibraryTitlesQuery: vi.fn(),
  canManage: true,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/catalogue",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canManage }));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../api", () => ({
  useLibraryTitlesQuery: mocks.useLibraryTitlesQuery,
  useDeleteLibraryTitleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  downloadLibraryCatalogueExportXlsx: vi.fn(),
}));
vi.mock("../master-data-api", () => ({
  useLibraryCatalogueOptionsQuery: () => ({
    data: {
      material_types: [
        { id: "type-book", name: "Buku" },
        { id: "type-magazine", name: "Majalah" },
      ],
      ddc_classes: [
        { code: "000", name: "Karya Umum" },
        { code: "800", name: "Kesusastraan" },
      ],
    },
    isLoading: false,
  }),
}));

import { CatalogueView } from "./catalogue-view";

describe("CatalogueView filters", () => {
  beforeEach(() => {
    mocks.canManage = true;
    mocks.useLibraryTitlesQuery.mockReset();
    mocks.useLibraryTitlesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/library/catalogue");
  });

  it("passes the chosen material type to the titles query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<CatalogueView />);

    await user.click(screen.getByRole("button", { name: "filters.materialType" }));
    await user.click(await screen.findByRole("button", { name: "Buku" }));

    expect(mocks.useLibraryTitlesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ materialTypeId: "type-book" }),
    );
    expect(new URLSearchParams(window.location.search).get("material_type")).toBe("type-book");
  });

  it("passes the chosen DDC classification to the titles query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<CatalogueView />);

    await user.click(screen.getByRole("button", { name: "filters.classification" }));
    await user.click(await screen.findByRole("button", { name: "800 — Kesusastraan" }));

    expect(mocks.useLibraryTitlesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ ddcClass: "800" }),
    );
    expect(new URLSearchParams(window.location.search).get("ddc_class")).toBe("800");
  });

  it("toggles the availability filter directly and writes availability=available to the URL", async () => {
    const user = userEvent.setup();
    render(<CatalogueView />);

    const toggle = screen.getByRole("button", { name: "filters.availability" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(mocks.useLibraryTitlesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ availability: "available" }),
    );
    expect(new URLSearchParams(window.location.search).get("availability")).toBe("available");
  });

  it("reads an initial sort=newest URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/library/catalogue?sort=newest");
    render(<CatalogueView />);

    expect(mocks.useLibraryTitlesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "newest" }),
    );
    expect(
      screen.getByRole("button", { name: "filters.sort: filters.sortNewest" }),
    ).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/library/catalogue?availability=available");
    const user = userEvent.setup();
    render(<CatalogueView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useLibraryTitlesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ availability: "" }),
    );
    expect(new URLSearchParams(window.location.search).get("availability")).toBe("");
  });

  it("consolidates header actions into a single row with a Lainnya menu", async () => {
    const user = userEvent.setup();
    render(<CatalogueView />);

    expect(screen.getByRole("button", { name: "addTitle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "exportCatalogue" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "importBooks" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByRole("menuitem", { name: "importBooks" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "catalogueSettings" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "report" })).toBeInTheDocument();
  });
});
