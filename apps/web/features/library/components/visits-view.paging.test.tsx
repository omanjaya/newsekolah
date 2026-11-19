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
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
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
    await user.click(screen.getByRole("button", { name: "Ke halaman berikutnya" }));

    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      { limit: 50, offset: 50 },
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("2");
  });

  it("shows the row count instead of a pager on a single short page", () => {
    mocks.useLibraryVisitsQuery.mockReturnValue({ data: { data: visits(3) }, isLoading: false });
    render(<VisitsView />);

    expect(screen.queryByRole("button", { name: "Ke halaman berikutnya" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ke halaman sebelumnya" })).not.toBeInTheDocument();
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

    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith("2026-09-15", "2026-09-15", {
      limit: 50,
      offset: 0,
    });
    // Back on the first page the param is gone, not `?page=1`.
    expect(new URLSearchParams(window.location.search).has("page")).toBe(false);
  });

  // Removing the date pill ended on /library/visits?page=1, not a clean URL.
  it("leaves a clean URL when the date range is cleared back to the page's period", async () => {
    window.history.replaceState(null, "", "/library/visits?from=2026-09-05&to=2026-09-10");
    const user = userEvent.setup();
    render(<VisitsView />);
    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith("2026-09-05", "2026-09-10", {
      limit: 50,
      offset: 0,
    });

    await user.click(screen.getByRole("button", { name: "Hapus filter dateRange" }));

    expect(window.location.pathname + window.location.search).toBe("/library/visits");
  });
});
