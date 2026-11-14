import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useExpectedGuestsQuery: vi.fn(),
  canManage: true,
  cancel: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/visitors/expected",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManage,
  useSession: () => ({ me: undefined }),
}));
vi.mock("../../reference/api", () => ({
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../api", () => ({
  useExpectedGuestsQuery: mocks.useExpectedGuestsQuery,
  useCancelExpectedGuestMutation: () => ({ mutate: mocks.cancel, isPending: false }),
}));

import { ExpectedGuestsView } from "./expected-guests-view";

describe("ExpectedGuestsView filters", () => {
  beforeEach(() => {
    mocks.canManage = true;
    mocks.useExpectedGuestsQuery.mockReset();
    mocks.useExpectedGuestsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/visitors/expected");
  });

  it("toggles the only-pending filter directly and writes only_pending=true to the URL", async () => {
    const user = userEvent.setup();
    render(<ExpectedGuestsView />);

    const toggle = screen.getByRole("button", { name: "filters.onlyPending" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(mocks.useExpectedGuestsQuery).toHaveBeenLastCalledWith(expect.any(String), false);
    expect(new URLSearchParams(window.location.search).get("only_pending")).toBe("true");
  });

  it("reads an initial only_pending=true URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/visitors/expected?only_pending=true");
    render(<ExpectedGuestsView />);

    expect(mocks.useExpectedGuestsQuery).toHaveBeenLastCalledWith(expect.any(String), false);
    expect(screen.getByRole("button", { name: "filters.onlyPending" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clears the only-pending filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/visitors/expected?only_pending=true");
    const user = userEvent.setup();
    render(<ExpectedGuestsView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useExpectedGuestsQuery).toHaveBeenLastCalledWith(expect.any(String), true);
    expect(new URLSearchParams(window.location.search).get("only_pending")).toBe("");
  });

  const pendingGuest = {
    id: "g1",
    full_name: "Pak Made",
    organization: "Dinas",
    host_user_id: "u1",
    status: "pending",
    purpose: "Rapat",
  };

  it("confirms before cancelling an expected guest and names the guest", async () => {
    mocks.cancel.mockReset();
    mocks.useExpectedGuestsQuery.mockReturnValue({
      data: { data: [pendingGuest] },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<ExpectedGuestsView />);

    // Withdrawing is the row's destructive action, kept in its menu.
    await user.click(screen.getByRole("button", { name: "rowActions" }));
    await user.click(screen.getByRole("menuitem", { name: "cancel" }));
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(await screen.findByText("cancelDialog.body")).toBeInTheDocument();
  });

  it("shows the visit's purpose so the guard knows why the guest came", () => {
    mocks.useExpectedGuestsQuery.mockReturnValue({
      data: { data: [pendingGuest] },
      isLoading: false,
    });
    render(<ExpectedGuestsView />);
    expect(screen.getAllByText("Rapat").length).toBeGreaterThan(0);
  });

  it("hides the empty actions column from a read-only reader", () => {
    mocks.canManage = false;
    mocks.useExpectedGuestsQuery.mockReturnValue({
      data: { data: [pendingGuest] },
      isLoading: false,
    });
    render(<ExpectedGuestsView />);
    expect(screen.queryByRole("columnheader", { name: "columns.actions" })).not.toBeInTheDocument();
  });

  it("shows a retry control instead of the empty state when loading fails", () => {
    mocks.useExpectedGuestsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: vi.fn(),
    });
    render(<ExpectedGuestsView />);
    // The table's own error state, with its retry, stands in for the rows.
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });
});
