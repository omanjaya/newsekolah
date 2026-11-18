import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useExtracurricularsQuery: vi.fn(),
  canManage: true,
  push: vi.fn(),
}));

vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/activities/clubs",
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManage,
  useSession: () => ({ me: undefined }),
}));
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

describe("ClubsView rows", () => {
  beforeEach(() => {
    mocks.canManage = true;
    mocks.push.mockReset();
    mocks.useExtracurricularsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: "club-1",
            academic_year_id: "year-1",
            name: "Pramuka",
            description: "",
            location: "",
            capacity: 30,
            meeting_day: 5,
            meeting_start: "15:00",
            meeting_end: "16:30",
            is_active: true,
          },
        ],
      },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/activities/clubs");
  });

  it("opens the club from its row and keeps edit and delete in the row's menu", async () => {
    const user = userEvent.setup();
    render(<ClubsView />);
    const table = within(screen.getByRole("table"));

    expect(table.queryByRole("button", { name: "edit" })).not.toBeInTheDocument();
    expect(table.getByRole("button", { name: "rowActions" })).toBeInTheDocument();
    expect(table.getByText("weekdays.friday, 15.00 – 16.30")).toBeInTheDocument();

    await user.click(table.getByText("Pramuka"));
    expect(mocks.push).toHaveBeenCalledWith("/activities/clubs/club-1");
  });
});
