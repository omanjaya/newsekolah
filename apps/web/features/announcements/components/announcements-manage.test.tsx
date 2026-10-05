import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAnnouncementsQuery: vi.fn(),
  canCreate: true,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/announcements/manage",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canCreate,
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

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useAnnouncementsQuery).toHaveBeenLastCalledWith("", "");
    expect(new URLSearchParams(window.location.search).get("status")).toBe("");
  });
});
