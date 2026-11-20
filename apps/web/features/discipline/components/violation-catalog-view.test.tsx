import { Sheet, SheetContent } from "@newsekolah/ui";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useViolationTypesQuery: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/catalog",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useViolationTypesQuery: mocks.useViolationTypesQuery,
  useUpdateViolationTypeMutation: () => ({ mutateAsync: mocks.update, isPending: false }),
}));

import { ViolationCatalogView } from "./violation-catalog-view";

describe("ViolationCatalogView filters", () => {
  beforeEach(() => {
    mocks.useViolationTypesQuery.mockReset();
    mocks.useViolationTypesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/catalog");
  });

  it("toggles the include-inactive filter directly and writes include_inactive=true to the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationCatalogView />);

    const toggle = screen.getByRole("button", { name: "includeInactive" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(mocks.useViolationTypesQuery).toHaveBeenLastCalledWith(true);
    expect(new URLSearchParams(window.location.search).get("include_inactive")).toBe("true");
  });

  it("reads an initial include_inactive=true URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/discipline/catalog?include_inactive=true");
    render(<ViolationCatalogView />);

    expect(mocks.useViolationTypesQuery).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "includeInactive" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clears the include-inactive filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/discipline/catalog?include_inactive=true");
    const user = userEvent.setup();
    render(<ViolationCatalogView />);

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
    expect(mocks.useViolationTypesQuery).toHaveBeenLastCalledWith(false);
    expect(new URLSearchParams(window.location.search).get("include_inactive")).toBeNull();
  });
});

describe("ViolationCatalogView load failure", () => {
  it("shows the error with a retry instead of an empty catalog", async () => {
    const refetch = vi.fn();
    mocks.useViolationTypesQuery.mockReset();
    mocks.useViolationTypesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
      refetch,
    });
    const user = userEvent.setup();
    render(<ViolationCatalogView />);

    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("alert")).getByRole("button"));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("ViolationCatalogView status actions", () => {
  const active = {
    id: "t1",
    code: "LN01",
    name: "Membawa barang elektronik",
    points: 15,
    category: "general",
    is_active: true,
  };
  const inactive = { ...active, id: "t2", code: "NG01", name: "Nongkrong", is_active: false };

  beforeEach(() => {
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({});
    mocks.useViolationTypesQuery.mockReset();
    mocks.useViolationTypesQuery.mockReturnValue({
      data: { data: [active, inactive] },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/discipline/catalog");
  });

  it("deactivates a type instead of deleting it, with an undo", async () => {
    const user = userEvent.setup();
    render(<ViolationCatalogView />);

    const row = screen.getByRole("row", { name: /LN01/ });
    await user.click(within(row).getByRole("button", { name: "columns.actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "deactivate" }));

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith({
        id: "t1",
        code: "LN01",
        name: "Membawa barang elektronik",
        points: 15,
        category: "general",
        is_active: false,
      });
    });
    // The outcome and its undo sit in the view itself (inside the sheet's
    // focus trap), announced as a status, not only in a toast outside it.
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent('deactivated {"name":"Membawa barang elektronik"}');
    const undo = within(status).getByRole("button", { name: "undo" });

    // Reached and pressed with the keyboard alone.
    undo.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "t1", is_active: true }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        'activated {"name":"Membawa barang elektronik"}',
      );
    });
    expect(
      within(screen.getByRole("status")).queryByRole("button", { name: "undo" }),
    ).not.toBeInTheDocument();
  });

  it("reaches the undo by tabbing from the row's actions menu", async () => {
    const user = userEvent.setup();
    render(<ViolationCatalogView />);

    const row = screen.getByRole("row", { name: /LN01/ });
    await user.click(within(row).getByRole("button", { name: "columns.actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "deactivate" }));
    const status = await screen.findByRole("status");
    const undo = within(status).getByRole("button", { name: "undo" });

    // The notice sits before the table, so it is a backwards tab away.
    for (let i = 0; i < 20 && document.activeElement !== undo; i += 1) {
      await user.tab({ shift: true });
    }
    expect(undo).toHaveFocus();
  });

  it("keeps the outcome and its undo pinned in the sheet's scrolling body", async () => {
    // On a phone the reader scrolls the sheet to reach a type further down;
    // a notice in the normal flow above the table was then scrolled out of
    // view with its undo. jsdom does no layout, so this checks what makes it
    // stick in a browser: sticky at the top, as a direct child of the
    // sheet's scroller (sticky holds only within its parent).
    const user = userEvent.setup();
    render(
      <Sheet open>
        <SheetContent title="Katalog" side="right" size="lg">
          <ViolationCatalogView />
        </SheetContent>
      </Sheet>,
    );

    const row = screen.getByRole("row", { name: /LN01/ });
    await user.click(within(row).getByRole("button", { name: "columns.actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "deactivate" }));

    const status = await screen.findByRole("status");
    const notice = status.closest("[aria-live]");
    expect(notice).toHaveClass("sticky", "top-0");
    expect(notice?.parentElement).toHaveClass("dialog-body", "overflow-y-auto");
    expect(within(status).getByRole("button", { name: "undo" })).toBeVisible();
  });

  it("offers to switch an inactive type back on", async () => {
    const user = userEvent.setup();
    render(<ViolationCatalogView />);

    const row = screen.getByRole("row", { name: /NG01/ });
    await user.click(within(row).getByRole("button", { name: "columns.actions" }));
    expect(screen.queryByRole("menuitem", { name: "deactivate" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "activate" }));

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "t2", code: "NG01", is_active: true }),
      );
    });
  });
});
