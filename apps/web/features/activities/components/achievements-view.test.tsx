import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAchievementsQuery: vi.fn(),
  canManage: true,
}));

vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) =>
    ({ "levels.national": "Nasional", "levels.city": "Kota" })[key] ?? key,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/activities/achievements",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManage,
  useSession: () => ({ me: undefined }),
}));
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
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () =>
    new Map([
      ["student-1", { id: "student-1", name: "Siswa Contoh" }],
      ["student-2", { id: "student-2", name: "Budi Santoso" }],
    ]),
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

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
    expect(mocks.useAchievementsQuery).toHaveBeenLastCalledWith(undefined, undefined);
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("");
  });

  it("writes the date as a date and keeps edit and delete in the row's menu", () => {
    mocks.useAchievementsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            student_user_id: "student-1",
            competition_name: "Olimpiade Sains",
            level: "city",
            placement: "Juara 1",
            achieved_on: "2026-11-17",
          },
        ],
      },
      isLoading: false,
    });
    render(<AchievementsView />);
    const table = within(screen.getByRole("table"));

    expect(table.getByText("17 November 2026")).toBeInTheDocument();
    expect(table.queryByText("2026-11-17")).not.toBeInTheDocument();
    expect(table.queryByRole("button", { name: "edit" })).not.toBeInTheDocument();
    expect(table.getByRole("button", { name: "rowActions" })).toBeInTheDocument();
  });
});

describe("AchievementsView search and empty states", () => {
  beforeEach(() => {
    mocks.canManage = true;
    mocks.useAchievementsQuery.mockReset();
    window.history.replaceState(null, "", "/activities/achievements");
  });

  const rows = [
    {
      id: "a1",
      student_user_id: "student-1",
      competition_name: "Olimpiade Sains",
      level: "city",
      placement: "Juara 1",
      achieved_on: "2026-11-17",
    },
    {
      id: "a2",
      student_user_id: "student-2",
      competition_name: "Lomba Pidato",
      level: "national",
      placement: "Juara 2",
      achieved_on: "2026-10-01",
    },
  ];

  it("finds a row by the student's name and by the level's label", async () => {
    mocks.useAchievementsQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    const user = userEvent.setup();
    render(<AchievementsView />);
    const search = screen.getByRole("searchbox");

    await user.type(search, "Budi");
    const table = () => within(screen.getByRole("table"));
    await waitFor(() => {
      expect(table().queryByText("Olimpiade Sains")).not.toBeInTheDocument();
    });
    expect(table().getByText("Lomba Pidato")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "Kota");
    await waitFor(() => {
      expect(table().queryByText("Lomba Pidato")).not.toBeInTheDocument();
    });
    expect(table().getByText("Olimpiade Sains")).toBeInTheDocument();
  });

  it("shows the first-use state with no class chosen", () => {
    mocks.useAchievementsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<AchievementsView />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });

  it("shows a filtered empty state with a reset when the chosen class has none", async () => {
    window.history.replaceState(null, "", "/activities/achievements?class_id=class-7a");
    mocks.useAchievementsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    const user = userEvent.setup();
    render(<AchievementsView />);

    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    expect(screen.getByText("Tidak ada yang cocok")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hapus filter" }));
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("");
  });
});
