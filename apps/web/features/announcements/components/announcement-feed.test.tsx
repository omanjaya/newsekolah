import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AnnouncementFeed } from "./announcement-feed";

const query = vi.hoisted(() => vi.fn());
const markRead = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../api", () => ({
  useMyAnnouncementsQuery: query,
  useMarkAnnouncementReadMutation: () => ({ mutate: markRead }),
}));

function item(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "a1",
    title: "Judul",
    body_html: "<p>Isi pengumuman yang cukup panjang untuk sebuah excerpt.</p>",
    is_pinned: false,
    is_read: false,
    published_at: "2026-09-20T01:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  query.mockReset();
  markRead.mockReset();
});
afterEach(cleanup);

it("renders the empty state when there are no announcements", () => {
  query.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
  render(<AnnouncementFeed />);
  expect(screen.getByText("feedEmptyTitle")).toBeInTheDocument();
});

it("renders every announcement as a bento card, pinned ones first", () => {
  query.mockReturnValue({
    data: {
      data: [
        item({ id: "a1", title: "Biasa", is_pinned: false }),
        item({ id: "a2", title: "Penting", is_pinned: true }),
      ],
    },
    isLoading: false,
    isError: false,
  });
  render(<AnnouncementFeed />);

  const grid = screen.getByTestId("announcement-feed-cards");
  expect(grid).toBeInTheDocument();
  const cards = screen.getAllByTestId(/^announcement-feed-card-/);
  expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
    "announcement-feed-card-a2",
    "announcement-feed-card-a1",
  ]);
});

it("spans the odd card out across the full row", () => {
  query.mockReturnValue({
    data: {
      data: [item({ id: "a1" }), item({ id: "a2" }), item({ id: "a3" })],
    },
    isLoading: false,
    isError: false,
  });
  render(<AnnouncementFeed />);

  const cells = screen.getAllByTestId(/^announcement-feed-cell-/);
  expect(cells).toHaveLength(3);
  expect(cells[2]?.className).toContain("lg:col-span-2");
  expect(cells[0]?.className).not.toContain("lg:col-span-2");
});

it("shows an unread dot for an unread item and marks it read on first expand", async () => {
  query.mockReturnValue({
    data: { data: [item({ id: "a1", is_read: false })] },
    isLoading: false,
    isError: false,
  });
  const user = userEvent.setup();
  render(<AnnouncementFeed />);

  expect(screen.getByTestId("announcement-unread-dot")).toBeInTheDocument();
  await user.click(screen.getByTestId("announcement-feed-card-a1"));
  expect(markRead).toHaveBeenCalledWith("a1");
});

it("does not show an unread dot for an already-read item", () => {
  query.mockReturnValue({
    data: { data: [item({ id: "a1", is_read: true })] },
    isLoading: false,
    isError: false,
  });
  render(<AnnouncementFeed />);
  expect(screen.queryByTestId("announcement-unread-dot")).not.toBeInTheDocument();
});

it("keeps the compact dashboard preview as a flat row list, not a card grid", () => {
  query.mockReturnValue({
    data: { data: [item({ id: "a1" }), item({ id: "a2" })] },
    isLoading: false,
    isError: false,
  });
  render(<AnnouncementFeed limit={3} compact />);

  expect(screen.queryByTestId("announcement-feed-cards")).not.toBeInTheDocument();
});
