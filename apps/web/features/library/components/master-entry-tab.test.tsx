import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MasterEntryTab } from "./master-entry-tab";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
}));

vi.mock("../use-library-error-message", () => ({
  useLibraryErrorMessage: () => (code: string) => code,
}));

const mutation = { mutate: vi.fn(), isPending: false } as never;
const NS = "app.library.masterData.locations";

function renderTab(items: { id: string; code: string; name: string }[]) {
  render(
    <MasterEntryTab
      namespace={NS}
      stateKey="test:locations"
      items={items.map((item) => ({ ...item, sort_order: 0, is_active: true }))}
      isLoading={false}
      create={mutation}
      update={mutation}
      remove={mutation}
    />,
  );
}

describe("MasterEntryTab", () => {
  it("puts the add action on the list's heading, not in the table toolbar", () => {
    renderTab([{ id: "l1", code: "R1", name: "Rak depan" }]);

    expect(
      screen.getByRole("heading", { name: "app.library.masterData.tabs.locations" }),
    ).toBeInTheDocument();
    const add = screen.getByRole("button", { name: `${NS}.add` });
    // A small secondary button on the heading's line: in the toolbar it took
    // a full-width row above the search on a phone.
    expect(add.closest("[data-slot=data-table-toolbar]")).toBeNull();
    expect(add).not.toHaveClass("bg-accent");
  });

  it("leaves the add action to the empty state while the list is empty", () => {
    renderTab([]);

    expect(screen.getAllByRole("button", { name: `${NS}.add` })).toHaveLength(1);
    expect(screen.getByText(`${NS}.emptyTitle`)).toBeInTheDocument();
  });
});
