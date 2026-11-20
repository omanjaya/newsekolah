import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useViolationTypesQuery: vi.fn(),
  update: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
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

vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: mocks.toastSuccess, error: vi.fn() }) };
});

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
    mocks.toastSuccess.mockReset();
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
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalled();
    });
    const [, options] = mocks.toastSuccess.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(options.action.label).toBe("undo");
    options.action.onClick();
    await waitFor(() => {
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "t1", is_active: true }),
      );
    });
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
