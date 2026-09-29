import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useExtracurricularsQuery: vi.fn(),
  canManage: true,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/activities/clubs",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canManage }));
vi.mock("../api", () => ({
  useExtracurricularsQuery: mocks.useExtracurricularsQuery,
  useDeleteExtracurricularMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ClubsView } from "./clubs-view";

describe("ClubsView filters", () => {
  beforeEach(() => {
    mocks.canManage = true;
    mocks.useExtracurricularsQuery.mockReset();
    mocks.useExtracurricularsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/activities/clubs");
  });

  it("toggles the include-inactive filter directly and writes include_inactive=true to the URL", async () => {
    const user = userEvent.setup();
    render(<ClubsView />);

    const toggle = screen.getByRole("button", { name: "includeInactive" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(mocks.useExtracurricularsQuery).toHaveBeenLastCalledWith(true);
    expect(new URLSearchParams(window.location.search).get("include_inactive")).toBe("true");
  });

  it("reads an initial include_inactive=true URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/activities/clubs?include_inactive=true");
    render(<ClubsView />);

    expect(mocks.useExtracurricularsQuery).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "includeInactive" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clears the include-inactive filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/activities/clubs?include_inactive=true");
    const user = userEvent.setup();
    render(<ClubsView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useExtracurricularsQuery).toHaveBeenLastCalledWith(false);
    expect(new URLSearchParams(window.location.search).get("include_inactive")).toBe("");
  });
});
