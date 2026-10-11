import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useLibraryVisitsQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/visits",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/simulation/clock", () => ({
  useSimulation: () => undefined,
  // 2026-09-15T09:00 in Asia/Jakarta (UTC+7).
  businessNow: () => new Date("2026-09-15T02:00:00Z"),
}));
vi.mock("../../reference/api", () => ({
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../visits-api", () => ({
  useLibraryVisitsQuery: mocks.useLibraryVisitsQuery,
  useLibraryVisitSummaryQuery: () => ({ data: undefined, isLoading: false }),
  useRecordLibraryVisitMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { VisitsView } from "./visits-view";

describe("VisitsView filters", () => {
  beforeEach(() => {
    mocks.useLibraryVisitsQuery.mockReset();
    mocks.useLibraryVisitsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/library/visits");
  });

  it("sets a date range from the two native date inputs and writes both bounds to the URL", async () => {
    const user = userEvent.setup();
    render(<VisitsView />);

    await user.click(screen.getByRole("button", { name: /^dateRange/ }));
    fireEvent.change(screen.getByLabelText("fromLabel"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("toLabel"), { target: { value: "2026-08-15" } });

    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith(
      "2026-08-01T00:00:00Z",
      "2026-08-15T23:59:59Z",
      { limit: 50, offset: 0 },
    );
    expect(new URLSearchParams(window.location.search).get("from")).toBe("2026-08-01");
    expect(new URLSearchParams(window.location.search).get("to")).toBe("2026-08-15");
  });

  it("applies a preset and closes the popover", async () => {
    const user = userEvent.setup();
    render(<VisitsView />);

    await user.click(screen.getByRole("button", { name: /^dateRange/ }));
    await user.click(await screen.findByRole("button", { name: "today" }));

    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith(
      "2026-09-15T00:00:00Z",
      "2026-09-15T23:59:59Z",
      { limit: 50, offset: 0 },
    );
  });
});
