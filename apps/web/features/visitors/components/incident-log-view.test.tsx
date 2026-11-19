import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dayRangeInZone, shiftIsoDate, todayInZone } from "../../../lib/tenant-date";
import { pickDate } from "../../../test/pick-date";

const mocks = vi.hoisted(() => ({
  useIncidentsQuery: vi.fn(),
  canManage: true,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/visitors/incidents",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManage,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../api", () => ({
  useIncidentsQuery: mocks.useIncidentsQuery,
  useIncidentQuery: () => ({ data: undefined, isLoading: false }),
  useCloseIncidentMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIncidentMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { IncidentLogView, SEVERITY_VARIANT } from "./incident-log-view";

describe("IncidentLogView filters", () => {
  beforeEach(() => {
    mocks.canManage = true;
    mocks.useIncidentsQuery.mockReset();
    mocks.useIncidentsQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    window.history.replaceState(null, "", "/visitors/incidents");
  });

  it("toggles the only-open filter directly and writes only_open=true to the URL", async () => {
    const user = userEvent.setup();
    render(<IncidentLogView />);

    const toggle = screen.getByRole("button", { name: "filters.onlyOpen" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(mocks.useIncidentsQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      false,
    );
    expect(new URLSearchParams(window.location.search).get("only_open")).toBe("true");
  });

  it("reads an initial only_open=true URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/visitors/incidents?only_open=true");
    render(<IncidentLogView />);

    expect(mocks.useIncidentsQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      false,
    );
    expect(screen.getByRole("button", { name: "filters.onlyOpen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clears the only-open filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/visitors/incidents?only_open=true");
    const user = userEvent.setup();
    render(<IncidentLogView />);

    // The default 30-day window is the page's own period, not a filter, so
    // the only-open pill carries the bar's one remove control.
    expect(screen.getAllByRole("button", { name: /^Hapus filter / })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Hapus filter filters.onlyOpen" }));
    expect(mocks.useIncidentsQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      true,
    );
    expect(new URLSearchParams(window.location.search).get("only_open")).toBeNull();
  });

  it("sets a date range from the two date pickers and writes both bounds to the URL", async () => {
    const user = userEvent.setup();
    render(<IncidentLogView />);

    await user.click(screen.getByRole("button", { name: /^filters\.dateRange/ }));
    await pickDate(user, "filters.from", "2026-09-01");
    await pickDate(user, "filters.to", "2026-09-15");

    expect(mocks.useIncidentsQuery).toHaveBeenLastCalledWith(
      "2026-08-31T17:00:00.000Z",
      "2026-09-15T16:59:59.999Z",
      true,
    );
    expect(new URLSearchParams(window.location.search).get("from")).toBe("2026-09-01");
    expect(new URLSearchParams(window.location.search).get("to")).toBe("2026-09-15");
  });
});

describe("IncidentLogView default period", () => {
  const query = () => new URLSearchParams(window.location.search);

  beforeEach(() => {
    mocks.canManage = true;
    mocks.useIncidentsQuery.mockReset();
    mocks.useIncidentsQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  // The pill used to show the last 30 days as an applied filter, with a
  // remove control and a toolbar Reset that did nothing.
  it("shows the last 30 days as the page's period, with nothing to clear", () => {
    window.history.replaceState(null, "", "/visitors/incidents");
    render(<IncidentLogView />);

    expect(screen.getByRole("button", { name: /^filters\.dateRange/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hapus filter filters.dateRange" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus semua filter" })).not.toBeInTheDocument();
  });

  it("returns to the default period from the toolbar's Reset", async () => {
    window.history.replaceState(
      null,
      "",
      "/visitors/incidents?from=2026-11-01&to=2026-11-10&only_open=true",
    );
    const user = userEvent.setup();
    render(<IncidentLogView />);
    const today = todayInZone("Asia/Jakarta");
    const period = dayRangeInZone(shiftIsoDate(today, -30), today, "Asia/Jakarta");
    const historyLength = window.history.length;

    // The toolbar's Reset comes before the filtered empty state's own.
    const [toolbarReset] = screen.getAllByRole("button", { name: "Hapus semua filter" });
    if (!toolbarReset) throw new Error("Missing the toolbar's Reset");
    await user.click(toolbarReset);

    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(historyLength + 1);
    expect(mocks.useIncidentsQuery).toHaveBeenLastCalledWith(period.from, period.to, true);
    expect(screen.queryByRole("button", { name: "Hapus semua filter" })).not.toBeInTheDocument();
  });

  it("returns to the default period from the date pill's remove control", async () => {
    window.history.replaceState(null, "", "/visitors/incidents?from=2030-01-01");
    const user = userEvent.setup();
    render(<IncidentLogView />);
    expect(mocks.useIncidentsQuery).toHaveBeenLastCalledWith(
      "2029-12-31T17:00:00.000Z",
      "2030-01-01T16:59:59.999Z",
      true,
    );

    await user.click(screen.getByRole("button", { name: "Hapus filter filters.dateRange" }));

    expect(query().has("from")).toBe(false);
    expect(query().has("to")).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Hapus filter filters.dateRange" }),
    ).not.toBeInTheDocument();
  });
});

describe("incident severity badges", () => {
  it("gives every severity its own signal, with critical as danger", () => {
    expect(SEVERITY_VARIANT).toEqual({
      low: "neutral",
      medium: "info",
      high: "warning",
      critical: "danger",
    });
  });
});

describe("IncidentLogView states", () => {
  beforeEach(() => {
    mocks.canManage = true;
    window.history.replaceState(null, "", "/visitors/incidents");
  });

  it("says a failed load failed, with a retry, instead of 'no incidents'", () => {
    mocks.useIncidentsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: vi.fn(),
    });
    render(<IncidentLogView />);
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("offers to record the first incident when the default window is empty", () => {
    mocks.useIncidentsQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<IncidentLogView />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "record" }).length).toBeGreaterThan(1);
  });
});
