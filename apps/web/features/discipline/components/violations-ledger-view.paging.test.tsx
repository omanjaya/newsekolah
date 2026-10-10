import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useViolationsQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/violations",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => false,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: { data: [{ id: "class-7a", name: "7A" }] },
    isLoading: false,
  }),
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
  useLookup: () => new Map(),
}));
vi.mock("../api", () => ({
  useViolationsQuery: mocks.useViolationsQuery,
  useIssueWarningLetterMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useVoidViolationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ViolationsLedgerView } from "./violations-ledger-view";

function records(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `record-${index}`,
    student_user_id: `student-${index}`,
    type_name: "Late",
    points: 5,
    occurred_on: "2026-09-10",
    is_voided: false,
  }));
}

describe("ViolationsLedgerView paging", () => {
  beforeEach(() => {
    mocks.useViolationsQuery.mockReset();
    mocks.useViolationsQuery.mockReturnValue({ data: { data: records(50) }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/violations");
  });

  it("requests the second page at offset 50 and keeps it in the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationsLedgerView />);

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(expect.anything(), {
      limit: 50,
      offset: 0,
      search: "",
    });
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(expect.anything(), {
      limit: 50,
      offset: 50,
      search: "",
    });
    expect(new URLSearchParams(window.location.search).get("ledger_page")).toBe("2");
  });

  it("returns to the first page when a filter changes", async () => {
    window.history.replaceState(null, "", "/discipline/violations?ledger_page=3");
    const user = userEvent.setup();
    render(<ViolationsLedgerView />);

    await user.click(screen.getByRole("button", { name: "filters.class" }));
    await user.click(await screen.findByRole("button", { name: "7A" }));

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7a" }),
      { limit: 50, offset: 0, search: "" },
    );
    expect(new URLSearchParams(window.location.search).get("ledger_page")).toBe("1");
  });

  it("sends the debounced search and returns to the first page", async () => {
    window.history.replaceState(null, "", "/discipline/violations?ledger_page=3");
    const user = userEvent.setup();
    render(<ViolationsLedgerView />);

    await user.type(screen.getByRole("searchbox", { name: "searchPlaceholder" }), "bud");

    await waitFor(() => {
      expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(expect.anything(), {
        limit: 50,
        offset: 0,
        search: "bud",
      });
    });
    const params = new URLSearchParams(window.location.search);
    expect(params.get("ledger_q")).toBe("bud");
    expect(params.get("ledger_page")).toBe("1");
  });
});
