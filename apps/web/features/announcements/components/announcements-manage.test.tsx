import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAnnouncementsQuery: vi.fn(),
  canCreate: true,
}));

vi.mock("next-intl", () => ({
  // A row's own title is kept in the label, so tests can tell rows apart.
  useTranslations: () => (key: string, values?: { title?: string }) =>
    values?.title ? `${key}:${values.title}` : key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/announcements/manage",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  // Every other permission is held; only drafting varies between tests.
  useCan: (code: string) => (code === "create_announcements" ? mocks.canCreate : true),
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../api", () => ({
  useAnnouncementsQuery: mocks.useAnnouncementsQuery,
  useAnnouncementTransitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAnnouncementMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AnnouncementsManage } from "./announcements-manage";

describe("AnnouncementsManage filters", () => {
  beforeEach(() => {
    mocks.canCreate = true;
    mocks.useAnnouncementsQuery.mockReset();
    mocks.useAnnouncementsQuery.mockReturnValue({
      data: { data: [], page: { next_cursor: "" } },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/announcements/manage");
  });

  it("passes the chosen status to the announcements query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<AnnouncementsManage creating={false} onCreatingChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "columns.status" }));
    await user.click(await screen.findByRole("button", { name: "status.published" }));

    expect(mocks.useAnnouncementsQuery).toHaveBeenLastCalledWith("published", "");
    expect(new URLSearchParams(window.location.search).get("status")).toBe("published");
  });

  it("reads an initial status=draft URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/announcements/manage?status=draft");
    render(<AnnouncementsManage creating={false} onCreatingChange={vi.fn()} />);

    expect(mocks.useAnnouncementsQuery).toHaveBeenLastCalledWith("draft", "");
    expect(
      screen.getByRole("button", { name: "columns.status: status.draft" }),
    ).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/announcements/manage?status=archived");
    const user = userEvent.setup();
    render(<AnnouncementsManage creating={false} onCreatingChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
    expect(mocks.useAnnouncementsQuery).toHaveBeenLastCalledWith("", "");
    expect(new URLSearchParams(window.location.search).get("status")).toBeNull();
  });
});

describe("AnnouncementsManage missed schedules", () => {
  function row(id: string, title: string, status: string, startsAt?: string) {
    return {
      id,
      title,
      status,
      starts_at: startsAt,
      audience: { type: "all" },
      created_at: "2026-11-01T00:00:00Z",
      recipient_count: 0,
    };
  }

  it("marks a draft whose start passed, and only that one", () => {
    mocks.useAnnouncementsQuery.mockReturnValue({
      data: {
        data: [
          row("a1", "Rapat orang tua", "draft", "2000-01-01T00:00:00Z"),
          row("a2", "Libur semester", "draft", "2999-01-01T00:00:00Z"),
          row("a3", "Upacara", "scheduled", "2999-01-01T00:00:00Z"),
        ],
        page: { next_cursor: "" },
      },
      isLoading: false,
    });
    render(<AnnouncementsManage creating={false} onCreatingChange={vi.fn()} />);

    // The table also renders a card list for narrow screens; check the table rows.
    const missedRows = screen
      .getAllByText("missedSchedule.label")
      .map((badge) => badge.closest("tr"))
      .filter((tr): tr is HTMLTableRowElement => tr !== null);
    expect(missedRows).toHaveLength(1);
    expect(missedRows[0]).toHaveTextContent("Rapat orang tua");
  });
});

describe("AnnouncementsManage empty and row states", () => {
  beforeEach(() => {
    mocks.canCreate = true;
    mocks.useAnnouncementsQuery.mockReset();
    window.history.replaceState(null, "", "/announcements/manage");
  });

  it("says nothing matches, with a reset, when a filter hides every row", async () => {
    mocks.useAnnouncementsQuery.mockReturnValue({
      data: { data: [], page: { next_cursor: "" } },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/announcements/manage?status=scheduled");
    const user = userEvent.setup();
    render(<AnnouncementsManage creating={false} onCreatingChange={vi.fn()} />);

    expect(screen.queryByText("manageEmptyTitle")).not.toBeInTheDocument();
    // FilteredEmptyState's own copy (the shared UiLabels default).
    expect(screen.getAllByText("Tidak ada yang cocok").length).toBeGreaterThan(0);
    // The list has a status filter but no search box.
    expect(screen.getAllByText("Ubah atau hapus filter yang aktif.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/kata kunci/)).not.toBeInTheDocument();
    const [reset] = screen.getAllByRole("button", { name: "Hapus semua filter" });
    if (!reset) throw new Error("no reset");
    await user.click(reset);
    expect(mocks.useAnnouncementsQuery).toHaveBeenLastCalledWith("", "");
  });

  it("keeps the first-use empty state when no filter is on", () => {
    mocks.useAnnouncementsQuery.mockReturnValue({
      data: { data: [], page: { next_cursor: "" } },
      isLoading: false,
    });
    render(<AnnouncementsManage creating={false} onCreatingChange={vi.fn()} />);
    expect(screen.getByText("manageEmptyTitle")).toBeInTheDocument();
  });

  it("does not ask a publisher who cannot draft to write one", () => {
    mocks.canCreate = false;
    mocks.useAnnouncementsQuery.mockReturnValue({
      data: { data: [], page: { next_cursor: "" } },
      isLoading: false,
    });
    render(<AnnouncementsManage creating={false} onCreatingChange={vi.fn()} />);
    expect(screen.getByText("publishEmptyTitle")).toBeInTheDocument();
    expect(screen.getByText("publishEmptyBody")).toBeInTheDocument();
    expect(screen.queryByText("manageEmptyBody")).not.toBeInTheDocument();
  });

  it("names each row's menu after its announcement, with delete set apart", async () => {
    mocks.useAnnouncementsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: "a1",
            title: "Rapat orang tua",
            status: "draft",
            audience: { type: "all" },
            created_at: "2026-11-01T00:00:00Z",
            recipient_count: 0,
          },
        ],
        page: { next_cursor: "" },
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<AnnouncementsManage creating={false} onCreatingChange={vi.fn()} />);

    const [trigger] = screen.getAllByRole("button", { name: "actions.menuFor:Rapat orang tua" });
    if (!trigger) throw new Error("no row menu");
    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "actions.edit" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "actions.delete" })).toBeInTheDocument();
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
  });
});
