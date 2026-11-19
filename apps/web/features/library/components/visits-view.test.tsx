import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pickDate } from "../../../test/pick-date";

const mocks = vi.hoisted(() => ({
  useLibraryVisitsQuery: vi.fn(),
  now: new Date("2026-09-15T02:00:00Z"),
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
  // 2026-09-15T09:00 in Asia/Jakarta (UTC+7).
  businessNow: () => mocks.now,
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
    mocks.now = new Date("2026-09-15T02:00:00Z");
    mocks.useLibraryVisitsQuery.mockReset();
    mocks.useLibraryVisitsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/library/visits");
  });

  it("sets a date range from the two date pickers and writes both bounds to the URL", async () => {
    const user = userEvent.setup();
    render(<VisitsView />);

    await user.click(screen.getByRole("button", { name: /^dateRange/ }));
    await pickDate(user, "fromLabel", "2026-08-01");
    await pickDate(user, "toLabel", "2026-08-15");

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

  it("defaults the range to the first of the school's month through today, not the previous day", () => {
    render(<VisitsView />);

    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith(
      "2026-09-01T00:00:00Z",
      "2026-09-15T23:59:59Z",
      { limit: 50, offset: 0 },
    );
  });

  it("uses the school's calendar day when it differs from the UTC day", () => {
    // 2026-09-01T00:30 in Asia/Jakarta, still 31 August in UTC.
    mocks.now = new Date("2026-08-31T17:30:00Z");
    render(<VisitsView />);

    expect(mocks.useLibraryVisitsQuery).toHaveBeenLastCalledWith(
      "2026-09-01T00:00:00Z",
      "2026-09-01T23:59:59Z",
      { limit: 50, offset: 0 },
    );
  });
});

// A visit's time went through its own Intl formatter, without a year, so a
// visit from an earlier year read like this year's. It now uses the shared
// short date-time: the year shows outside the school's current one.
describe("VisitsView visit time", () => {
  beforeEach(() => {
    mocks.now = new Date("2026-09-15T02:00:00Z");
    window.history.replaceState(null, "", "/library/visits");
  });

  it("prints the shared short date-time in the school's zone, with the year only when it differs", () => {
    mocks.useLibraryVisitsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: "v1",
            visitor_name: "Tamu Satu",
            kind: "non_member",
            group_size: 1,
            source: "manual",
            // 21.34 UTC on the 14th is 04.34 on the 15th in Jakarta (UTC+7).
            visited_at: "2026-09-14T21:34:00Z",
          },
          {
            id: "v2",
            visitor_name: "Tamu Dua",
            kind: "non_member",
            group_size: 1,
            source: "manual",
            visited_at: "2025-09-15T09:32:00Z",
          },
        ],
      },
      isLoading: false,
    });
    render(<VisitsView />);

    expect(screen.getAllByText("15 Sep 04.34").length).toBeGreaterThan(0);
    expect(screen.getAllByText("15 Sep 2025 16.32").length).toBeGreaterThan(0);
  });
});
