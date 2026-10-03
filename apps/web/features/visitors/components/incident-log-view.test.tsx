import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { IncidentLogView } from "./incident-log-view";

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

    // The date range filter defaults to a non-empty 30-day window, so it is
    // always "active" too; its own remove button uses the same (untranslated,
    // mocked) label. The only-open pill is the first one in the bar.
    const onlyOpenRemove = screen.getAllByRole("button", { name: "filters.removeFilter" })[0];
    if (!onlyOpenRemove) throw new Error("Missing only-open filter's remove control");
    await user.click(onlyOpenRemove);
    expect(mocks.useIncidentsQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      true,
    );
    expect(new URLSearchParams(window.location.search).get("only_open")).toBe("");
  });

  it("sets a date range from the two native date inputs and writes both bounds to the URL", async () => {
    const user = userEvent.setup();
    render(<IncidentLogView />);

    await user.click(screen.getByRole("button", { name: /^filters\.dateRange/ }));
    fireEvent.change(screen.getByLabelText("filters.from"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("filters.to"), { target: { value: "2026-09-15" } });

    expect(mocks.useIncidentsQuery).toHaveBeenLastCalledWith(
      "2026-09-01T00:00:00Z",
      "2026-09-15T23:59:59Z",
      true,
    );
    expect(new URLSearchParams(window.location.search).get("from")).toBe("2026-09-01");
    expect(new URLSearchParams(window.location.search).get("to")).toBe("2026-09-15");
  });
});
