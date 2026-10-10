import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { NotificationBell } from "./notification-bell";

const unreadCount = vi.hoisted(() => vi.fn());
const myAnnouncements = vi.hoisted(() => vi.fn());
const markRead = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ status: "authenticated", me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../api", () => ({
  useUnreadCountQuery: unreadCount,
  useNotificationsQuery: () => ({ data: { data: [] }, isLoading: false }),
  useMarkReadMutation: () => ({ mutate: vi.fn() }),
  useMarkAllReadMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../announcements/api", () => ({
  useMyAnnouncementsQuery: myAnnouncements,
  useMarkAnnouncementReadMutation: () => ({ mutate: markRead }),
}));

function announcement(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "a1",
    title: "Libur semester",
    body_html: "<p>Isi</p>",
    is_pinned: false,
    is_read: false,
    published_at: "2026-09-20T01:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  unreadCount.mockReset();
  myAnnouncements.mockReset();
  markRead.mockReset();
  unreadCount.mockReturnValue({ data: { count: 2 } });
  myAnnouncements.mockReturnValue({
    data: {
      data: [
        announcement({ id: "a1", title: "Libur semester", is_read: false }),
        announcement({ id: "a2", title: "Rapat orang tua", is_read: true }),
      ],
    },
    isLoading: false,
  });
});
afterEach(cleanup);

it("counts unread announcements together with unread notifications in the badge", () => {
  render(<NotificationBell />);
  expect(screen.getByRole("button", { name: "unreadTotal:3" })).toBeInTheDocument();
});

it("opens on the notifications tab and switches to the announcements list", async () => {
  const user = userEvent.setup();
  render(<NotificationBell />);
  await user.click(screen.getByRole("button", { name: "unreadTotal:3" }));

  expect(screen.getByRole("tab", { name: /tabNotifications/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  expect(screen.queryByText("Libur semester")).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: /tabAnnouncements/ }));

  expect(screen.getByText("Libur semester")).toBeInTheDocument();
  expect(screen.getByText("Rapat orang tua")).toBeInTheDocument();
  expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
});

it("marks only unread announcements and links to the full page", async () => {
  const user = userEvent.setup();
  render(<NotificationBell />);
  await user.click(screen.getByRole("button", { name: "unreadTotal:3" }));
  await user.click(screen.getByRole("tab", { name: /tabAnnouncements/ }));

  expect(screen.getAllByTestId("bell-announcement-unread")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "announcementsSeeAll" })).toHaveAttribute(
    "href",
    "/announcements",
  );

  await user.click(screen.getByRole("link", { name: /Rapat orang tua/ }));
  expect(markRead).not.toHaveBeenCalled();
});

it("shows the empty state when there are no announcements", async () => {
  myAnnouncements.mockReturnValue({ data: { data: [] }, isLoading: false });
  const user = userEvent.setup();
  render(<NotificationBell />);
  await user.click(screen.getByRole("button", { name: "unreadTotal:2" }));
  await user.click(screen.getByRole("tab", { name: /tabAnnouncements/ }));

  expect(screen.getByText("announcementsEmpty")).toBeInTheDocument();
});
