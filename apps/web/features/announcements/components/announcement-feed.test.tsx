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

it("opens, reads and scrolls to the announcement a notification focuses", () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  query.mockReturnValue({
    data: { data: [item({ id: "a1", title: "Lain" }), item({ id: "a2", title: "Fokus" })] },
    isLoading: false,
    isError: false,
  });
  render(<AnnouncementFeed focusId="a2" />);

  expect(screen.getByTestId("announcement-feed-card-a2")).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByTestId("announcement-feed-card-a1")).toHaveAttribute("aria-expanded", "false");
  expect(markRead).toHaveBeenCalledTimes(1);
  expect(markRead).toHaveBeenCalledWith("a2");
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("focusMissingTitle")).not.toBeInTheDocument();
});

it("opens the next announcement a notification focuses while the feed stays mounted", () => {
  Element.prototype.scrollIntoView = vi.fn();
  query.mockReturnValue({
    data: { data: [item({ id: "a1", title: "Pertama" }), item({ id: "a2", title: "Kedua" })] },
    isLoading: false,
    isError: false,
  });
  const { rerender } = render(<AnnouncementFeed focusId="a1" />);
  expect(screen.getByTestId("announcement-feed-card-a1")).toHaveAttribute("aria-expanded", "true");

  rerender(<AnnouncementFeed focusId="a2" />);

  expect(screen.getByTestId("announcement-feed-card-a2")).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByTestId("announcement-feed-card-a1")).toHaveAttribute("aria-expanded", "false");
  expect(markRead).toHaveBeenCalledWith("a2");
});

it("scrolls to the focused announcement without animation when motion is reduced", () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  const matchMedia = vi.fn((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  query.mockReturnValue({
    data: { data: [item({ id: "a1" })] },
    isLoading: false,
    isError: false,
  });
  try {
    render(<AnnouncementFeed focusId="a1" />);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("says calmly when the focused announcement is not in the feed, instead of a 404", () => {
  query.mockReturnValue({
    data: { data: [item({ id: "a1" })] },
    isLoading: false,
    isError: false,
  });
  render(<AnnouncementFeed focusId="not-yet-visible" />);

  expect(screen.getByText("focusMissingTitle")).toBeInTheDocument();
  expect(screen.getByTestId("announcement-feed-card-a1")).toBeInTheDocument();
  expect(markRead).not.toHaveBeenCalled();
});

it("keeps the notice beside the empty state when the feed is empty", () => {
  query.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
  render(<AnnouncementFeed focusId="gone" />);

  expect(screen.getByText("focusMissingTitle")).toBeInTheDocument();
  expect(screen.getByText("feedEmptyTitle")).toBeInTheDocument();
});

it("keeps an opened card's body inside the card instead of below its clipped edge", async () => {
  query.mockReturnValue({
    data: { data: [item({ id: "a1", body_html: "<p>Isi lengkap pengumuman.</p>" })] },
    isLoading: false,
    isError: false,
  });
  const user = userEvent.setup();
  render(<AnnouncementFeed />);

  await user.click(screen.getByTestId("announcement-feed-card-a1"));

  const card = screen.getByTestId("announcement-card-a1");
  const trigger = screen.getByTestId("announcement-feed-card-a1");
  const body = screen.getByText("Isi lengkap pengumuman.");
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(card).toContainElement(body);
  expect(body).toBeVisible();
  // jsdom has no layout, so the geometry is pinned by the classes. The
  // card clips (overflow-hidden) and fills its bento cell (h-full); a
  // percentage height on the trigger resolved to the whole card and put
  // the body past its bottom edge. The card stacks trigger and body as a
  // flex column, the trigger takes only the space left over (flex-1), and
  // the body never shrinks.
  expect(card).toHaveClass("overflow-hidden", "flex", "flex-col");
  expect(trigger).toHaveClass("flex-1");
  expect(trigger.className).not.toMatch(/(^|\s)(h|min-h)-(full|screen|\[)/);
  const content = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  expect(content?.parentElement).toBe(card);
  expect(content).toHaveClass("shrink-0");
});
