import { render, screen } from "@testing-library/react";
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

function visits(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `visit-${index}`,
    visitor_name: `Visitor ${index}`,
    kind: "individual",
    group_size: 1,
    source: "manual",
    visited_at: "2026-09-15T02:00:00Z",
  }));
}

describe("VisitsView paging", () => {
  beforeEach(() => {
    mocks.useLibraryVisitsQuery.mockReset();
    mocks.useLibraryVisitsQuery.mockReturnValue({ data: { data: visits(50) }, isLoading: false });
    window.history.replaceState(null, "", "/library/visits");
  });

  it("requests the second page at offset 50 and keeps it in the URL", async () => {
    const user = userEvent.setup();
    render(<VisitsView />);

    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      { limit: 50, offset: 0 },
    );
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      { limit: 50, offset: 50 },
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("2");
  });

  it("disables next on a short page", () => {
    mocks.useLibraryVisitsQuery.mockReturnValue({ data: { data: visits(3) }, isLoading: false });
    render(<VisitsView />);

    expect(screen.getByRole("button", { name: "next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "previous" })).toBeDisabled();
  });

  it("returns to the first page when the date range changes", async () => {
    window.history.replaceState(null, "", "/library/visits?page=3");
    const user = userEvent.setup();
    render(<VisitsView />);
    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      { limit: 50, offset: 100 },
    );

    await user.click(screen.getByRole("button", { name: /^dateRange/ }));
    await user.click(await screen.findByRole("button", { name: "today" }));

    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith(
      "2026-09-15T00:00:00Z",
      "2026-09-15T23:59:59Z",
      { limit: 50, offset: 0 },
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("1");
  });
});
