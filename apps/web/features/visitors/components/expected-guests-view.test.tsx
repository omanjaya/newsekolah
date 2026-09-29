import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useExpectedGuestsQuery: vi.fn(),
  canManage: true,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/visitors/expected",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canManage }));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
  useLookup: () => new Map(),
}));
vi.mock("../api", () => ({
  useExpectedGuestsQuery: mocks.useExpectedGuestsQuery,
  useCancelExpectedGuestMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
});
