import { render, screen } from "@testing-library/react";
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
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canManage }));
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

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useIncidentsQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      true,
    );
    expect(new URLSearchParams(window.location.search).get("only_open")).toBe("");
  });
});
