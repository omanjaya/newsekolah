import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useLibraryViolationsQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/violations",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => false }));
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

import { ViolationsView } from "./violations-view";

function violations(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `violation-${index}`,
    member_user_id: `member-${index}`,
    kind: "late",
    penalty: "warning",
    amount: 0,
    suspend_days: 0,
    status: "paid",
    created_at: "2026-09-15T02:00:00Z",
  }));
}

describe("ViolationsView paging", () => {
  beforeEach(() => {
    mocks.useLibraryViolationsQuery.mockReset();
    mocks.useLibraryViolationsQuery.mockReturnValue({
      data: { data: violations(50) },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/library/violations");
  });

  it("requests the second page at offset 50 and keeps it in the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationsView />);

    expect(mocks.useLibraryViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
      true,
    );
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(mocks.useLibraryViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 50 }),
      true,
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("2");
  });

  it("returns to the first page when a filter changes", async () => {
    window.history.replaceState(null, "", "/library/violations?page=3");
    const user = userEvent.setup();
    render(<ViolationsView />);

    await user.click(screen.getByRole("button", { name: "filters.status" }));
    await user.click(await screen.findByRole("button", { name: "status.paid" }));

    expect(mocks.useLibraryViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "paid", limit: 50, offset: 0 }),
      true,
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("1");
  });

  it("hides the pager for a single member's violations", () => {
    render(<ViolationsView memberUserId="member-1" />);

    expect(screen.queryByRole("button", { name: "next" })).not.toBeInTheDocument();
  });
});
