import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAchievementsQuery: vi.fn(),
  canManage: true,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/activities/achievements",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canManage }));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: {
      data: [
        { id: "class-7a", name: "7A" },
        { id: "class-7b", name: "7B" },
      ],
    },
    isLoading: false,
  }),
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("../api", () => ({
  useAchievementsQuery: mocks.useAchievementsQuery,
  useCreateAchievementMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAchievementMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAchievementMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AchievementsView } from "./achievements-view";

describe("AchievementsView filters", () => {
  beforeEach(() => {
    mocks.canManage = true;
    mocks.useAchievementsQuery.mockReset();
    mocks.useAchievementsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/activities/achievements");
  });

  it("passes the chosen class to the achievements query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<AchievementsView />);

    await user.click(screen.getByRole("button", { name: "filters.class" }));
    await user.click(await screen.findByRole("button", { name: "7B" }));

    expect(mocks.useAchievementsQuery).toHaveBeenLastCalledWith(undefined, "class-7b");
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("class-7b");
  });

  it("clears the class filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/activities/achievements?class_id=class-7a");
    const user = userEvent.setup();
    render(<AchievementsView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useAchievementsQuery).toHaveBeenLastCalledWith(undefined, undefined);
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("");
  });
});
