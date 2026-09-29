import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useLibraryViolationsQuery: vi.fn(),
  canRecord: true,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/violations",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canRecord }));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
  useLookup: () => new Map(),
}));
vi.mock("../violations-api", () => ({
  useLibraryViolationsQuery: mocks.useLibraryViolationsQuery,
  useMemberViolationsQuery: () => ({ data: { data: [] }, isLoading: false }),
  useCreateLibraryViolationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSettleLibraryViolationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ViolationsView } from "./violations-view";

describe("ViolationsView filters", () => {
  beforeEach(() => {
    mocks.canRecord = true;
    mocks.useLibraryViolationsQuery.mockReset();
    mocks.useLibraryViolationsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/library/violations");
  });

  it("passes the chosen status to the violations query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationsView />);

    await user.click(screen.getByRole("button", { name: "filters.status" }));
    await user.click(await screen.findByRole("button", { name: "status.paid" }));

    expect(mocks.useLibraryViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "paid" }),
      true,
    );
    expect(new URLSearchParams(window.location.search).get("status")).toBe("paid");
  });

  it("passes the chosen kind to the violations query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationsView />);

    await user.click(screen.getByRole("button", { name: "filters.kind" }));
    await user.click(await screen.findByRole("button", { name: "kinds.lost" }));

    expect(mocks.useLibraryViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "lost" }),
      true,
    );
    expect(new URLSearchParams(window.location.search).get("kind")).toBe("lost");
  });

  it("reads an initial status=unpaid URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/library/violations?status=unpaid");
    render(<ViolationsView />);

    expect(mocks.useLibraryViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "unpaid" }),
      true,
    );
    expect(
      screen.getByRole("button", { name: "filters.status: status.unpaid" }),
    ).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/library/violations?kind=damaged");
    const user = userEvent.setup();
    render(<ViolationsView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useLibraryViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "" }),
      true,
    );
    expect(new URLSearchParams(window.location.search).get("kind")).toBe("");
  });
});
