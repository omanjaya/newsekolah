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
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Makassar" }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../reference/api", () => ({
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../violations-api", () => ({
  useLibraryViolationsQuery: mocks.useLibraryViolationsQuery,
  useMemberViolationsQuery: () => ({ data: { data: [] }, isLoading: false }),
  useCreateLibraryViolationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSettleLibraryViolationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import type { LibraryViolation } from "../violations-api";

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
    await user.click(await screen.findByRole("button", { name: "statusFilter.paid" }));

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
      screen.getByRole("button", { name: "filters.status: statusFilter.unpaid" }),
    ).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/library/violations?kind=damaged");
    const user = userEvent.setup();
    render(<ViolationsView />);

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
    expect(mocks.useLibraryViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "" }),
      true,
    );
    expect(new URLSearchParams(window.location.search).get("kind")).toBeNull();
  });
});

describe("ViolationsView settlement wording", () => {
  const suspension = {
    id: "v-suspend",
    member_user_id: "u1",
    kind: "damaged",
    penalty: "suspend",
    amount: 0,
    suspend_days: 3,
    status: "unpaid",
  } as LibraryViolation;
  const fine = {
    id: "v-fine",
    member_user_id: "u2",
    kind: "late",
    penalty: "fine",
    amount: 5000,
    suspend_days: 0,
    status: "unpaid",
  } as LibraryViolation;

  beforeEach(() => {
    mocks.canRecord = true;
    mocks.useLibraryViolationsQuery.mockReset();
    window.history.replaceState(null, "", "/library/violations");
  });

  // A suspension owes nothing: its row must not read "Belum dibayar" nor
  // offer "Tandai lunas", while a fine keeps both.
  it("labels an unsettled suspension as open and offers to mark it settled", async () => {
    mocks.useLibraryViolationsQuery.mockReturnValue({
      data: { data: [suspension] },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<ViolationsView />);

    expect(screen.getAllByText("status.open").length).toBeGreaterThan(0);
    expect(screen.queryByText("status.unpaid")).not.toBeInTheDocument();

    const menuButton = screen.getAllByRole("button", { name: "rowActions" })[0];
    if (!menuButton) throw new Error("Missing violation row actions menu");
    await user.click(menuButton);
    expect(await screen.findByRole("menuitem", { name: "markDone" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "markPaid" })).not.toBeInTheDocument();
  });

  it("keeps the money wording for a fine", async () => {
    mocks.useLibraryViolationsQuery.mockReturnValue({ data: { data: [fine] }, isLoading: false });
    const user = userEvent.setup();
    render(<ViolationsView />);

    expect(screen.getAllByText("status.unpaid").length).toBeGreaterThan(0);

    const menuButton = screen.getAllByRole("button", { name: "rowActions" })[0];
    if (!menuButton) throw new Error("Missing violation row actions menu");
    await user.click(menuButton);
    expect(await screen.findByRole("menuitem", { name: "markPaid" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "markDone" })).not.toBeInTheDocument();
  });
});
